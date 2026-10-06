// Turns a finished scenario into a lesson card: a verdict, what helped, what hurt and
// one-click suggestions that patch the architecture so the user can try again.
import { ASG, AZ_LABEL, LAMBDA, OTHER_AZ } from './constants.js';

export const ACTION_TITLE = {
  quake: 'Động đất phá huỷ một AZ',
  serverFail: 'Một server bị hỏng',
  spike: '1 triệu người dùng ùa vào',
  dbFail: 'Database gặp sự cố',
  night: 'Đêm khuya vắng khách',
  ddos: 'Tấn công DDoS',
  sqlInjection: 'Tấn công SQL injection',
};

const pct = (x) => {
  const v = Math.max(0, Math.min(1, x)) * 100;
  return (v >= 99 && v < 100 ? v.toFixed(1) : Math.round(v)) + '%';
};
const money = (x) => '$' + (x < 1 ? x.toFixed(3) : x.toFixed(2));

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
        if (cfg.nat === 'perAz') {
          good(`Mỗi AZ có NAT Gateway riêng: EC2 ở ${AZ_LABEL[other]} vẫn gọi được API bên ngoài qua NAT của chính AZ đó.`);
        } else if (sc.natAz === az) {
          bad(`NAT Gateway duy nhất nằm ở ${AZ_LABEL[az]}: EC2 ở ${AZ_LABEL[other]} vẫn chạy nhưng mất đường ra Internet — các request cần gọi API thanh toán, email… bị lỗi.`);
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
      if (ec2 && cfg.nat !== 'none') info('NAT Gateway tính phí theo từng GB dữ liệu đi qua: lượng truy cập tăng thì phí NAT cũng tăng theo.');
      info(`Chi phí ước tính tăng từ ${money(sc.costStart)} lên ${money(sc.costMax)}/giờ lúc cao điểm.`);
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
        if (cfg.nat !== 'none') info(`${cfg.nat === 'perAz' ? 'Hai' : 'Một'} NAT Gateway vẫn tính tiền theo giờ dù gần như không có traffic đi qua.`);
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

    default:
      break;
  }

  // a private fleet without NAT breaks every outside call, whatever the event was
  if (ec2 && cfg.appSubnet === 'private' && cfg.nat === 'none') {
    bad('EC2 ở private subnet nhưng không có NAT Gateway: mọi lời gọi ra Internet (API thanh toán, email…) đều thất bại.');
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

  const headline =
    sc.action === 'night'
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

  return { action: sc.action, az: sc.az || null, title: ACTION_TITLE[sc.action], grade, headline, stats, points, suggestions };
}
