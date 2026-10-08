# Cloud Simulator

Mô phỏng 3D các dịch vụ AWS cơ bản cho người mới bắt đầu. Viết bằng **React + Vite**, mô hình 3D dựng thủ tục bằng **three.js** (không dùng file model ngoài).

Dự án học tập độc lập, không liên kết với Amazon Web Services. Số liệu (công suất, độ trễ, chi phí) là minh hoạ, thời gian được nén cho dễ quan sát.

## Hai chế độ

### 1. Học từng dịch vụ

Chọn một dịch vụ ở cột trái để xem luồng hoạt động của nó qua 6–14 bước có hoạt hình 3D, kèm lời giải thích. Bài đầu tiên, **Cloud là gì**, dành cho người chưa biết gì về cloud:

| Nhóm | Dịch vụ |
| --- | --- |
| Nền tảng | Cloud là gì (6 lợi ích của cloud, IaaS / PaaS / SaaS, cloud / hybrid / on-premises, Console / CLI / SDK / IaC, AWS CAF), Region & Availability Zone (kèm Local Zone Hà Nội, Wavelength, Outposts, edge location), Mô hình trách nhiệm chung (Shared Responsibility) |
| Tính toán | EC2, Auto Scaling, Lambda, ECS + Fargate, EKS, Elastic Beanstalk |
| Lưu trữ | S3, EBS, EFS, Amazon FSx (Windows File Server, Lustre, NetApp ONTAP, OpenZFS), AWS Storage Gateway (S3 File, Volume, Tape Gateway), AWS Backup, Chiến lược DR & Elastic Disaster Recovery (kèm Global Accelerator) |
| Cơ sở dữ liệu | RDS, Aurora, DynamoDB, ElastiCache, Database chuyên dụng (DocumentDB, Neptune, Keyspaces, kèm MemoryDB, Timestream) |
| Mạng | Elastic Load Balancing, CloudFront, Route 53, VPC (gồm Internet Gateway, route table, Security Group & Network ACL, NAT Gateway, VPC Endpoint & PrivateLink, Flow Logs, VPC Peering), Transit Gateway, Site-to-Site VPN & Direct Connect |
| Tích hợp | API Gateway, SQS, SNS, EventBridge, Step Functions |
| Phân tích dữ liệu | Kinesis Data Streams (kèm Data Firehose), Athena + Glue (data lake trên S3, Parquet, partition, Lake Formation), Redshift + Quick Sight (OLTP / OLAP, Serverless, zero-ETL từ Aurora, Spectrum), OpenSearch (chỉ mục ngược, gõ sai vẫn tìm được, phân tích log) |
| AI & Machine Learning | AI dựng sẵn (Rekognition, Textract, Transcribe, Comprehend, Translate, Polly, Lex), SageMaker AI (kèm Bedrock, Amazon Q) |
| Di chuyển & truyền dữ liệu | 7R & Application Migration Service (MGN), AWS DMS (kèm Schema Conversion), DataSync, Transfer Family & Snowball |
| Giám sát & quản trị | CloudWatch, CloudTrail, AWS Config, CloudFormation, Systems Manager, Budgets & Cost Explorer (kèm Pricing Calculator, Cost and Usage Report), Trusted Advisor & Well-Architected (kèm 4 gói AWS Support, re:Post, Marketplace, Partner Network, Professional Services), Organizations |
| Công cụ phát triển | CodePipeline + CodeBuild + CodeDeploy, X-Ray (dạy bằng OpenTelemetry) |
| Bảo mật | IAM, IAM Identity Center, Cognito, KMS, Secrets Manager, ACM, WAF, Shield, GuardDuty (kèm Inspector, Macie, Security Hub) |

Cột phải giải thích dịch vụ: là gì, ví dụ đời thường, khi nào dùng, khái niệm chính, cách tính tiền, và nút **Thử trong Sandbox**.

Phím tắt: `←` / `→` chuyển bước, `Space` chạy / tạm dừng.

### 2. Sandbox kiến trúc

- Chọn mẫu kiến trúc (1 server, Web + Database, Chịu lỗi cao, Chịu lỗi + CDN, Serverless) hoặc tự bật/tắt từng thành phần: Route 53, CloudFront, Load Balancer, Auto Scaling, số EC2 mỗi AZ, vị trí EC2 (public / private subnet), NAT Gateway (không / 1 cái / mỗi AZ / Regional — một NAT cho cả VPC, tự có mặt ở từng AZ có EC2), VPC Endpoint (EC2 private tới S3, SQS không qua NAT), SQS + Lambda worker (xử lý đơn hàng nền), S3, RDS (Single/Multi-AZ), ElastiCache (đặt trước RDS), DynamoDB, AWS Backup (sao lưu + khôi phục về thời điểm), API Gateway + Lambda, canary + tự rollback (bản mới nhận 10% traffic trước, alarm 5xx thì quay lại), AWS WAF, AWS Shield, Amazon GuardDuty, AWS Budgets (ngân sách $200 / $1.000 / $5.000 mỗi tháng — cảnh báo khi chi phí dự báo vượt 80% và 100%), Region dự phòng ở Tokyo theo 4 chiến lược DR — backup & restore, pilot light, warm standby, active-active (cần Route 53 để chuyển người dùng), nơi chạy báo cáo (database production / S3 + Athena với bản xuất Parquet mỗi đêm / Redshift Serverless nhận thay đổi qua zero-ETL).
- Thả sự kiện để xem điều gì xảy ra:
  - **Động đất**: phá huỷ AZ A hoặc AZ B (nứt nền, khói bụi, server đổ).
  - **Cả Region sập**: Singapore mất kết nối, mọi AZ cùng tắt — Multi-AZ không đỡ được. Không có DR thì chờ AWS khôi phục; backup & restore dựng lại mọi thứ ở Tokyo; pilot light bật máy và promote database; warm standby được Route 53 tự chuyển sang; active-active chỉ mất nửa số người dùng trong lúc chờ DNS.
  - **Server hỏng**: một EC2 cháy nguồn.
  - **1 triệu người**: lượng truy cập tăng 100 lần.
  - **Database sự cố**: ổ đĩa primary hỏng.
  - **Tấn công DDoS**: botnet dội request rác vào hệ thống.
  - **SQL injection**: request chứa mã SQL độc hại nhắm vào database (cần có database).
  - **Thanh toán sập**: API của đối tác thanh toán, email ngừng 20 giây — có SQS thì đơn hàng nằm chờ thay vì lỗi.
  - **Xoá nhầm dữ liệu**: bản deploy lỗi chạy lệnh DELETE — Multi-AZ không cứu được, chỉ AWS Backup khôi phục được.
  - **Lộ access key**: key dài hạn bị đẩy lên GitHub, kẻ gian bật máy GPU đào coin — website vẫn chạy, chỉ hoá đơn tăng. Có GuardDuty thì bị chặn sau vài giây; chỉ có Budgets thì biết muộn khi tiền đã mất; không có gì thì đợi tới hoá đơn.
  - **Deploy lỗi**: bản v2 trả lỗi 500 cho mọi request động. Deploy một lần thì lỗi tới mọi người dùng cho tới khi có người deploy lại bản cũ; có canary + alarm thì chỉ khoảng 10% request bị ảnh hưởng trong vài giây.
  - **Báo cáo cuối tháng**: đội kinh doanh chạy báo cáo doanh thu 2 năm (cần có database). Chạy thẳng trên RDS thì đơn hàng chậm và lỗi suốt lúc báo cáo chạy; DynamoDB phải Scan cả bảng (chậm, tốn tiền đọc); Athena hay Redshift thì xong sau vài giây, website không bị ảnh hưởng.
  - **Đêm khuya**: chỉ còn 500 người, trời tối.
  - **Phục hồi**: sửa mọi thứ.
- Theo dõi trạng thái website (và Region đang phục vụ khi có DR), request/giây, tỉ lệ thành công, độ trễ, số máy, chi phí ước tính (và % ngân sách khi bật AWS Budgets, số đơn chờ trong SQS), biểu đồ 60 giây và nhật ký giải thích bằng lời.
- Bảng **Chấm điểm Well-Architected** chấm kiến trúc đang dựng theo 6 trụ cột; mỗi mục chưa đạt có nút **Sửa** áp dụng ngay, như khuyến nghị của Trusted Advisor.
- Hết sự kiện sẽ có **thẻ bài học**: kết quả, điều gì giúp ích, điều gì gây hại, và gợi ý có thể **áp dụng & thử lại** ngay.
- Bấm vào vật thể 3D bất kỳ để xem nó là gì và trạng thái hiện tại.

## Chạy dự án

Cần Node 20+ và pnpm.

```bash
pnpm install
```

```bash
pnpm dev
```

Mở http://localhost:5173. Các lệnh khác:

```bash
pnpm test
```

```bash
pnpm build
```

Thêm `?fx=low` vào URL để chạy chế độ đồ hoạ nhẹ (tắt bloom và bóng đổ) trên máy yếu.

## Cấu trúc

```
src/
  sim/            mô phỏng (JS thuần, test được bằng Node)
    simulation.js   định tuyến traffic, health check, Auto Scaling, RDS failover, ElastiCache, Lambda, DDoS / SQL injection, SQS, VPC Endpoint, AWS Backup, GuardDuty & lộ access key, deploy canary, Region dự phòng & failover, báo cáo (Athena / Redshift), chi phí, AWS Budgets
    lessons.js      chấm điểm sự kiện → thẻ bài học + gợi ý; chấm điểm Well-Architected 6 trụ cột
    presets.js      các mẫu kiến trúc
    constants.js    công suất, thời gian, giá minh hoạ
  data/
    services.js     nội dung giải thích từng dịch vụ
    flows.js        kịch bản luồng hoạt động từng dịch vụ
  engine/
    engine.js       renderer, bloom, camera, chọn vật thể, vòng lặp
    world.js        bầu trời, biển mây, ánh sáng ngày/đêm
    sandboxScene.js đồng bộ mô hình 3D với mô phỏng, gói tin, hiệu ứng sự kiện
    exploreScene.js trình phát kịch bản cho chế độ học
    fx.js           gói tin, khói, tia lửa, bụi, vòng sóng, cột sáng, chữ nổi
    models/         mô hình từng dịch vụ (EC2, S3, RDS, Lambda…)
  ui/             các thành phần React
test/
  sim.test.mjs    kịch bản mô phỏng (động đất, server hỏng, 1 triệu người…)
  flows.test.mjs  kiểm tra kịch bản học tham chiếu đúng mô hình và hành động
```

## Mô hình mô phỏng (giản lược)

- Mỗi người online gửi khoảng 1 request / 100 giây; 60% là file tĩnh, 40% cần ứng dụng + database.
- Một EC2 xử lý khoảng 500 request/giây; quá mức thì request bị từ chối (503).
- Không có Load Balancer: người dùng chỉ vào được máy chủ đầu tiên.
- Health check 1 giây/lần, 2 lần lỗi liên tiếp → loại máy. Auto Scaling giữ CPU trung bình quanh 60%, máy mới khởi động mất 5 giây mô phỏng (thực tế 1–3 phút).
- RDS Multi-AZ failover 6 giây mô phỏng (thực tế 60–120 giây); Single-AZ hỏng phần cứng mất 25 giây để thay máy.
- Lambda: mỗi request chạy ~200 ms, giới hạn 1.000 bản song song; API Gateway giới hạn 10.000 request/giây.
- 15% request động gọi API bên ngoài (thanh toán, email…). EC2 ở public subnet gọi thẳng ra Internet; EC2 ở private subnet phải đi qua NAT Gateway — không có NAT, hoặc NAT duy nhất nằm ở AZ bị sập, thì các request đó lỗi. NAT tính tiền theo giờ + theo GB.
- Regional NAT Gateway: một NAT cho cả VPC (không cần public subnet), tự có mặt ở từng AZ đang có EC2 và rút khỏi AZ không còn máy; traffic của mỗi AZ đi qua phần NAT trong chính AZ đó. Mở rộng sang AZ mới mất 15 giây mô phỏng (thực tế trung bình 15–20 phút, có khi tới 60 phút) — trong lúc chờ, EC2 ở AZ đó đi nhờ qua NAT ở AZ khác (không còn AZ nào có NAT sẵn thì không ra Internet được). Mỗi AZ có mặt tính một giờ NAT, nên chi phí gần bằng mỗi AZ một NAT.
- ElastiCache (đặt trước RDS) trả lời tới 80% lượt đọc từ bộ nhớ sau vài giây làm nóng, RDS chỉ chịu phần còn lại; lượt đọc đã có trong cache vẫn trả lời được khi RDS hỏng.
- Tấn công DDoS: botnet thêm 15.000 request rác/giây trong 24 giây mô phỏng, đi vào cùng cửa với người dùng thật. Shield chặn ~97% ở tầng mạng; chỉ có WAF (rate-based rule) chặn ~50%; không có cả hai thì request rác chiếm hết công suất.
- SQL injection: trong 20 giây, 45% request động mang mã SQL độc hại nhắm vào RDS. WAF chặn ~95%; Shield không giúp vì không đọc nội dung request; DynamoDB không dùng SQL nên không bị ảnh hưởng.
- WAF tính tiền theo giờ + theo request; Shield Standard miễn phí (Shield Advanced không mô phỏng).
- Lộ access key: 6 máy GPU đào coin, khoảng $400/giờ. GuardDuty ra finding sau 3 giây, Lambda khoá key và dừng máy sau 2 giây nữa (thực tế khoảng 15 phút). Không có GuardDuty: dữ liệu chi phí tới AWS Budgets chậm 12 giây mô phỏng (thực tế vài giờ), và Budgets chỉ cảnh báo, không tự dừng máy.
- Deploy lỗi: bản mới trả 500 cho mọi request động nó phục vụ. Deploy một lần: lên hết trong 2 giây mô phỏng, người trực phát hiện sau 12 giây (thực tế 15–30 phút) và deploy lại bản cũ trong 4 giây. Canary: bản mới chỉ nhận 10% traffic (ALB chia theo trọng số cho EC2, alias Lambda cho serverless — cần Load Balancer nếu dùng EC2), alarm 5xx kêu sau 3 giây (thực tế 1–3 phút) và traffic quay về bản cũ trong 1 giây. Health check vẫn xanh suốt sự cố.
- Báo cáo cuối tháng: trên RDS production, báo cáo chiếm database 16 giây mô phỏng (thực tế hàng chục phút) — mọi truy vấn chờ thêm 900 ms và 30% bị quá thời gian chờ; standby Multi-AZ không nhận truy vấn nên không giúp được, ElastiCache chỉ đỡ phần đọc có trong cache. DynamoDB không có GROUP BY: Scan cả bảng mất 14 giây, website không sao nhưng tốn đơn vị đọc (minh hoạ $6/giờ lúc đang Scan). Athena trên bản xuất Parquet (số liệu tới đêm qua) xong sau 3 giây; Redshift Serverless (zero-ETL, trễ vài giây) xong sau 2 giây nhưng chạy liên tục để nhận thay đổi — khoảng $1,5/giờ ở mức 4 RPU.
- S3, DynamoDB, Lambda, API Gateway, CloudFront không bị ảnh hưởng khi một AZ sập.
- Cả Region sập: mọi dịch vụ của Region chính ngừng trả lời, chỉ còn Route 53 và cache của CloudFront. Region dự phòng (Tokyo, chậm hơn khoảng 35 ms) tuỳ chiến lược: backup & restore chỉ có bản sao lưu — phải có người quyết định (3 giây mô phỏng, thực tế 15–30 phút) rồi dựng lại từ CloudFormation (14 giây, thực tế vài giờ) và khởi động máy; pilot light có dữ liệu đồng bộ, máy tắt — chờ quyết định rồi bật máy (5 giây) và promote database (2,5 giây, Aurora Global dưới 1 phút); warm standby có 1 EC2 chạy sẵn, Route 53 tự chuyển sau 3 lần health check thất bại (3 giây, thực tế 1–2 phút) rồi Auto Scaling thêm máy; active-active phục vụ sẵn một nửa người dùng. Trong lúc database bản sao chưa được promote, 30% request động (phần ghi) lỗi. Phục hồi: Tokyo giữ người dùng tới khi Singapore sẵn sàng rồi mới trả về (failback).

## Thêm một dịch vụ / bài học

1. Thêm nội dung vào `src/data/services.js` (`models` là các loại mô hình 3D đại diện cho dịch vụ, `keywords` là từ khoá thêm cho ô tìm kiếm) và icon vào `GLYPH` trong `src/ui/icons.jsx` — thiếu icon thì danh sách hiện icon quả địa cầu. `sandbox` là một gợi ý thử trong Sandbox, hoặc một danh sách gợi ý có `label`.
2. Thêm kịch bản vào `src/data/flows.js`: khai báo `nodes` (loại mô hình, vị trí) và `steps`. Mỗi bước có `title`, `text`, `cam`, các trường `show / hide / state / load / count`, danh sách hành động `run` (theo thời điểm `at`) và `loop`. Hành động: `packet`, `stream`, `callout`, `pulse`, `beam`, `break`, `fix`, `quake`, `show`, `hide`, `state`, `ghost`, `label`, `load`, `count`, `flash`, `focus`, `shake`, `sound`. Cần loại mô hình mới thì thêm vào `src/engine/models/index.js` và danh sách `KINDS` trong `test/flows.test.mjs`.
3. Thành phần con không có bài riêng (ví dụ NAT Gateway, Security Group nằm trong bài VPC): đặt `key` cho bước giải thích nó, thêm mô tả ngắn vào `OBJECT_INFO` và trỏ loại mô hình tới bước đó trong `LESSON_FOR` (`nat: ['vpc', 'nat']`). Bấm vào mô hình 3D hoặc nút ⓘ trong Sandbox sẽ mở bài lớn ngay tại bước đó.
4. Chạy `pnpm test` để kiểm tra kịch bản.
