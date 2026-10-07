// Turns a finished scenario into a lesson card: a verdict, what helped, what hurt and
// one-click suggestions that patch the architecture so the user can try again.
import { ASG, AZ_LABEL, BACKUP, BUDGET, LAMBDA, LEAK, OTHER_AZ, SQS } from './constants.js';

export const ACTION_TITLE = {
  quake: 'Động đất phá huỷ một AZ',
  serverFail: 'Một server bị hỏng',
  spike: '1 triệu người dùng ùa vào',
  dbFail: 'Database gặp sự cố',
  night: 'Đêm khuya vắng khách',
  ddos: 'Tấn công DDoS',
  sqlInjection: 'Tấn công SQL injection',
  paymentDown: 'Đối tác thanh toán sập',
  dataDelete: 'Xoá nhầm dữ liệu',
  leakedKey: 'Lộ access key',
  badDeploy: 'Deploy bản lỗi',
};

// what a private EC2 fleet without a NAT Gateway can no longer reach. Empty when nothing breaks:
// SQS takes the outside calls off the app tier, VPC Endpoints reach S3 and SQS privately.
export function natlessFailures(c) {
  const out = [];
  if (!c.queue) out.push('API thanh toán, email…');
  else if (!c.vpce) out.push('SQS');
  if (c.s3 && !c.vpce) out.push('S3');
  return out;
}

const pct = (x) => {
  const v = Math.max(0, Math.min(1, x)) * 100;
  return (v >= 99 && v < 100 ? v.toFixed(1) : Math.round(v)) + '%';
};
const money = (x) => '$' + (x < 1 ? x.toFixed(3) : x.toFixed(2));
const usd = (x) => '$' + Math.round(x).toLocaleString('vi-VN');
const num = (x) => Math.round(x).toLocaleString('vi-VN');

export function evaluateLesson(sc) {
  const cfg = sc.cfg;
  const flags = sc.flags;
  const points = [];
  const suggestions = [];
  const good = (text) => points.push({ kind: 'good', text });
  const bad = (text) => points.push({ kind: 'bad', text });
  const info = (text) => points.push({ kind: 'info', text });
  const suggest = (label, patch) => {
    if (!suggestions.some((s) => s.label === label)) suggestions.push({ label, patch });
  };
  const ec2 = cfg.compute === 'ec2';
  const fleet = cfg.ec2.a + cfg.ec2.b;

  switch (sc.action) {
    case 'quake': {
      const az = sc.az;
      const other = OTHER_AZ[az];
      if (ec2) {
        if (cfg.asg) {
          if (cfg.elb) {
            good(`Auto Scaling trải EC2 ra cả hai AZ; ELB phát hiện máy ở ${AZ_LABEL[az]} không phản hồi và chuyển traffic sang ${AZ_LABEL[other]}.`);
          } else {
            bad('Auto Scaling có tạo lại EC2 ở AZ còn lại, nhưng không có Load Balancer để dẫn người dùng tới đó.');
            suggest('Thêm Elastic Load Balancer', { elb: true });
          }
          if (flags.has('scaleOut') || flags.has('asgReplace')) {
            good(`Auto Scaling tự tạo EC2 mới ở ${AZ_LABEL[other]} để bù phần công suất bị mất.`);
          }
        } else {
          const lost = cfg.ec2[az];
          const left = cfg.ec2[other];
          if (left === 0) {
            bad(`Tất cả EC2 đều nằm ở ${AZ_LABEL[az]}: chỉ một trận động đất là toàn bộ website sập (điểm lỗi duy nhất).`);
            suggest(`Thêm EC2 ở ${AZ_LABEL[other]} + ELB`, { elb: true, ec2: { ...cfg.ec2, [other]: Math.max(1, lost) } });
          } else if (lost === 0) {
            good(`Không có EC2 nào ở ${AZ_LABEL[az]} nên tầng ứng dụng không bị ảnh hưởng.`);
          } else if (!cfg.elb) {
            if (sc.primaryAz === az) {
              bad(`Vẫn còn EC2 ở ${AZ_LABEL[other]}, nhưng không có Load Balancer: tên miền vẫn trỏ vào máy chủ đã hỏng.`);
            } else {
              info('Máy chủ chính nằm ở AZ còn lại nên may mắn không bị ảnh hưởng — nhưng không có gì tự động thay thế nếu nó hỏng.');
            }
            suggest('Thêm Elastic Load Balancer', { elb: true });
          } else {
            good(`ELB phát hiện EC2 ở ${AZ_LABEL[az]} không phản hồi (health check) và chuyển hết traffic sang ${AZ_LABEL[other]}.`);
          }
          if (lost > 0 && left > 0) {
            info('Không có Auto Scaling nên máy bị mất không được bù lại — hệ thống chỉ còn một phần công suất.');
            suggest('Bật Auto Scaling', { asg: true, elb: true });
          }
        }
      } else {
        good('API Gateway và Lambda là dịch vụ serverless chạy sẵn trên nhiều AZ — AWS tự né AZ bị sự cố.');
      }
      if (cfg.database === 'rds') {
        if (sc.dbPrimaryAz === az) {
          if (cfg.rdsMultiAz) {
            good(`RDS Multi-AZ tự failover sang bản standby ở ${AZ_LABEL[other]}; dữ liệu được đồng bộ liên tục nên không mất.`);
            info('Failover mất khoảng 1–2 phút ngoài thực tế (mô phỏng: 6 giây) — các request cần database bị lỗi trong lúc chuyển.');
          } else {
            bad(`RDS chỉ có một bản (Single-AZ) và nằm đúng ở ${AZ_LABEL[az]}: mất database, phải khôi phục từ backup sang AZ khác (lâu, có thể mất vài phút dữ liệu cuối).`);
            suggest('Bật RDS Multi-AZ', { rdsMultiAz: true });
          }
        } else if (cfg.rdsMultiAz) {
          info(`Chỉ mất bản standby ở ${AZ_LABEL[az]}; primary vẫn chạy. RDS sẽ tạo lại standby khi AZ được khôi phục.`);
        } else {
          good('Database nằm ở AZ khác nên không bị ảnh hưởng — nhưng vẫn nên bật Multi-AZ phòng khi AZ đó gặp sự cố.');
        }
      } else if (cfg.database === 'dynamodb') {
        good('DynamoDB tự nhân bản dữ liệu qua nhiều AZ: không mất dữ liệu, không cần failover.');
      } else if (ec2 && (cfg.asg || cfg.ec2[az] > 0)) {
        bad('Không có database riêng: dữ liệu nằm trên ổ đĩa EBS của EC2 — ổ EBS chỉ tồn tại trong một AZ nên đi theo AZ bị sập.');
        suggest('Thêm RDS Multi-AZ', { database: 'rds', rdsMultiAz: true });
      }
      if (ec2 && cfg.appSubnet === 'private' && cfg.nat !== 'none') {
        const needs = natlessFailures(cfg);
        if (cfg.nat === 'perAz') {
          good(`Mỗi AZ có NAT Gateway riêng: EC2 ở ${AZ_LABEL[other]} vẫn gọi được API bên ngoài qua NAT của chính AZ đó.`);
        } else if (cfg.nat === 'regional') {
          // like a NAT in every AZ — as long as it was already present where the survivors run
          if (sc.natWaited) {
            bad(`Regional NAT Gateway chỉ có mặt ở AZ có EC2: trước sự cố ${AZ_LABEL[other]} chưa có máy nên NAT phải mở rộng sang (thực tế 15–20 phút, có khi tới 60 phút) — trong lúc chờ, EC2 mới ở ${AZ_LABEL[other]} không gọi được ${needs.join(', ')}.`);
            if (cfg.asg && cfg.asgMin < 2) suggest('Tối thiểu 2 EC2 (đủ cả hai AZ)', { asgMin: 2, asgMax: Math.max(cfg.asgMax, 2) });
          } else if (sc.natReady.includes(other)) {
            good(`Regional NAT Gateway có mặt sẵn ở từng AZ có EC2: EC2 ở ${AZ_LABEL[other]} vẫn gọi được API bên ngoài qua phần NAT ở chính AZ đó.`);
          }
        } else if (!needs.length) {
          good('NAT Gateway duy nhất có sự cố cũng không sao: EC2 không còn cần NAT — SQS gánh các lời gọi ra ngoài, VPC Endpoint nối tới S3 và SQS.');
        } else if (sc.natAz === az) {
          bad(`NAT Gateway duy nhất nằm ở ${AZ_LABEL[az]}: EC2 ở ${AZ_LABEL[other]} vẫn chạy nhưng không gọi được ${needs.join(', ')} — các request đó bị lỗi.`);
          suggest('Mỗi AZ một NAT Gateway', { nat: 'perAz' });
        } else {
          info(`NAT Gateway duy nhất nằm ở ${AZ_LABEL[sc.natAz]} nên lần này không bị ảnh hưởng — nhưng nó vẫn là điểm lỗi duy nhất.`);
          suggest('Mỗi AZ một NAT Gateway', { nat: 'perAz' });
        }
      }
      if (cfg.s3) good('File trên S3 vẫn an toàn: S3 lưu bản sao ở ít nhất 3 AZ.');
      if (cfg.cloudfront) info('CloudFront vẫn trả file tĩnh từ cache ở các điểm biên trong lúc sự cố.');
      break;
    }

    case 'serverFail': {
      if (!ec2) {
        good('Với Lambda bạn không quản lý server nào: AWS tự thay máy chủ vật lý hỏng, ứng dụng không bị ảnh hưởng.');
        break;
      }
      if (!cfg.asg && fleet <= 1) {
        bad('Chỉ có 1 EC2: server hỏng là website sập (điểm lỗi duy nhất — single point of failure).');
        suggest('Thêm EC2 ở AZ B + ELB', { elb: true, ec2: { a: Math.max(1, cfg.ec2.a), b: Math.max(1, cfg.ec2.b) } });
      } else if (!cfg.elb) {
        if (sc.victimPrimary) bad('Có nhiều EC2 nhưng không có Load Balancer: người dùng vẫn bị dẫn vào đúng máy chủ đã hỏng.');
        else info('Máy hỏng không phải máy đang nhận traffic — nhưng không có Load Balancer thì các máy còn lại cũng chỉ ngồi chơi.');
        suggest('Thêm Elastic Load Balancer', { elb: true });
      } else {
        good('ELB phát hiện máy hỏng qua health check (sau 2 lần kiểm tra thất bại) và chỉ gửi traffic tới các máy còn khoẻ.');
      }
      if (cfg.asg) {
        good('Auto Scaling huỷ máy hỏng và tạo máy thay thế — hệ thống tự chữa lành (self-healing).');
      } else {
        info('Không có Auto Scaling: máy hỏng nằm đó cho tới khi có người xử lý thủ công.');
        suggest('Bật Auto Scaling', { asg: true, elb: true });
      }
      if (cfg.database === 'none') {
        bad('Không có database riêng: dữ liệu (đơn hàng, tài khoản…) nằm trên ổ đĩa của chính máy vừa hỏng.');
        suggest('Thêm RDS', { database: 'rds' });
      }
      break;
    }

    case 'spike': {
      const offload = cfg.s3 || cfg.cloudfront;
      if (cfg.cloudfront) {
        good(`CloudFront trả khoảng ${pct(sc.edgeShareMax)} request ngay tại điểm biên gần người dùng — những request này không chạm tới server.`);
      }
      if (cfg.s3) good('File tĩnh (ảnh, CSS, JS) lấy từ S3 — S3 tự mở rộng gần như vô hạn, server chỉ còn lo phần động.');
      if (!offload) {
        bad('Mọi request — kể cả ảnh, CSS, JS — đều dồn vào tầng ứng dụng.');
        suggest('Đưa file tĩnh lên S3 + CloudFront', { s3: true, cloudfront: true });
      }
      const overloaded = sc.minSuccess < 0.97;
      if (ec2) {
        if (!cfg.asg) {
          bad(`Số EC2 cố định (${fleet} máy) không tự tăng theo lượng truy cập → quá tải, request bị từ chối.`);
          suggest('Bật Auto Scaling + ELB', { asg: true, elb: true });
        } else {
          if (!cfg.elb) {
            bad('Auto Scaling thêm EC2 nhưng không có Load Balancer chia tải — máy mới đứng không, máy chính vẫn quá tải.');
            suggest('Thêm Elastic Load Balancer', { elb: true });
          } else {
            good(`Auto Scaling tăng từ ${sc.startActive} lên ${sc.peakInstances} EC2, ELB chia đều tải cho các máy mới.`);
          }
          if (sc.overAtMax && cfg.elb) {
            bad(`Auto Scaling chạm mức tối đa ${cfg.asgMax} EC2 mà vẫn chưa đủ.`);
            if (cfg.asgMax < ASG.limit) suggest(`Tăng mức tối đa lên ${ASG.limit}`, { asgMax: ASG.limit });
          } else if (flags.has('asgMax')) {
            info(`Auto Scaling chạy ở mức tối đa ${cfg.asgMax} EC2.`);
          }
          if (overloaded && cfg.elb && offload) {
            info('EC2 mới cần thời gian khởi động (thực tế vài phút) nên đợt tăng đột ngột vẫn gây lỗi lúc đầu. Có thể "scale trước" bằng cách tăng số máy tối thiểu trước sự kiện lớn.');
            if (cfg.asgMin < 8) suggest('Scale trước: tối thiểu 8 EC2', { asgMin: 8, asgMax: Math.max(cfg.asgMax, 8) });
          }
        }
      } else {
        good(`Lambda tự mở rộng lên khoảng ${Math.round(sc.peakLambda)} bản chạy song song chỉ trong vài giây.`);
        if (flags.has('lambdaThrottle')) {
          bad(`Chạm giới hạn ${LAMBDA.limit} bản chạy đồng thời (quota mặc định của tài khoản) → một phần request bị từ chối (lỗi 429).`);
          if (!cfg.s3 && offload) suggest('Đưa file tĩnh lên S3', { s3: true });
          info('Có thể xin AWS nâng quota concurrency của Lambda.');
        }
        if (flags.has('gwThrottle')) bad('API Gateway chạm giới hạn mặc định 10.000 request/giây.');
        info('Chi phí Lambda và API Gateway tăng theo số request: dùng bao nhiêu trả bấy nhiêu.');
      }
      if (cfg.database === 'rds') {
        if (cfg.cache) {
          good(`ElastiCache hấp thụ khoảng ${pct(sc.cacheHitMax)} lượt đọc ngay từ bộ nhớ, RDS chỉ còn chịu tải đỉnh ${pct(sc.dbMaxLoad)}.`);
        } else if (sc.dbMaxLoad > 0.8) {
          info(`Database RDS chịu tải tới ${pct(sc.dbMaxLoad)} — sắp thành nút thắt cổ chai. Thực tế có thể thêm Read Replica hoặc bộ nhớ đệm (ElastiCache).`);
          suggest('Bật ElastiCache', { cache: true });
        } else good('RDS vẫn đủ sức xử lý truy vấn.');
      } else if (cfg.database === 'dynamodb') {
        good('DynamoDB (chế độ on-demand) tự tăng năng lực đọc/ghi theo lượng truy cập.');
      }
      if (cfg.queue) {
        if (sc.queueMax >= SQS.backlogWarn) {
          good(`SQS gom tới khoảng ${num(sc.queueMax)} đơn hàng lúc cao điểm; Lambda worker xử lý dần ${SQS.workerRate} đơn/giây — web trả lời ngay, không phải chờ API thanh toán, và không đơn nào bị mất.`);
        } else good('SQS nhận đơn và trả lời ngay; Lambda worker xử lý kịp nên hàng đợi không bị dồn.');
      }
      let natS3Flagged = false;
      if (ec2 && cfg.appSubnet === 'private' && cfg.s3) {
        if (cfg.vpce) good('EC2 đọc/ghi S3 qua Gateway VPC Endpoint: miễn phí và không đi qua NAT, dù lượng truy cập tăng vọt.');
        else if (sc.natS3CostMax > 0.5) {
          natS3Flagged = true;
          bad(`Traffic từ EC2 tới S3 đi qua NAT Gateway và bị tính phí theo GB: lúc cao điểm riêng phần này tốn khoảng ${money(sc.natS3CostMax)}/giờ.`);
          suggest('Thêm VPC Endpoint (S3, SQS)', { vpce: true });
        }
      }
      if (ec2 && cfg.nat !== 'none' && !natS3Flagged) info('NAT Gateway tính phí theo từng GB dữ liệu đi qua: lượng truy cập tăng thì phí NAT cũng tăng theo.');
      info(`Chi phí ước tính tăng từ ${money(sc.costStart)} lên ${money(sc.costMax)}/giờ lúc cao điểm.`);
      if (cfg.budget) {
        if (flags.has('budgetWarn') || flags.has('budgetOver')) {
          good(`AWS Budgets gửi cảnh báo ngay khi chi phí dự báo vượt ngưỡng của ngân sách ${usd(cfg.budget)}/tháng — bạn biết trong ngày, không phải đợi hoá đơn cuối tháng.`);
        } else if (sc.budgetAlertedStart > 0) {
          info(`Chi phí dự báo đã vượt ngưỡng ngân sách ${usd(cfg.budget)}/tháng từ trước sự kiện — nên xem lại ngân sách hoặc tối ưu kiến trúc.`);
        } else {
          info(`Chi phí dự báo vẫn nằm trong ngân sách ${usd(cfg.budget)}/tháng nên AWS Budgets không phải báo động.`);
        }
      } else if (sc.costMax * BUDGET.hoursPerMonth > BUDGET.options[1]) {
        info(`Nếu giữ mức chi lúc cao điểm suốt một tháng, hoá đơn có thể lên tới ~${usd(sc.costMax * BUDGET.hoursPerMonth)}. Đặt AWS Budgets để được cảnh báo sớm.`);
        suggest(`Đặt AWS Budgets ${usd(BUDGET.options[1])}/tháng`, { budget: BUDGET.options[1] });
      }
      break;
    }

    case 'dbFail': {
      if (cfg.database === 'dynamodb') {
        good('DynamoDB là dịch vụ được AWS quản lý hoàn toàn, tự nhân bản dữ liệu qua nhiều AZ: hỏng phần cứng không ảnh hưởng tới bạn.');
      } else if (cfg.rdsMultiAz && flags.has('dbFailoverStart')) {
        good('RDS Multi-AZ phát hiện primary hỏng và tự chuyển sang standby (failover) — không mất dữ liệu vì standby được đồng bộ liên tục.');
        info('Trong lúc failover (thực tế 1–2 phút) các request cần database bị lỗi; ứng dụng không phải đổi cấu hình vì endpoint giữ nguyên.');
        if (flags.has('standbyReady')) good('Sau đó RDS tự tạo một bản standby mới để sẵn sàng cho lần sau.');
      } else if (cfg.rdsMultiAz) {
        bad('Bản standby chưa sẵn sàng (vẫn đang được tạo lại sau sự cố trước) nên không thể failover: database ngừng hoạt động cho tới khi có máy mới.');
        info('Multi-AZ chỉ bảo vệ được khi bản standby đã chạy xong — hai sự cố liên tiếp quá nhanh vẫn có thể gây gián đoạn.');
      } else {
        bad('RDS Single-AZ không có bản dự phòng: database ngừng hoạt động cho tới khi AWS thay máy chủ mới (thực tế có thể mất hàng chục phút).');
        info('Backup tự động hằng ngày + log giao dịch giúp không mất dữ liệu, nhưng khôi phục cần thời gian.');
        suggest('Bật RDS Multi-AZ', { rdsMultiAz: true });
      }
      if (cfg.s3 || cfg.cloudfront) good('Phần file tĩnh (S3/CloudFront) vẫn được phục vụ bình thường.');
      if (cfg.cache) good('ElastiCache không phụ thuộc vào RDS: các lượt đọc đã có trong cache vẫn trả lời bình thường dù database đang sự cố.');
      break;
    }

    case 'night': {
      if (ec2) {
        if (cfg.asg) {
          if (sc.minInstances < sc.startActive) {
            good(`Auto Scaling giảm từ ${sc.startActive} xuống ${sc.minInstances} EC2 khi vắng khách → bớt tiền.`);
          } else {
            good(`Auto Scaling giữ ở mức tối thiểu ${cfg.asgMin} EC2 — đủ để vẫn có máy ở cả hai AZ.`);
          }
        } else {
          bad(`${fleet} EC2 vẫn chạy (và vẫn tính tiền theo giờ) dù gần như không có ai truy cập.`);
          suggest('Bật Auto Scaling', { asg: true, elb: true });
        }
        if (cfg.database === 'rds') info('RDS cũng tính tiền theo giờ, dù ban đêm ít truy vấn.');
        if (cfg.nat === 'regional') {
          if (sc.natHoursMin > 0) info(`Regional NAT Gateway vẫn tính tiền theo giờ cho mỗi AZ nó có mặt (ở đây ${sc.natHoursMin} AZ có EC2), dù gần như không có traffic đi qua.`);
        } else if (cfg.nat !== 'none') info(`${cfg.nat === 'perAz' ? 'Hai' : 'Một'} NAT Gateway vẫn tính tiền theo giờ dù gần như không có traffic đi qua.`);
        info('Với lượng truy cập thấp và thất thường, kiến trúc serverless (Lambda) thường rẻ hơn.');
      } else {
        good(`Serverless trả tiền theo request: chi phí giảm từ ${money(sc.costStart)} xuống khoảng ${money(sc.costMin)}/giờ.`);
      }
      break;
    }

    case 'ddos': {
      const ddosBlockedShare = sc.ddosRawMax > 0 ? 1 - sc.ddosThroughMax / sc.ddosRawMax : 0;
      if (cfg.shield) {
        good(`AWS Shield hấp thụ khoảng ${pct(ddosBlockedShare)} lưu lượng tấn công ngay ở tầng mạng — đây là công cụ chuyên trị DDoS.`);
        if (cfg.waf) info('WAF cũng góp phần nhờ rate-based rule, nhưng Shield mới là lớp chặn chính cho DDoS.');
      } else if (cfg.waf) {
        bad(`WAF một mình chỉ chặn được khoảng ${pct(ddosBlockedShare)} request rác nhờ rate-based rule — không phải công cụ chuyên trị DDoS.`);
        info('AWS Shield mới là lớp phòng thủ DDoS chuyên dụng (tầng mạng), nên dùng cùng WAF.');
        suggest('Bật AWS Shield', { shield: true });
      } else {
        bad('Không có Shield lẫn WAF: toàn bộ request rác dội thẳng vào ELB/EC2, chiếm hết công suất của cả người dùng thật.');
        suggest('Bật AWS Shield + WAF', { shield: true, waf: true });
      }
      if (ec2 && !cfg.asg) info('Không có Auto Scaling thì dù chặn được DDoS, hệ thống vẫn không tự thêm máy khi traffic thật tăng theo.');
      break;
    }

    case 'sqlInjection': {
      if (cfg.database === 'none') {
        info('Kiến trúc chưa có database nên đây chỉ là tình huống giả định.');
      } else if (cfg.database === 'dynamodb') {
        good('DynamoDB không dùng câu lệnh SQL nên về bản chất miễn nhiễm với kiểu SQL injection cổ điển này.');
      } else if (cfg.waf) {
        good('WAF kiểm tra nội dung từng request và chặn gần hết các payload SQL injection trước khi chạm tới RDS.');
      } else {
        bad(`Không có WAF: khoảng ${pct(sc.sqliFailMax)} request động bị ảnh hưởng — mã SQL độc hại đi thẳng tới RDS, dữ liệu có nguy cơ bị lộ hoặc sửa.`);
        info('AWS Shield không giúp được vụ này — Shield chỉ nhìn lưu lượng mạng, không đọc nội dung request như WAF.');
        suggest('Bật AWS WAF', { waf: true });
      }
      break;
    }

    case 'paymentDown': {
      if (cfg.queue) {
        good(`Đơn hàng vẫn được nhận: ứng dụng chỉ bỏ đơn vào SQS rồi trả lời ngay. Trong lúc đối tác sập, hàng đợi giữ hộ tới khoảng ${num(sc.queueMax)} đơn.`);
        if (flags.has('queueDrained')) good('Đối tác hoạt động lại, Lambda worker thử lại và xử lý hết hàng đợi — không mất đơn nào.');
        else info('Lambda worker vẫn đang xử lý nốt các đơn còn trong hàng đợi.');
        info('Thực tế nên gắn thêm dead-letter queue (DLQ) để giữ riêng những tin xử lý thất bại quá nhiều lần.');
      } else {
        bad('Ứng dụng gọi thẳng API thanh toán ngay trong request: đối tác sập là các request đặt hàng lỗi theo, khách phải đặt lại — hoặc bỏ đi.');
        suggest('Thêm SQS + Lambda worker', { queue: true });
      }
      break;
    }

    case 'dataDelete': {
      const store = cfg.database === 'rds' ? 'RDS' : cfg.database === 'dynamodb' ? 'DynamoDB' : 'ổ đĩa EBS của EC2';
      if (sc.hadBackup) {
        good(`AWS Backup có sao lưu liên tục (point-in-time recovery): khôi phục ${store} về thời điểm ngay trước lệnh xoá, chỉ mất vài phút thay đổi cuối.`);
        info(`Khôi phục cần thời gian (mô phỏng ${BACKUP.detectTime + BACKUP.restoreTime} giây, thực tế vài chục phút tới vài giờ) — website lỗi trong lúc chờ. Nên thử khôi phục định kỳ để biết chính xác mất bao lâu.`);
      } else {
        bad(`Không có bản sao lưu nào: phần dữ liệu bị xoá trên ${store} đã mất vĩnh viễn.`);
        suggest('Bật AWS Backup', { backup: true });
      }
      if (cfg.database === 'rds' && cfg.rdsMultiAz) {
        info('RDS Multi-AZ không cứu được: bản standby nhận ngay lệnh xoá như primary. Multi-AZ chống hỏng phần cứng, không chống xoá nhầm.');
      }
      if (cfg.database === 'rds' && !sc.hadBackup) {
        info('Ngoài thực tế RDS bật sẵn backup tự động (giữ 1–35 ngày) — đừng tắt nó. AWS Backup quản lý tập trung cho mọi dịch vụ, giữ lâu hơn và sao chép được sang Region khác.');
      }
      if (cfg.database === 'dynamodb') info('DynamoDB nhân bản lệnh xoá qua mọi AZ; muốn quay lại phải bật point-in-time recovery hoặc dùng AWS Backup.');
      if (cfg.database === 'none') info('Dữ liệu nằm trên ổ EBS của EC2: chỉ snapshot (AWS Backup) mới khôi phục được.');
      break;
    }

    case 'leakedKey': {
      const loss = (h) => usd(h * LEAK.costPerHour);
      if (sc.hadGuardDuty) {
        good('GuardDuty đọc CloudTrail, VPC Flow Logs và DNS log (không cần cài agent): thấy access key được dùng từ IP lạ và máy mới gọi tới pool đào coin, ra finding sau vài phút.');
        good(`EventBridge chuyển finding cho Lambda: vô hiệu hoá key, dừng máy đào. Ngoài thực tế máy chỉ chạy khoảng 15 phút — thiệt hại cỡ ${loss(LEAK.realHours.guardduty)}.`);
      } else if (sc.hadBudget) {
        bad(`Không có GuardDuty: chỉ AWS Budgets báo động, mà dữ liệu chi phí cập nhật chậm vài giờ. Tới lúc nhận email, máy đào đã chạy khoảng nửa ngày — mất cỡ ${loss(LEAK.realHours.budgets)}.`);
        info('Budgets chỉ cảnh báo, không tự dừng máy đào — vẫn phải có người vào tìm và xoá. Budget action có thể áp SCP chặn tạo thêm tài nguyên, nhưng không thay được việc phát hiện mối đe doạ.');
        suggest('Bật Amazon GuardDuty', { guardduty: true });
      } else {
        bad(`Không có GuardDuty lẫn AWS Budgets: chẳng ai hay biết cho tới khi nhận hoá đơn cuối tháng — máy đào có thể đã chạy hai tuần, tiền mất cỡ ${loss(LEAK.realHours.bill)}.`);
        suggest('Bật Amazon GuardDuty', { guardduty: true });
        suggest(`Đặt AWS Budgets ${usd(BUDGET.options[1])}/tháng`, { budget: BUDGET.options[1] });
      }
      info('Website vẫn chạy bình thường suốt sự cố — vì vậy đo sức khoẻ ứng dụng không bắt được kiểu tấn công này.');
      info('Gốc rễ là access key dài hạn: người dùng nên đăng nhập qua IAM Identity Center (credential tạm, tự hết hạn), ứng dụng dùng IAM role. Bật MFA, không commit key vào Git.');
      break;
    }

    case 'badDeploy': {
      if (sc.hadCanary) {
        good(
          ec2
            ? 'Canary: ALB chia traffic theo trọng số giữa hai target group — chỉ 10% tới nhóm máy chạy bản mới, 90% người dùng vẫn ở bản cũ.'
            : 'Canary: CodeDeploy chỉnh trọng số của alias Lambda — chỉ 10% lời gọi tới phiên bản mới, 90% vẫn chạy bản cũ.',
        );
        good('CloudWatch alarm thấy tỉ lệ 5xx của bản mới tăng vọt: việc deploy tự dừng và rollback trong vài giây — không cần ai thức dậy bấm nút.');
        info(
          ec2
            ? 'Ngoài thực tế với EC2, canary qua ALB có sẵn ở Elastic Beanstalk (traffic splitting); ECS và Lambda dùng cấu hình …Canary10Percent5Minutes của CodeDeploy. Bản mới giữ 10% vài phút cho alarm kịp đánh giá.'
            : 'Ngoài thực tế: CodeDeployDefault.LambdaCanary10Percent5Minutes giữ 10% trong 5 phút cho alarm kịp đánh giá — bản lỗi vẫn chỉ chạm khoảng 10% lời gọi.',
        );
      } else {
        bad(`Deploy một lần (all at once): ${ec2 ? 'mọi EC2' : 'mọi lời gọi Lambda'} chạy bản lỗi cùng lúc — 100% request động (đặt hàng, đăng nhập…) trả lỗi 500.`);
        bad('Không có alarm tự rollback: phải đợi khách phàn nàn, người trực xem dashboard rồi deploy lại bản cũ — ngoài thực tế thường mất 15–30 phút.');
        suggest('Bật deploy canary + tự rollback', ec2 && !cfg.elb ? { canary: true, elb: true } : { canary: true });
      }
      if (ec2 && cfg.elb) info('Health check của Load Balancer không bắt được lỗi này: máy vẫn sống và trả lời /health, chỉ code mới trả 500 — phải đặt alarm trên tỉ lệ lỗi 5xx.');
      if (cfg.s3) info('File tĩnh trên S3 vẫn tải bình thường: chúng không chạy code của bản mới.');
      info('Test tự động trong CodeBuild chặn được phần lớn lỗi trước khi deploy, nhưng không phải tất cả — canary là lưới an toàn cuối cùng.');
      break;
    }

    default:
      break;
  }

  // a private fleet without NAT breaks every call that still needs it, whatever the event was
  const natless = natlessFailures(cfg);
  if (ec2 && cfg.appSubnet === 'private' && cfg.nat === 'none' && natless.length) {
    bad(`EC2 ở private subnet nhưng không có NAT Gateway: mọi lời gọi tới ${natless.join(', ')} đều thất bại.`);
    suggest('Thêm NAT Gateway cho mỗi AZ', { nat: 'perAz' });
  }
  if (sc.cfgChanged) info('Bạn đã thay đổi kiến trúc trong lúc sự cố diễn ra — đánh giá dựa trên kiến trúc lúc bắt đầu.');

  let grade;
  if (sc.action === 'night') {
    grade = ec2 && !cfg.asg ? 'partial' : 'pass';
  } else if (sc.finalStatus === 'down' || sc.downTime > sc.window * 0.5 || sc.heavyTime > sc.window * 0.4) {
    grade = 'fail';
  } else if (sc.badTime > 4 || sc.finalStatus === 'degraded') {
    grade = 'partial';
  } else {
    grade = 'pass';
  }
  // the site keeps half working, but deleted data with no backup is gone for good
  const dataLost = sc.action === 'dataDelete' && flags.has('noBackup');
  if (dataLost) grade = 'fail';
  // a leaked key never hurts the site: judged by how soon anyone noticed the miners
  if (sc.action === 'leakedKey') grade = sc.hadGuardDuty ? 'pass' : sc.hadBudget ? 'partial' : 'fail';
  // a bad release: judged by how many users it reached
  if (sc.action === 'badDeploy') grade = sc.hadCanary ? 'pass' : 'fail';

  const headline = dataLost
    ? 'Dữ liệu đã mất vĩnh viễn!'
    : sc.action === 'leakedKey'
      ? { pass: 'Chặn kịp trong vài phút!', partial: 'Phát hiện muộn — tiền đã mất', fail: 'Không ai phát hiện — hoá đơn khổng lồ!' }[grade]
      : sc.action === 'badDeploy'
      ? grade === 'pass'
        ? 'Bản lỗi bị chặn ở 10% traffic!'
        : 'Bản lỗi tới tay mọi người dùng!'
      : sc.action === 'night'
      ? grade === 'pass'
        ? 'Chi phí co giãn theo lượng truy cập'
        : 'Website ổn nhưng lãng phí tiền'
      : { pass: 'Hệ thống vượt qua thử thách!', partial: 'Vượt qua nhưng có gián đoạn', fail: 'Website đã sập!' }[grade];

  const stats = [
    { label: 'Tỉ lệ request thành công thấp nhất', value: pct(sc.minSuccess) },
    { label: 'Thời gian bị lỗi/gián đoạn', value: `${Math.round(sc.badTime)} giây (mô phỏng)` },
    { label: 'Độ trễ cao nhất', value: sc.maxLatency ? `${Math.round(sc.maxLatency)} ms` : '—' },
    {
      label: 'Chi phí ước tính',
      value: `${money(sc.costStart)} → ${money(sc.action === 'night' ? sc.costMin : sc.costMax)}/giờ`,
    },
  ];

  // the card's default badge for "partial" reads "had an outage"; these events never take the site down
  const badge =
    sc.action === 'leakedKey'
      ? { pass: 'Chặn kịp', partial: 'Phát hiện muộn', fail: 'Không ai phát hiện' }[grade]
      : sc.action === 'night' && grade === 'partial'
        ? 'Lãng phí'
        : null;

  return { action: sc.action, az: sc.az || null, title: ACTION_TITLE[sc.action], grade, badge, headline, stats, points, suggestions };
}

// Well-Architected review of the sandbox architecture: each of the six pillars gets a few checks
// (what the sandbox can model) and a score = share of checks passed. A failing check may carry a
// patch that fixes it, like a Trusted Advisor recommendation.
export const PILLARS = [
  { id: 'ops', name: 'Vận hành xuất sắc', en: 'Operational Excellence' },
  { id: 'sec', name: 'Bảo mật', en: 'Security' },
  { id: 'rel', name: 'Độ tin cậy', en: 'Reliability' },
  { id: 'perf', name: 'Hiệu năng', en: 'Performance Efficiency' },
  { id: 'cost', name: 'Tối ưu chi phí', en: 'Cost Optimization' },
  { id: 'sus', name: 'Bền vững', en: 'Sustainability' },
];

export function wellArchitected(c) {
  const ec2 = c.compute === 'ec2';
  const priv = ec2 && c.appSubnet === 'private';
  const elastic = !ec2 || c.asg; // capacity follows demand
  const checks = { ops: [], sec: [], rel: [], perf: [], cost: [], sus: [] };
  const add = (p, ok, text, patch) => checks[p].push({ ok: !!ok, text, patch: ok ? null : patch || null });

  add('ops', elastic, ec2 ? 'Auto Scaling tự thay máy hỏng (self-healing)' : 'Lambda: AWS tự lo máy chủ', { asg: true, elb: true });
  add('ops', c.queue, 'Tách việc chậm ra hàng đợi (SQS) — lỗi đối tác không lan sang web', { queue: true });
  add('ops', c.budget > 0, 'Có cảnh báo khi chi phí bất thường (AWS Budgets)', { budget: BUDGET.options[1] });
  add('ops', c.canary, 'Deploy an toàn: canary + tự rollback khi alarm 5xx', ec2 && !c.elb ? { canary: true, elb: true } : { canary: true });

  add('sec', c.guardduty, 'GuardDuty phát hiện mối đe doạ (key bị lộ, máy đào coin)', { guardduty: true });
  add('sec', c.waf, 'WAF lọc request độc hại (SQL injection, XSS)', { waf: true });
  add('sec', c.shield, 'Shield chống DDoS ở tầng mạng', { shield: true });
  if (ec2) add('sec', priv, 'EC2 nằm trong private subnet, chỉ nhận traffic qua Load Balancer', { appSubnet: 'private', elb: true, nat: c.nat === 'none' ? 'perAz' : c.nat });

  if (ec2) {
    add('rel', c.asg || (c.ec2.a > 0 && c.ec2.b > 0), 'Máy chủ trải trên ít nhất 2 AZ', c.asg ? null : { ec2: { a: Math.max(1, c.ec2.a), b: Math.max(1, c.ec2.b) }, elb: true });
    add('rel', c.elb, 'Load Balancer + health check bỏ qua máy hỏng', { elb: true });
    if (priv && natlessFailures(c).length) add('rel', c.nat === 'perAz' || c.nat === 'regional', 'Đường ra Internet không phụ thuộc một AZ (NAT mỗi AZ / Regional)', { nat: 'perAz' });
  }
  if (c.database === 'rds') add('rel', c.rdsMultiAz, 'RDS Multi-AZ: có standby ở AZ khác', { rdsMultiAz: true });
  if (c.database !== 'none' || ec2) add('rel', c.backup, 'Có bản sao lưu (AWS Backup) để khôi phục khi xoá nhầm', { backup: true });
  add('rel', c.queue, 'Đơn hàng không mất khi đối tác thanh toán sập (SQS)', { queue: true });

  add('perf', c.cloudfront, 'CloudFront cache nội dung gần người dùng', { cloudfront: true });
  add('perf', c.s3, 'File tĩnh phục vụ từ S3, không chiếm sức server', { s3: true });
  add('perf', elastic, 'Năng lực tự tăng theo lượng truy cập', { asg: true, elb: true });
  if (c.database === 'rds') add('perf', c.cache, 'ElastiCache đỡ lượt đọc cho RDS', { cache: true });

  add('cost', elastic, 'Tự giảm máy khi vắng khách — không trả tiền cho máy ngồi chơi', { asg: true, elb: true });
  add('cost', c.budget > 0, 'Đặt ngân sách và cảnh báo (AWS Budgets)', { budget: BUDGET.options[1] });
  if (priv && c.s3) add('cost', c.vpce, 'Traffic tới S3 đi qua VPC Endpoint miễn phí thay vì NAT tính theo GB', { vpce: true });

  add('sus', elastic, 'Chỉ chạy đúng số máy cần, không để máy rảnh', { asg: true, elb: true });
  add('sus', c.cloudfront || c.s3, 'Giảm dữ liệu truyền đi xa nhờ cache và lưu trữ managed', { s3: true, cloudfront: true });
  add('sus', !ec2 || c.database === 'dynamodb', 'Dùng dịch vụ managed/serverless chia sẻ hạ tầng hiệu quả', null);

  return PILLARS.map((p) => {
    const list = checks[p.id];
    const passed = list.filter((x) => x.ok).length;
    return { ...p, checks: list, passed, total: list.length, score: list.length ? Math.round((passed / list.length) * 100) : 100 };
  });
}
