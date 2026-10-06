// Scripted "how it works" flows for the explore view, one per service. A flow lists the
// models on its stage and a sequence of steps; see engine/exploreScene.js for the actions.
// Positions are in metres on a stage centred at the origin; things standing on an AZ
// platform use y = 0.25 (the platform's top).

const OK = '#4ade80';
const REQ = '#fbbf24';
const DB = '#f472b6';
const DNS = '#c4b5fd';
const BAD = '#f87171';
const PURPLE = '#a78bfa';
const CYAN = '#22d3ee';

const pk = (from, to, o = {}) => ({ do: 'packet', from, to, ...o });
const co = (node, text, kind = 'info', o = {}) => ({ do: 'callout', node, text, kind, ...o });
const at = (t, a) => ({ ...a, at: t });
const show = (node, t = 0) => ({ do: 'show', node, at: t });
const hide = (node, t = 0) => ({ do: 'hide', node, at: t });
const state = (node, value, t = 0) => ({ do: 'state', node, value, at: t });
const load = (node, value, t = 0) => ({ do: 'load', node, value, at: t });
const count = (node, value, t = 0) => ({ do: 'count', node, value, at: t });

export const FLOWS = {
  // ── Region & AZ ────────────────────────────────────────────────────────────
  foundation: {
    stage: { w: 34, d: 22 },
    cam: { target: [-8, 3.4, 0], dist: 15 },
    nodes: [
      { id: 'globe', kind: 'globe', pos: [-8, 0, 0], radius: 3.2, label: 'Hạ tầng toàn cầu AWS', sub: 'hơn 30 Region' },
      { id: 'region', kind: 'zone', pos: [6.5, 0.25, 0], w: 15, d: 13, top: '#e3ecfb', side: '#93a4c4', label: 'Region ap-southeast-1', sub: 'Singapore', labelPos: [0, 0.5, 6.6], hidden: true },
      { id: 'azA', kind: 'az', pos: [3.4, 0.5, -2.9], w: 5.4, d: 4.6, buildings: 2, label: 'AZ A', sub: 'ap-southeast-1a', labelPos: [-1.6, 0.5, 2.2], hidden: true, seed: 2 },
      { id: 'azB', kind: 'az', pos: [9.6, 0.5, -2.9], w: 5.4, d: 4.6, buildings: 2, label: 'AZ B', sub: 'ap-southeast-1b', labelPos: [-1.6, 0.5, 2.2], hidden: true, seed: 4 },
      { id: 'azC', kind: 'az', pos: [6.5, 0.5, 3.2], w: 5.4, d: 4.6, buildings: 2, label: 'AZ C', sub: 'ap-southeast-1c', labelPos: [-1.6, 0.5, 2.2], hidden: true, seed: 6 },
      { id: 'appA', kind: 'ec2', pos: [3.4, 0.5, -1.9], label: 'App', small: true, hidden: true },
      { id: 'appB', kind: 'ec2', pos: [9.6, 0.5, -1.9], label: 'App', small: true, hidden: true },
      { id: 'appC', kind: 'ec2', pos: [6.5, 0.5, 4.2], label: 'App', small: true, hidden: true },
      { id: 'user', kind: 'user', pos: [-3, 0, 7.5], label: 'Người dùng Việt Nam', hidden: true },
    ],
    steps: [
      {
        title: 'AWS có mặt khắp thế giới',
        text: 'AWS chia hạ tầng thành nhiều Region trên các châu lục. Mỗi chấm sáng là một Region (ở đây chỉ vẽ vài Region tiêu biểu). Khi tạo tài nguyên, bạn chọn nó nằm ở Region nào.',
        dur: 6,
        run: [
          at(0.5, co('globe', 'Singapore', 'warn', { pin: 'singapore', dy: 0.4 })),
          at(1.3, co('globe', 'Tokyo', 'info', { pin: 'tokyo', dy: 0.4 })),
          at(2.1, co('globe', 'Mumbai', 'info', { pin: 'mumbai', dy: 0.4 })),
          at(2.9, co('globe', 'Sydney', 'info', { pin: 'sydney', dy: 0.4 })),
        ],
      },
      {
        title: 'Một Region là một vùng địa lý',
        text: 'Ví dụ Region ap-southeast-1 đặt ở Singapore. Các Region độc lập với nhau: dữ liệu của bạn không tự rời khỏi Region nếu bạn không cấu hình.',
        cam: { target: [2, 1, 0], dist: 28 },
        show: ['region'],
        run: [at(0.3, pk('globe', 'region', { fromPin: 'singapore', color: '#fb923c', label: 'ap-southeast-1', speed: 6 }))],
      },
      {
        title: 'Region gồm nhiều Availability Zone',
        text: 'Mỗi Region có ít nhất 3 AZ. Mỗi AZ là một hoặc nhiều trung tâm dữ liệu, đặt cách nhau hàng km tới vài chục km.',
        cam: { target: [6.5, 0.5, 0.3], dist: 21 },
        run: [show('azA', 0.2), show('azB', 0.8), show('azC', 1.4)],
      },
      {
        title: 'Mỗi AZ độc lập',
        text: 'Mỗi AZ có nguồn điện, đường mạng và hệ thống làm mát riêng. Sự cố ở AZ này (mất điện, cháy, lũ) không kéo theo AZ khác.',
        cam: { node: 'azA', dist: 11 },
        run: [at(0.4, co('azA', '⚡ Nguồn điện riêng', 'warn', { dy: 2.2 })), at(1.6, co('azA', '🌐 Mạng riêng', 'info', { dy: 2.2 })), at(2.8, co('azA', '❄ Làm mát riêng', 'info', { dy: 2.2 }))],
      },
      {
        title: 'Các AZ nối với nhau bằng mạng tốc độ cao',
        text: 'Đường mạng riêng giữa các AZ có độ trễ chỉ vài mili-giây, đủ nhanh để đồng bộ dữ liệu liên tục giữa các bản sao.',
        cam: { target: [6.5, 0.5, 0.3], dist: 20 },
        loop: { every: 1.2, run: [pk('azA', 'azB', { color: '#7dd3fc', size: 0.7, speed: 9 }), at(0.4, pk('azB', 'azC', { color: '#7dd3fc', size: 0.7, speed: 9 })), at(0.8, pk('azC', 'azA', { color: '#7dd3fc', size: 0.7, speed: 9 }))] },
      },
      {
        title: 'Thiên tai chỉ ảnh hưởng một AZ',
        text: 'Ứng dụng chạy bản sao ở cả 3 AZ. Động đất làm AZ A mất điện — bản ở AZ B và C vẫn chạy bình thường.',
        show: ['appA', 'appB', 'appC'],
        dur: 8,
        run: [at(1.6, { do: 'quake', node: 'azA', breaks: ['appA'] }), at(3.4, co('azB', 'AZ B vẫn chạy ✓', 'good', { dy: 2.4 })), at(3.8, co('azC', 'AZ C vẫn chạy ✓', 'good', { dy: 2.4 }))],
      },
      {
        title: 'Bài học: luôn dùng ít nhất 2 AZ',
        text: 'Đặt bản sao ứng dụng và dữ liệu ở nhiều AZ (Multi-AZ). Một AZ gặp sự cố, các AZ còn lại tiếp tục phục vụ. S3, DynamoDB, Lambda tự làm điều này cho bạn.',
        cam: { target: [4, 0.5, 2], dist: 25 },
        show: ['user'],
        loop: { every: 1.4, run: [pk('user', 'appB', { color: OK, size: 0.8 }), at(0.7, pk('user', 'appC', { color: OK, size: 0.8 }))] },
      },
      {
        title: 'Chọn Region nào?',
        text: 'Ưu tiên Region gần người dùng (độ trễ thấp), đáp ứng quy định về nơi lưu dữ liệu, có đủ dịch vụ bạn cần và giá phù hợp.',
        cam: { target: [-2, 1.5, 2], dist: 30 },
        loop: { every: 3.2, run: [pk('user', 'region', { color: OK, label: 'Singapore ≈ 40 ms', speed: 6 }), at(1.2, pk('user', 'globe', { toPin: 'virginia', color: BAD, label: 'Mỹ ≈ 250 ms', speed: 6 }))] },
      },
    ],
  },

  // ── EC2 ────────────────────────────────────────────────────────────────────
  ec2: {
    stage: { w: 32, d: 19 },
    cam: { target: [-4, 1, -2.5], dist: 16 },
    nodes: [
      { id: 'user', kind: 'user', pos: [-11, 0, 3], label: 'Người dùng' },
      { id: 'hacker', kind: 'user', shirt: '#ef4444', pos: [-11, 0, -4], label: 'Kẻ lạ', sub: 'quét cổng SSH', hidden: true },
      { id: 'crowd', kind: 'users', pos: [-11, 0, 0], radius: 4.5, label: 'Rất nhiều người dùng', hidden: true, count: 0 },
      { id: 'ami', kind: 'token', shape: 'disc', text: 'AMI', color: '#334155', pos: [-6, 0, -5.5], size: 1.3, label: 'AMI', sub: 'Ubuntu 24.04', hidden: true },
      { id: 'type', kind: 'token', shape: 'cube', text: 't3', color: '#9a3412', pos: [-2.3, 0, -5.5], size: 1.0, label: 'Instance type', sub: 't3.medium · 2 vCPU · 4 GiB', hidden: true },
      { id: 'az', kind: 'az', pos: [4.5, 0.25, 0], w: 11, d: 9, buildings: 2, label: 'AZ A', sub: 'ap-southeast-1a', labelPos: [-4.4, 0.5, 3.6], hidden: true },
      { id: 'sg', kind: 'outline', pos: [4.5, 0.3, 0], w: 4.6, d: 4.6, r: 0.8, color: '#DD344C', label: 'Security Group', sub: 'mở cổng 80, 443', labelPos: [0, 0.4, 2.5], hidden: true },
      { id: 'ec2', kind: 'ec2', pos: [4.5, 0.25, 0], label: 'EC2 instance', sub: 'i-0a1b2c3d', hidden: true },
      { id: 'ebs', kind: 'token', shape: 'disc', text: 'EBS', color: '#3f6212', pos: [7.6, 0.25, 2.4], size: 1.0, label: 'Ổ đĩa EBS', sub: '30 GB', hidden: true },
    ],
    steps: [
      {
        title: 'Chọn AMI',
        text: 'AMI là khuôn mẫu ổ đĩa: hệ điều hành (Amazon Linux, Ubuntu, Windows…) cùng phần mềm cài sẵn. Mỗi EC2 được tạo ra từ một AMI.',
        show: ['ami'],
        dur: 5,
      },
      {
        title: 'Chọn instance type',
        text: 'Instance type quyết định CPU, RAM và mạng. Họ t (t3, t4g) rẻ, hợp web nhỏ; họ c mạnh CPU; họ r nhiều RAM. Cần mạnh hơn thì đổi type lớn hơn (scale up).',
        show: ['type'],
        dur: 5,
      },
      {
        title: 'Khởi chạy trong một AZ',
        text: 'EC2 luôn chạy trong một AZ cụ thể. Sau khoảng một phút máy chuyển sang trạng thái running và có địa chỉ IP.',
        cam: { target: [1, 1, -1], dist: 22 },
        show: ['az'],
        run: [show('ec2', 0.2), state('ec2', 'pending', 0.2), at(0.5, pk('ami', 'ec2', { shape: 'disc', color: '#94a3b8', label: 'AMI' })), at(0.9, pk('type', 'ec2', { shape: 'cube', color: '#fb923c', label: 't3.medium' })), state('ec2', 'ok', 2.8), at(2.8, co('ec2', 'running ✓', 'good'))],
      },
      {
        title: 'Gắn ổ đĩa EBS',
        text: 'EBS là ổ đĩa mạng gắn vào EC2; dữ liệu vẫn còn khi tắt máy. Ổ EBS nằm trong cùng AZ với máy — nên chụp snapshot (lưu sang S3) để dự phòng.',
        cam: { target: [5.5, 1, 1], dist: 14 },
        show: ['ebs'],
        run: [at(0.5, pk('ebs', 'ec2', { shape: 'disc', color: '#84cc16', label: 'gắn ổ đĩa', speed: 4 })), at(1.8, co('ec2', '/dev/xvda ✓', 'good'))],
      },
      {
        title: 'Security Group: tường lửa ảo',
        text: 'Security Group quy định cổng nào được phép vào. Ở đây chỉ mở HTTP/HTTPS cho mọi người; cổng SSH (22) bị chặn với người lạ.',
        cam: { target: [-3, 1, 0], dist: 25 },
        show: ['sg', 'hacker'],
        dur: 8,
        loop: {
          every: 2.4,
          run: [pk('user', 'ec2', { label: 'HTTPS :443', back: { label: '200 OK', color: OK } }), at(0.8, pk('hacker', 'ec2', { label: 'SSH :22', color: BAD, fail: 'bounce', then: [co('ec2', 'Bị chặn ✗', 'bad')] }))],
        },
      },
      {
        title: 'Phục vụ người dùng',
        text: 'Web server trên EC2 nhận request và trả kết quả. CPU tăng dần theo lượng người dùng.',
        hide: ['hacker'],
        load: { ec2: 0.35 },
        loop: { every: 0.9, run: [pk('user', 'ec2', { label: 'GET /', back: { label: '200 OK', color: OK } })] },
      },
      {
        title: 'Giới hạn của một máy',
        text: 'Lượng người dùng tăng vọt, một EC2 quá tải: CPU 100%, request bị từ chối. Và nếu máy hỏng, website sập hoàn toàn. Giải pháp: nhiều EC2 + Load Balancer + Auto Scaling (xem các bài tiếp theo).',
        cam: { target: [-3, 1, 0], dist: 26 },
        hide: ['user'],
        show: ['crowd'],
        count: { crowd: 160 },
        dur: 10,
        run: [load('ec2', 1.4, 0.6), at(1.5, co('ec2', 'CPU 100%!', 'warn')), at(5, { do: 'break', node: 'ec2' }), at(5.3, co('ec2', 'Website sập!', 'bad', { dur: 3 }))],
        loop: { every: 0.35, run: [pk('crowd', 'ec2', { speed: 9, size: 0.7 }), at(0.17, pk('crowd', 'ec2', { speed: 9, size: 0.7, fail: 'drop' }))] },
      },
    ],
  },

  // ── S3 ─────────────────────────────────────────────────────────────────────
  s3: {
    stage: { w: 32, d: 19 },
    cam: { target: [-4, 1, 0], dist: 20 },
    nodes: [
      { id: 'user', kind: 'user', pos: [-11, 0, 0], label: 'Bạn', sub: 'ứng dụng ảnh' },
      { id: 's3', kind: 's3', pos: [0, 0, 0], label: 'S3 bucket', sub: 'my-photos-2025', hidden: true },
      { id: 'azA', kind: 'az', pos: [9, 0.25, -5.2], w: 5, d: 3.6, label: 'AZ A', labelPos: [-1.9, 0.5, 1.4], hidden: true, seed: 2 },
      { id: 'azB', kind: 'az', pos: [10.5, 0.25, 0], w: 5, d: 3.6, label: 'AZ B', labelPos: [-1.9, 0.5, 1.4], hidden: true, seed: 5 },
      { id: 'azC', kind: 'az', pos: [9, 0.25, 5.2], w: 5, d: 3.6, label: 'AZ C', labelPos: [-1.9, 0.5, 1.4], hidden: true, seed: 8 },
      { id: 'cA', kind: 'token', text: 'IMG', color: '#0f766e', pos: [9.6, 0.25, -5.2], size: 0.8, hidden: true },
      { id: 'cB', kind: 'token', text: 'IMG', color: '#0f766e', pos: [11.1, 0.25, 0], size: 0.8, hidden: true },
      { id: 'cC', kind: 'token', text: 'IMG', color: '#0f766e', pos: [9.6, 0.25, 5.2], size: 0.8, hidden: true },
      { id: 'glacier', kind: 'token', text: 'Glacier', fontSize: 64, color: '#0e7490', pos: [0, 0, 6.5], size: 1.2, label: 'S3 Glacier', sub: 'lưu trữ lạnh, rất rẻ', hidden: true },
    ],
    steps: [
      {
        title: 'Tạo bucket',
        text: 'Bucket là "thùng" chứa file, có tên duy nhất trên toàn thế giới và nằm trong Region bạn chọn. Mặc định bucket là riêng tư.',
        show: ['s3'],
        dur: 5,
      },
      {
        title: 'Tải file lên (PUT)',
        text: 'Mỗi file là một object, định danh bằng key như photos/cat.jpg. Một object có thể từ vài byte tới 5 TB.',
        run: [at(0.4, pk('user', 's3', { shape: 'cube', color: '#38bdf8', label: 'PUT photos/cat.jpg', then: [co('s3', '200 OK · đã lưu', 'good')] }))],
      },
      {
        title: 'Tự sao chép sang ít nhất 3 AZ',
        text: 'S3 Standard lưu dữ liệu ở tối thiểu 3 AZ ngay khi bạn upload. Nhờ vậy độ bền thiết kế đạt 99,999999999% (11 số 9).',
        cam: { target: [5, 1, 0], dist: 23 },
        run: [
          show('azA', 0.2),
          show('azB', 0.5),
          show('azC', 0.8),
          at(1.3, pk('s3', 'cA', { shape: 'cube', color: '#2dd4bf', size: 0.8, then: [show('cA')] })),
          at(1.5, pk('s3', 'cB', { shape: 'cube', color: '#2dd4bf', size: 0.8, then: [show('cB')] })),
          at(1.7, pk('s3', 'cC', { shape: 'cube', color: '#2dd4bf', size: 0.8, then: [show('cC')] })),
        ],
      },
      {
        title: 'Đọc file qua URL (GET)',
        text: 'Ứng dụng hoặc trình duyệt đọc file qua URL. S3 tự xử lý hàng nghìn request mỗi giây mà bạn không phải thêm máy chủ nào.',
        cam: { target: [-1, 1, 0], dist: 24 },
        loop: { every: 1.5, run: [pk('user', 's3', { label: 'GET cat.jpg', back: { label: 'cat.jpg', color: OK, shape: 'cube' } })] },
      },
      {
        title: 'Một AZ gặp sự cố',
        text: 'Động đất làm AZ B mất kết nối, nhưng bản sao ở AZ A và AZ C vẫn còn: file vẫn đọc được bình thường.',
        cam: { target: [3, 1, 0], dist: 25 },
        dur: 8,
        run: [at(0.6, { do: 'quake', node: 'azB', breaks: ['cB'] }), at(2.6, co('s3', 'Vẫn đọc được ✓', 'good'))],
        loop: { start: 2, every: 1.5, run: [pk('user', 's3', { label: 'GET cat.jpg', back: { label: 'cat.jpg', color: OK, shape: 'cube' } })] },
      },
      {
        title: 'Lớp lưu trữ & vòng đời',
        text: 'File ít dùng có thể tự chuyển sang lớp rẻ hơn (Standard-IA, Glacier) bằng lifecycle rule. Bật Versioning để khôi phục khi lỡ xoá hoặc ghi đè.',
        cam: { target: [0, 1, 3], dist: 18 },
        show: ['glacier'],
        run: [at(0.8, pk('s3', 'glacier', { shape: 'cube', color: '#67e8f9', label: 'ảnh cũ > 90 ngày', speed: 5 }))],
      },
    ],
  },

  // ── Elastic Load Balancing ─────────────────────────────────────────────────
  elb: {
    stage: { w: 32, d: 20 },
    cam: { target: [-6, 1, 0], dist: 22 },
    nodes: [
      { id: 'crowd', kind: 'users', pos: [-12, 0, 0], radius: 4.5, count: 40, label: 'Người dùng' },
      { id: 'elb', kind: 'elb', pos: [-3.5, 0, 0], label: 'Application Load Balancer', sub: 'shop-alb', hidden: true },
      { id: 'azA', kind: 'az', pos: [6, 0.25, -4], w: 11, d: 6, label: 'AZ A', labelPos: [-4.6, 0.5, 2.4], hidden: true, seed: 3 },
      { id: 'azB', kind: 'az', pos: [6, 0.25, 4.2], w: 11, d: 6, label: 'AZ B', labelPos: [-4.6, 0.5, 2.4], hidden: true, seed: 6 },
      { id: 'e1', kind: 'ec2', pos: [4, 0.25, -4], label: 'EC2 #1', small: true, hidden: true },
      { id: 'e2', kind: 'ec2', pos: [8, 0.25, -4], label: 'EC2 #2', small: true, hidden: true },
      { id: 'e3', kind: 'ec2', pos: [6, 0.25, 4.2], label: 'EC2 #3', small: true, hidden: true },
    ],
    steps: [
      {
        title: 'Một địa chỉ duy nhất',
        text: 'Người dùng không cần biết phía sau có bao nhiêu máy chủ. Họ chỉ gửi request tới tên miền của Load Balancer.',
        show: ['elb'],
        dur: 5,
        loop: { every: 0.6, run: [pk('crowd', 'elb', { size: 0.8 })] },
      },
      {
        title: 'Chia tải cho nhiều máy',
        text: 'ELB chia request cho các EC2 khoẻ ở cả 2 AZ. Mỗi máy chỉ phải gánh một phần tải.',
        cam: { target: [1, 1, 0], dist: 27 },
        show: ['azA', 'azB', 'e1', 'e2', 'e3'],
        load: { e1: 0.3, e2: 0.3, e3: 0.3 },
        loop: { every: 0.75, run: [pk('crowd', 'e1', { via: ['elb'], size: 0.8 }), at(0.25, pk('crowd', 'e2', { via: ['elb'], size: 0.8 })), at(0.5, pk('crowd', 'e3', { via: ['elb'], size: 0.8 }))] },
      },
      {
        title: 'Health check',
        text: 'Vài giây một lần, ELB gọi thử đường dẫn /health trên từng máy. Máy trả lời 200 OK được coi là khoẻ (healthy).',
        loop: {
          every: 2,
          run: [
            pk('elb', 'e1', { label: '/health', color: PURPLE, size: 0.6, back: { label: '200 OK', color: OK } }),
            at(0.2, pk('elb', 'e2', { label: '/health', color: PURPLE, size: 0.6, back: { label: '200 OK', color: OK } })),
            at(0.4, pk('elb', 'e3', { label: '/health', color: PURPLE, size: 0.6, back: { label: '200 OK', color: OK } })),
          ],
        },
      },
      {
        title: 'Một máy hỏng',
        text: 'EC2 #2 hỏng. Sau 2 lần health check thất bại liên tiếp, ELB đánh dấu máy là Unhealthy và ngừng gửi request tới nó. Người dùng không hề hay biết.',
        dur: 9,
        run: [
          at(0.5, { do: 'break', node: 'e2' }),
          at(1.0, pk('elb', 'e2', { label: '/health', color: PURPLE, size: 0.6, fail: 'bounce' })),
          at(2.2, pk('elb', 'e2', { label: '/health', color: PURPLE, size: 0.6, fail: 'bounce' })),
          at(3.2, co('e2', 'Unhealthy → loại', 'warn')),
          load('e1', 0.45, 3.2),
          load('e3', 0.45, 3.2),
        ],
        loop: { start: 3.4, every: 0.75, run: [pk('crowd', 'e1', { via: ['elb'], size: 0.8 }), at(0.37, pk('crowd', 'e3', { via: ['elb'], size: 0.8 }))] },
      },
      {
        title: 'Cả một AZ gặp sự cố',
        text: 'Động đất làm AZ A mất kết nối. ELB vẫn còn ở AZ B nên dồn mọi request về EC2 #3 — nhưng một máy phải gánh toàn bộ tải. Auto Scaling sẽ giúp tự thêm máy bù (bài tiếp theo).',
        dur: 9,
        run: [at(0.6, { do: 'quake', node: 'azA', breaks: ['e1'] }), load('e3', 0.95, 2), at(2.6, co('e3', 'CPU 95%!', 'warn'))],
        loop: { start: 1.5, every: 0.45, run: [pk('crowd', 'e3', { via: ['elb'], size: 0.8 })] },
      },
      {
        title: 'ALB hay NLB?',
        text: 'ALB (tầng 7) hiểu HTTP: định tuyến theo đường dẫn /api, /images hay theo tên miền. NLB (tầng 4) chuyển tiếp TCP/UDP cực nhanh, có IP tĩnh. Web/API thông thường: chọn ALB.',
        run: [{ do: 'fix', node: 'azA' }, { do: 'fix', node: 'e1' }, { do: 'fix', node: 'e2' }, load('e1', 0.3), load('e2', 0.3), load('e3', 0.3), at(0.6, co('elb', 'ALB · HTTP/HTTPS', 'info', { dur: 3 })), at(2, co('elb', 'NLB · TCP/UDP', 'info', { dur: 3 }))],
        loop: { start: 0.5, every: 0.75, run: [pk('crowd', 'e1', { via: ['elb'], size: 0.8 }), at(0.25, pk('crowd', 'e2', { via: ['elb'], size: 0.8 })), at(0.5, pk('crowd', 'e3', { via: ['elb'], size: 0.8 }))] },
      },
    ],
  },

  // ── Auto Scaling ───────────────────────────────────────────────────────────
  asg: {
    stage: { w: 36, d: 20 },
    cam: { target: [1, 1, 0], dist: 33 },
    nodes: [
      { id: 'crowd', kind: 'users', pos: [-14, 0, 0], radius: 4, count: 30, label: 'Người dùng' },
      { id: 'elb', kind: 'elb', pos: [-6, 0, 0], label: 'Load Balancer' },
      { id: 'azA', kind: 'az', pos: [5, 0.25, -3.2], w: 13, d: 5.4, label: 'AZ A', labelPos: [-5.7, 0.5, 2.2], seed: 2 },
      { id: 'azB', kind: 'az', pos: [5, 0.25, 3.2], w: 13, d: 5.4, label: 'AZ B', labelPos: [-5.7, 0.5, 2.2], seed: 9 },
      { id: 'grp', kind: 'outline', pos: [5, 0.3, 0], w: 13.6, d: 12, r: 1, color: '#ED7100', fill: 0.06, speed: 0.6, label: 'Auto Scaling Group', sub: 'min 2 · desired 2 · max 6', labelPos: [0, 0.4, 6.3] },
      { id: 's1', kind: 'ec2', pos: [1, 0.25, -3.2], label: 'EC2', small: true },
      { id: 's2', kind: 'ec2', pos: [1, 0.25, 3.2], label: 'EC2', small: true },
      { id: 's3', kind: 'ec2', pos: [5, 0.25, -3.2], label: 'EC2', small: true, hidden: true },
      { id: 's4', kind: 'ec2', pos: [5, 0.25, 3.2], label: 'EC2', small: true, hidden: true },
      { id: 's5', kind: 'ec2', pos: [9, 0.25, -3.2], label: 'EC2', small: true, hidden: true },
      { id: 'cw', kind: 'cloudwatch', pos: [15, 0, -1], label: 'CloudWatch', sub: 'CPU trung bình' },
    ],
    steps: [
      {
        title: 'Nhóm Auto Scaling',
        text: 'Bạn khai báo số máy tối thiểu (min), mong muốn (desired) và tối đa (max). Auto Scaling luôn giữ đúng số máy desired và rải đều qua các AZ.',
        load: { s1: 0.3, s2: 0.3, cw: 0.3 },
        loop: { every: 0.9, run: [pk('crowd', 's1', { via: ['elb'], size: 0.8 }), at(0.45, pk('crowd', 's2', { via: ['elb'], size: 0.8 }))] },
      },
      {
        title: 'Traffic tăng',
        text: 'Khách kéo đến đông. CloudWatch đo CPU trung bình của nhóm vượt ngưỡng 70%.',
        count: { crowd: 200 },
        load: { s1: 0.92, s2: 0.92, cw: 0.9 },
        run: [at(1.6, co('cw', 'CPU 90%', 'warn', { dy: 1.6 }))],
        loop: { every: 0.4, run: [pk('crowd', 's1', { via: ['elb'], size: 0.7 }), at(0.2, pk('crowd', 's2', { via: ['elb'], size: 0.7 }))] },
      },
      {
        title: 'Alarm → Scale out',
        text: 'CloudWatch Alarm báo động, chính sách scaling tăng desired từ 2 lên 4. Auto Scaling dùng launch template tạo 2 EC2 mới (thực tế mất 1–3 phút để khởi động).',
        cam: { target: [6, 1, 0], dist: 24 },
        label: { grp: ['Auto Scaling Group', 'min 2 · desired 4 · max 6'] },
        dur: 8,
        run: [
          at(0.2, co('cw', 'ALARM', 'bad', { dy: 1.6 })),
          at(0.6, pk('cw', 'grp', { color: '#fb923c', label: 'desired: 2 → 4', speed: 5 })),
          show('s3', 1.8),
          state('s3', 'pending', 1.8),
          show('s4', 2.1),
          state('s4', 'pending', 2.1),
          state('s3', 'ok', 4.3),
          state('s4', 'ok', 4.6),
          at(4.4, co('s3', 'InService ✓', 'good')),
        ],
        loop: { every: 0.4, run: [pk('crowd', 's1', { via: ['elb'], size: 0.7 }), at(0.2, pk('crowd', 's2', { via: ['elb'], size: 0.7 }))] },
      },
      {
        title: 'Tải được chia đều',
        text: 'ELB tự nhận các máy mới. CPU mỗi máy giảm về khoảng 50% — người dùng lại thấy web nhanh.',
        load: { s1: 0.5, s2: 0.5, s3: 0.5, s4: 0.5, cw: 0.5 },
        loop: {
          every: 0.6,
          run: [pk('crowd', 's1', { via: ['elb'], size: 0.7 }), at(0.15, pk('crowd', 's2', { via: ['elb'], size: 0.7 })), at(0.3, pk('crowd', 's3', { via: ['elb'], size: 0.7 })), at(0.45, pk('crowd', 's4', { via: ['elb'], size: 0.7 }))],
        },
      },
      {
        title: 'Tự chữa lành (self-healing)',
        text: 'Một EC2 hỏng. Auto Scaling phát hiện máy không khoẻ, huỷ nó và tạo máy thay thế — không cần ai can thiệp.',
        dur: 8,
        run: [
          at(0.4, { do: 'break', node: 's3' }),
          at(1.6, co('s3', 'Unhealthy', 'warn')),
          hide('s3', 2.6),
          show('s5', 3.0),
          state('s5', 'pending', 3.0),
          state('s5', 'ok', 5.0),
          load('s5', 0.5, 5.0),
          at(5.1, co('s5', 'Máy thay thế ✓', 'good')),
        ],
        loop: { every: 0.6, run: [pk('crowd', 's1', { via: ['elb'], size: 0.7 }), at(0.2, pk('crowd', 's2', { via: ['elb'], size: 0.7 })), at(0.4, pk('crowd', 's4', { via: ['elb'], size: 0.7 }))] },
      },
      {
        title: 'Đêm xuống → Scale in',
        text: 'Ít khách, CPU chỉ còn 10%. Auto Scaling giảm desired về min = 2 và tắt bớt máy để tiết kiệm chi phí.',
        count: { crowd: 15 },
        load: { s1: 0.1, s2: 0.1, s4: 0.1, s5: 0.1, cw: 0.1 },
        label: { grp: ['Auto Scaling Group', 'min 2 · desired 2 · max 6'] },
        run: [hide('s4', 1.6), hide('s5', 2.1), at(1.7, co('grp', 'Scale in: −2 EC2', 'good', { dy: 3 }))],
        loop: { every: 1.4, run: [pk('crowd', 's1', { via: ['elb'], size: 0.7 }), at(0.7, pk('crowd', 's2', { via: ['elb'], size: 0.7 }))] },
      },
    ],
  },

  // ── RDS ────────────────────────────────────────────────────────────────────
  rds: {
    stage: { w: 32, d: 19 },
    cam: { target: [-2, 1, -2], dist: 21 },
    nodes: [
      { id: 'azA', kind: 'az', pos: [-1.5, 0.25, -3.5], w: 15, d: 5.6, label: 'AZ A', labelPos: [-6.6, 0.5, 2.3], seed: 2 },
      { id: 'azB', kind: 'az', pos: [-1.5, 0.25, 3.5], w: 15, d: 5.6, label: 'AZ B', labelPos: [-6.6, 0.5, 2.3], seed: 5 },
      { id: 'app', kind: 'ec2', pos: [-6.5, 0.25, -3.5], label: 'App server', sub: 'EC2' },
      { id: 'primary', kind: 'rds', pos: [2.5, 0.25, -3.5], label: 'RDS Primary', sub: 'MySQL' },
      { id: 'standby', kind: 'rds', pos: [2.5, 0.25, 3.5], label: 'RDS Standby', sub: 'đồng bộ', ghost: true, hidden: true },
      { id: 's3', kind: 's3', pos: [11, 0, 0], label: 'S3', sub: 'nơi lưu backup', hidden: true },
    ],
    steps: [
      {
        title: 'Ứng dụng truy vấn database',
        text: 'Ứng dụng kết nối tới RDS qua một endpoint (tên DNS) và gửi câu lệnh SQL như với MySQL hay PostgreSQL bình thường.',
        loop: { every: 1.6, run: [pk('app', 'primary', { label: 'SELECT * FROM orders', color: DB, back: { label: '25 dòng', color: OK } })] },
      },
      {
        title: 'Ghi dữ liệu',
        text: 'Lệnh INSERT/UPDATE thay đổi dữ liệu. AWS lo phần cứng, vá lỗi hệ điều hành và phần mềm database cho bạn.',
        loop: { every: 1.6, run: [pk('app', 'primary', { label: 'INSERT order #1024', color: DB, back: { label: 'OK', color: OK } })] },
      },
      {
        title: 'Multi-AZ: bản standby',
        text: 'Bật Multi-AZ, RDS tạo một bản standby ở AZ khác. Mọi thay đổi được ghi đồng bộ sang standby trước khi báo thành công cho ứng dụng.',
        cam: { target: [-1, 1, 0], dist: 23 },
        show: ['standby'],
        loop: { every: 1.8, run: [pk('app', 'primary', { label: 'INSERT', color: DB, then: [pk('primary', 'standby', { label: 'đồng bộ', color: '#f0abfc', size: 0.7, speed: 6 })] })] },
      },
      {
        title: 'Sao lưu tự động',
        text: 'Mỗi ngày RDS chụp snapshot và lưu log giao dịch vào S3 (giữ 1–35 ngày). Bạn có thể khôi phục về gần như bất kỳ thời điểm nào (point-in-time restore).',
        cam: { target: [3, 1, 0], dist: 26 },
        show: ['s3'],
        run: [at(0.5, pk('primary', 's3', { shape: 'cube', color: '#a3e635', label: 'snapshot 02:00', speed: 5 }))],
        loop: { start: 2.5, every: 0.9, run: [pk('primary', 's3', { color: '#a3e635', size: 0.5 })] },
      },
      {
        title: 'Primary hỏng → Failover',
        text: 'Ổ đĩa của primary hỏng. RDS tự chuyển endpoint sang standby (failover) trong khoảng 1–2 phút. Ứng dụng kết nối lại vào cùng endpoint, dữ liệu không mất.',
        cam: { target: [-1, 1, 0], dist: 23 },
        dur: 10,
        run: [
          at(0.5, { do: 'break', node: 'primary' }),
          at(0.9, pk('app', 'primary', { label: 'INSERT', color: DB, fail: 'drop' })),
          state('standby', 'promoting', 1.6),
          at(1.6, co('standby', 'Failover…', 'warn')),
          { do: 'ghost', node: 'standby', value: false, at: 4.2 },
          state('standby', 'ok', 4.2),
          { do: 'label', node: 'standby', title: 'RDS Primary (mới)', sub: 'MySQL', at: 4.2 },
          at(4.3, co('standby', 'Primary mới ✓', 'good')),
        ],
        loop: { start: 4.8, every: 1.6, run: [pk('app', 'standby', { label: 'INSERT', color: DB, back: { label: 'OK', color: OK } })] },
      },
      {
        title: 'Khi nào chọn RDS?',
        text: 'Dữ liệu quan hệ, cần JOIN và transaction (đơn hàng, tài khoản). Đọc nhiều? Thêm Read Replica. Cần hiệu năng cao hơn nữa: Amazon Aurora.',
        cam: { target: [1, 1, 0], dist: 28 },
        loop: { every: 1.6, run: [pk('app', 'standby', { label: 'SELECT', color: DB, back: { label: 'rows', color: OK } })] },
      },
    ],
  },

  // ── DynamoDB ───────────────────────────────────────────────────────────────
  dynamodb: {
    stage: { w: 32, d: 19 },
    cam: { target: [-4, 1, 0], dist: 20 },
    nodes: [
      { id: 'app', kind: 'lambda', pos: [-9, 0, 0], label: 'Ứng dụng', sub: 'Lambda', count: 6 },
      { id: 'ddb', kind: 'dynamodb', pos: [1, 0, 0], label: 'DynamoDB', sub: 'bảng Users', hidden: true },
      { id: 'azA', kind: 'az', pos: [9.5, 0.25, -5.2], w: 4.6, d: 3.4, label: 'AZ A', labelPos: [-1.7, 0.5, 1.3], hidden: true, seed: 3 },
      { id: 'azB', kind: 'az', pos: [11, 0.25, 0], w: 4.6, d: 3.4, label: 'AZ B', labelPos: [-1.7, 0.5, 1.3], hidden: true, seed: 6 },
      { id: 'azC', kind: 'az', pos: [9.5, 0.25, 5.2], w: 4.6, d: 3.4, label: 'AZ C', labelPos: [-1.7, 0.5, 1.3], hidden: true, seed: 9 },
    ],
    steps: [
      {
        title: 'Bảng, item và khoá',
        text: 'Mỗi bảng chứa các item (giống một bản ghi JSON). Item được tìm bằng partition key — ví dụ userId.',
        show: ['ddb'],
        run: [at(0.6, pk('app', 'ddb', { shape: 'card', color: DB, label: '{ userId: "u42", name: "An" }', speed: 5, then: [co('ddb', 'PutItem ✓', 'good')] }))],
      },
      {
        title: 'Partition key quyết định vị trí',
        text: 'DynamoDB băm (hash) partition key để chọn partition lưu item. Dữ liệu tự chia ra nhiều partition nên bảng lớn bao nhiêu cũng được.',
        run: [at(0.5, co('ddb', 'hash("u42") → partition 2', 'info', { dur: 3.5 }))],
        loop: { start: 1, every: 1.4, run: [pk('app', 'ddb', { label: 'u7', color: DB, size: 0.7 }), at(0.45, pk('app', 'ddb', { label: 'u19', color: DB, size: 0.7 })), at(0.9, pk('app', 'ddb', { label: 'u42', color: DB, size: 0.7 }))] },
      },
      {
        title: 'Tự nhân bản qua 3 AZ',
        text: 'Mỗi lần ghi được sao chép sang 3 AZ trong Region. Bạn không phải cấu hình gì thêm.',
        cam: { target: [5, 1, 0], dist: 23 },
        run: [show('azA', 0.2), show('azB', 0.5), show('azC', 0.8)],
        loop: { start: 1.2, every: 1.6, run: [pk('ddb', 'azA', { color: '#f0abfc', size: 0.7 }), pk('ddb', 'azB', { color: '#f0abfc', size: 0.7 }), pk('ddb', 'azC', { color: '#f0abfc', size: 0.7 })] },
      },
      {
        title: 'Đọc theo khoá: vài mili-giây',
        text: 'GetItem theo khoá trả kết quả trong vài mili-giây, dù bảng có hàng tỷ item.',
        cam: { target: [-3, 1, 0], dist: 21 },
        loop: { every: 1.3, run: [pk('app', 'ddb', { label: 'GetItem u42', color: DB, back: { label: '5 ms ✓', color: OK } })] },
      },
      {
        title: 'Traffic tăng vọt',
        text: 'Ở chế độ on-demand, DynamoDB tự tăng năng lực đọc/ghi theo lượng request — không có máy chủ nào để nâng cấp.',
        count: { app: 140 },
        loop: { every: 0.18, run: [pk('app', 'ddb', { color: DB, size: 0.6, speed: 10 })] },
      },
      {
        title: 'Khi nào dùng DynamoDB?',
        text: 'Hợp với truy cập theo khoá, quy mô lớn, cần độ trễ thấp (giỏ hàng, phiên đăng nhập, bảng xếp hạng). Không hợp với JOIN hay truy vấn tuỳ ý phức tạp — khi đó chọn RDS.',
        count: { app: 8 },
        loop: { every: 1.2, run: [pk('app', 'ddb', { color: DB, size: 0.7, back: { color: OK } })] },
      },
    ],
  },

  // ── Lambda ─────────────────────────────────────────────────────────────────
  lambda: {
    stage: { w: 34, d: 19 },
    cam: { target: [0, 1, -2], dist: 20 },
    nodes: [
      { id: 'user', kind: 'user', pos: [-12, 0, 0], label: 'Người dùng' },
      { id: 'crowd', kind: 'users', pos: [-12, 0, 0], radius: 4, count: 0, label: 'Rất nhiều người dùng', hidden: true },
      { id: 'code', kind: 'token', shape: 'card', text: '{ }', color: '#1e293b', pos: [-4, 0, -5.5], size: 1.3, label: 'index.js', sub: 'hàm của bạn' },
      { id: 'gw', kind: 'apigw', pos: [-4, 0, 0], label: 'API Gateway', hidden: true },
      { id: 'fn', kind: 'lambda', pos: [4.5, 0, 0], label: 'Lambda function', sub: 'hello', count: 0 },
      { id: 'ddb', kind: 'dynamodb', pos: [13, 0, 0], label: 'DynamoDB', hidden: true },
    ],
    steps: [
      {
        title: 'Bạn chỉ viết code',
        text: 'Bạn tải lên một hàm (Node.js, Python, Java…) và chọn dung lượng bộ nhớ. Không có máy chủ nào để cài đặt hay vá lỗi.',
        run: [at(0.6, pk('code', 'fn', { shape: 'card', color: '#94a3b8', label: 'deploy', speed: 5, then: [co('fn', 'Sẵn sàng', 'good')] }))],
      },
      {
        title: 'Sự kiện gọi hàm',
        text: 'Một request HTTP tới API Gateway là sự kiện (trigger) gọi Lambda. Ngoài ra còn: file mới trên S3, tin nhắn SQS, lịch hẹn giờ…',
        cam: { target: [-3, 1, 0], dist: 24 },
        show: ['gw'],
        run: [at(0.6, pk('user', 'gw', { label: 'GET /hello' }))],
      },
      {
        title: 'Cold start',
        text: 'Lần đầu được gọi, AWS phải tạo môi trường chạy (tải code, khởi động runtime) — gọi là cold start, chậm thêm khoảng vài trăm mili-giây.',
        dur: 7,
        run: [at(0.4, pk('user', 'fn', { via: ['gw'], label: 'GET /hello', then: [count('fn', 1), co('fn', 'Cold start ~300 ms', 'warn')], back: { label: 'Hello!', color: OK } }))],
      },
      {
        title: 'Warm start',
        text: 'Môi trường được giữ "ấm" một lúc, các request tiếp theo chạy ngay, chỉ vài chục mili-giây.',
        loop: { every: 1.4, run: [pk('user', 'fn', { via: ['gw'], label: 'GET /hello', back: { label: 'Hello! · 20 ms', color: OK } })] },
      },
      {
        title: 'Hàng nghìn request song song',
        text: 'Nhiều request cùng lúc? Lambda tự tạo thêm môi trường chạy song song trong vài giây (mặc định tới 1.000 bản mỗi Region, có thể xin nâng).',
        cam: { target: [-2, 1, 0], dist: 28 },
        hide: ['user'],
        show: ['crowd'],
        count: { crowd: 220, fn: 600 },
        loop: { every: 0.16, run: [pk('crowd', 'fn', { via: ['gw'], size: 0.6, speed: 11 })] },
      },
      {
        title: 'Dữ liệu lưu ở nơi khác',
        text: 'Lambda không nhớ gì giữa các lần chạy (stateless). Dữ liệu cần giữ lâu dài phải ghi vào DynamoDB, S3, RDS…',
        cam: { target: [1, 1, 0], dist: 30 },
        show: ['ddb'],
        count: { crowd: 40, fn: 30 },
        loop: { every: 0.6, run: [pk('crowd', 'ddb', { via: ['gw', 'fn'], color: DB, size: 0.7, speed: 10 })] },
      },
      {
        title: 'Hết việc → về 0',
        text: 'Không còn request, các môi trường dần bị thu hồi. Không chạy thì không tốn tiền — rất hợp với traffic thất thường.',
        count: { crowd: 0, fn: 0 },
        run: [at(2, co('fn', '$0 khi không có request', 'good', { dur: 3 }))],
      },
    ],
  },

  // ── API Gateway ────────────────────────────────────────────────────────────
  apigw: {
    stage: { w: 32, d: 19 },
    cam: { target: [-2, 1, 0], dist: 24 },
    nodes: [
      { id: 'app', kind: 'user', pos: [-11, 0, -3], label: 'Ứng dụng di động' },
      { id: 'bad', kind: 'user', shirt: '#ef4444', pos: [-11, 0, 4], label: 'Client lạ', sub: 'không có token', hidden: true },
      { id: 'crowd', kind: 'users', pos: [-11.5, 0, 0], radius: 4, count: 0, label: 'Rất nhiều client', hidden: true },
      { id: 'gw', kind: 'apigw', pos: [-3, 0, 0], label: 'API Gateway', sub: 'api.shop.vn' },
      { id: 'fn', kind: 'lambda', pos: [6, 0, -4], label: 'Lambda', sub: 'GET /products', count: 4, hidden: true },
      { id: 'legacy', kind: 'ec2', pos: [6, 0, 4.5], label: 'Dịch vụ trên EC2', sub: 'POST /orders', hidden: true },
    ],
    steps: [
      {
        title: 'Cửa trước của API',
        text: 'Client gọi một địa chỉ API duy nhất. API Gateway nhận request và chuyển tới backend phù hợp, rồi trả kết quả về.',
        show: ['fn'],
        loop: { every: 1.8, run: [pk('app', 'fn', { via: ['gw'], label: 'GET /products', back: { label: 'JSON 200', color: OK } })] },
      },
      {
        title: 'Định tuyến theo đường dẫn',
        text: 'Mỗi resource + method trỏ tới một integration: /products → Lambda, /orders → dịch vụ chạy trên EC2.',
        show: ['legacy'],
        load: { legacy: 0.3 },
        loop: { every: 2, run: [pk('app', 'fn', { via: ['gw'], label: 'GET /products', back: { label: '200', color: OK } }), at(0.9, pk('app', 'legacy', { via: ['gw'], label: 'POST /orders', back: { label: '201', color: OK } }))] },
      },
      {
        title: 'Xác thực',
        text: 'API Gateway kiểm tra token (Cognito/JWT, API key, IAM…) trước khi chuyển tiếp. Request không hợp lệ bị chặn ngay tại cửa.',
        show: ['bad'],
        loop: {
          every: 2.2,
          run: [pk('bad', 'gw', { label: 'không có token', color: BAD, fail: 'bounce', then: [co('gw', '401 Unauthorized', 'bad')] }), at(0.9, pk('app', 'fn', { via: ['gw'], label: 'Bearer eyJ…', back: { label: '200', color: OK } }))],
        },
      },
      {
        title: 'Giới hạn tốc độ (throttling)',
        text: 'Khi request vượt giới hạn (mặc định khoảng 10.000/giây mỗi Region, có thể đặt riêng cho từng API hay khách hàng), phần vượt bị trả lỗi 429 để bảo vệ backend.',
        hide: ['bad', 'app'],
        show: ['crowd'],
        count: { crowd: 220, fn: 40 },
        run: [at(1.5, co('gw', '429 Too Many Requests', 'bad', { dur: 2.5 })), at(4.5, co('gw', '429 Too Many Requests', 'bad', { dur: 2.5 }))],
        loop: { every: 0.24, run: [pk('crowd', 'fn', { via: ['gw'], size: 0.6, speed: 10 }), at(0.12, pk('crowd', 'gw', { size: 0.6, speed: 10, fail: 'bounce' }))] },
      },
      {
        title: 'Stage: dev và prod',
        text: 'Một API có nhiều stage (dev, test, prod) để thử phiên bản mới mà không ảnh hưởng người dùng thật.',
        hide: ['crowd'],
        show: ['app'],
        count: { fn: 4 },
        run: [at(0.4, co('gw', 'stage: dev', 'info', { dur: 2.5 })), at(1.6, co('gw', 'stage: prod', 'good', { dur: 2.5 }))],
        loop: { every: 1.8, run: [pk('app', 'fn', { via: ['gw'], label: 'GET /products', back: { label: '200', color: OK } })] },
      },
    ],
  },

  // ── CloudFront ─────────────────────────────────────────────────────────────
  cloudfront: {
    stage: { w: 36, d: 19 },
    cam: { target: [0, 1, 0], dist: 35 },
    nodes: [
      { id: 'u1', kind: 'user', pos: [-14, 0, -4], label: 'Người dùng ở Hà Nội' },
      { id: 'u2', kind: 'user', shirt: '#f472b6', pos: [-14, 0, 4], label: 'Người dùng ở TP.HCM', hidden: true },
      { id: 'edge', kind: 'edge', pos: [-5, 0, 0], label: 'Edge location', sub: 'gần người dùng' },
      { id: 'cached', kind: 'token', text: 'logo', color: '#7c3aed', pos: [-5, 0, 2.9], size: 0.8, hidden: true },
      { id: 'origin', kind: 's3', pos: [14, 0, 0], label: 'Origin: S3', sub: 'Region us-east-1 (rất xa)' },
    ],
    steps: [
      {
        title: 'Lần đầu: cache MISS',
        text: 'Người đầu tiên xin logo.png. Edge chưa có bản sao (MISS) nên phải đi tận origin ở xa để lấy — mất nhiều thời gian.',
        dur: 9,
        run: [
          at(0.4, pk('u1', 'edge', {
            label: 'GET logo.png',
            then: [
              co('edge', 'MISS', 'bad'),
              at(0.4, pk('edge', 'origin', { label: 'lấy từ origin', color: PURPLE, speed: 6, back: { label: 'logo.png', color: OK, shape: 'cube' }, backThen: [show('cached'), pk('edge', 'u1', { shape: 'cube', color: OK, label: 'logo.png · ~250 ms' })] })),
            ],
          })),
        ],
      },
      {
        title: 'Edge giữ bản sao',
        text: 'Edge lưu file vào cache trong một khoảng thời gian (TTL, ví dụ 24 giờ).',
        show: ['cached'],
        cam: { target: [-5, 1, 1], dist: 13 },
        run: [at(0.4, co('cached', 'cache · TTL 24h', 'good', { dy: 1.2 })), at(0.2, { do: 'pulse', node: 'edge' })],
      },
      {
        title: 'Người sau: cache HIT',
        text: 'Người dùng khác ở gần nhận file ngay từ edge (HIT) — nhanh hơn nhiều, và origin không phải làm gì.',
        cam: { target: [-6, 1, 0], dist: 22 },
        show: ['u2'],
        loop: { every: 1.6, run: [pk('u2', 'edge', { label: 'GET logo.png', back: { label: 'HIT · 20 ms', color: OK, shape: 'cube' } }), at(0.8, pk('u1', 'edge', { label: 'GET logo.png', back: { label: 'HIT', color: OK, shape: 'cube' } }))] },
      },
      {
        title: 'Đỡ tải cho origin',
        text: 'Phần lớn request được trả ngay ở biên; origin chỉ nhận vài request khi cache hết hạn. Nhờ vậy website chịu được lượng truy cập rất lớn.',
        cam: { target: [0, 1, 0], dist: 35 },
        run: [at(1.6, co('origin', 'Nhàn rỗi 😌', 'good', { dur: 3 }))],
        loop: { every: 0.3, run: [pk('u1', 'edge', { size: 0.6, color: OK }), at(0.15, pk('u2', 'edge', { size: 0.6, color: OK }))] },
      },
      {
        title: 'Cập nhật file: Invalidation',
        text: 'Khi thay logo mới, bạn tạo invalidation để xoá bản cache cũ. Request kế tiếp sẽ MISS và lấy bản mới từ origin.',
        dur: 9,
        run: [
          at(0.3, co('edge', 'Invalidate /logo.png', 'warn')),
          hide('cached', 0.8),
          at(1.8, pk('u2', 'edge', {
            label: 'GET logo.png',
            then: [co('edge', 'MISS', 'bad'), at(0.4, pk('edge', 'origin', { color: PURPLE, speed: 6, back: { label: 'logo v2', color: OK, shape: 'cube' }, backThen: [show('cached'), pk('edge', 'u2', { shape: 'cube', color: OK, label: 'logo v2' })] }))],
          })),
        ],
      },
    ],
  },

  // ── Route 53 ───────────────────────────────────────────────────────────────
  route53: {
    stage: { w: 32, d: 19 },
    cam: { target: [-3, 1, -1], dist: 24 },
    nodes: [
      { id: 'user', kind: 'user', pos: [-11, 0, 0], label: 'Người dùng', sub: 'gõ shop.example.com' },
      { id: 'dns', kind: 'route53', pos: [-3.5, 0, -5], label: 'Route 53', sub: 'hosted zone example.com' },
      { id: 'main', kind: 'elb', pos: [6, 0, -2.5], label: 'Website chính', sub: 'ALB · Singapore' },
      { id: 'backup', kind: 's3', pos: [6, 0, 5], label: 'Trang dự phòng', sub: 'S3 static website', hidden: true },
    ],
    steps: [
      {
        title: 'Gõ tên miền',
        text: 'Trình duyệt hỏi DNS: "shop.example.com ở đâu?". Route 53 trả lời theo bản ghi đã cấu hình — ở đây là bản ghi Alias trỏ tới Load Balancer.',
        run: [at(0.5, pk('user', 'dns', { label: 'shop.example.com ?', color: DNS, back: { label: '→ địa chỉ ALB', color: DNS } }))],
      },
      {
        title: 'Kết nối tới đúng địa chỉ',
        text: 'Có địa chỉ rồi, trình duyệt kết nối thẳng tới website. Kết quả DNS được nhớ (cache) theo TTL nên không phải hỏi lại mỗi lần.',
        loop: { every: 1.6, run: [pk('user', 'main', { label: 'GET /', back: { label: '200 OK', color: OK } })] },
      },
      {
        title: 'Health check',
        text: 'Route 53 có thể định kỳ kiểm tra website chính từ nhiều địa điểm trên thế giới.',
        loop: { every: 1.6, run: [pk('dns', 'main', { label: 'ping', color: PURPLE, size: 0.6, back: { label: 'OK', color: OK } })] },
      },
      {
        title: 'Website chính sập',
        text: 'Hệ thống chính gặp sự cố. Health check thất bại liên tiếp → Route 53 đánh dấu bản chính là Unhealthy.',
        dur: 7,
        run: [at(0.4, { do: 'break', node: 'main' }), at(1, pk('dns', 'main', { label: 'ping', color: PURPLE, size: 0.6, fail: 'bounce' })), at(2.2, pk('dns', 'main', { label: 'ping', color: PURPLE, size: 0.6, fail: 'bounce' })), at(3, co('main', 'Unhealthy', 'bad'))],
      },
      {
        title: 'Failover sang bản dự phòng',
        text: 'Với chính sách Failover, Route 53 trả về địa chỉ bản dự phòng — ví dụ trang "đang bảo trì" trên S3. Người dùng thấy thông báo lịch sự thay vì lỗi.',
        cam: { target: [-2, 1, 0], dist: 26 },
        show: ['backup'],
        dur: 9,
        run: [at(0.5, pk('user', 'dns', { label: 'shop.example.com ?', color: DNS, back: { label: '→ S3 dự phòng', color: DNS } }))],
        loop: { start: 3, every: 1.8, run: [pk('user', 'backup', { label: 'GET /', back: { label: 'Trang bảo trì', color: OK } })] },
      },
      {
        title: 'Các kiểu định tuyến',
        text: 'Simple (một đích), Weighted (chia % để thử phiên bản mới), Latency (chọn Region nhanh nhất), Geolocation (theo quốc gia), Failover (dự phòng)…',
        run: [{ do: 'fix', node: 'main' }, at(0.4, co('dns', 'Weighted 90/10', 'info', { dy: 2 })), at(1.4, co('dns', 'Latency', 'info', { dy: 2 })), at(2.4, co('dns', 'Geolocation', 'info', { dy: 2 })), at(3.4, co('dns', 'Failover', 'info', { dy: 2 }))],
        loop: { start: 0.5, every: 1.6, run: [pk('user', 'main', { label: 'GET /', back: { label: '200 OK', color: OK } })] },
      },
    ],
  },

  // ── VPC ────────────────────────────────────────────────────────────────────
  vpc: {
    stage: { w: 36, d: 21 },
    cam: { target: [2, 1, 0], dist: 32 },
    nodes: [
      { id: 'user', kind: 'user', pos: [-14, 0, -2], label: 'Người dùng Internet' },
      { id: 'hacker', kind: 'user', shirt: '#ef4444', pos: [-14, 0, 5], label: 'Kẻ tấn công', hidden: true },
      { id: 'vpcLine', kind: 'outline', pos: [5.5, 0.06, 0], w: 18.6, d: 16, r: 1.2, color: '#8C4FFF', label: 'VPC', sub: '10.0.0.0/16', labelPos: [-8.2, 0.4, 8.2], hidden: true },
      { id: 'azA', kind: 'az', pos: [5.5, 0.25, -3.6], w: 17, d: 6.4, label: 'AZ A', labelPos: [-7.8, 0.5, 2.6], hidden: true, seed: 3 },
      { id: 'azB', kind: 'az', pos: [5.5, 0.25, 3.6], w: 17, d: 6.4, label: 'AZ B', labelPos: [-7.8, 0.5, 2.6], hidden: true, seed: 7 },
      { id: 'pubA', kind: 'subnet', pos: [1.8, 0.25, -3.6], w: 7.4, d: 5.2, color: '#bbf7d0', border: '#16a34a', label: 'Public subnet', sub: '10.0.1.0/24', small: true, labelPos: [-2.4, 0.3, -1.9], hidden: true },
      { id: 'privA', kind: 'subnet', pos: [9.7, 0.25, -3.6], w: 6.8, d: 5.2, color: '#bfdbfe', border: '#2563eb', label: 'Private subnet', sub: '10.0.2.0/24', small: true, labelPos: [-2.1, 0.3, -1.9], hidden: true },
      { id: 'pubB', kind: 'subnet', pos: [1.8, 0.25, 3.6], w: 7.4, d: 5.2, color: '#bbf7d0', border: '#16a34a', label: 'Public subnet', sub: '10.0.3.0/24', small: true, labelPos: [-2.4, 0.3, -1.9], hidden: true },
      { id: 'privB', kind: 'subnet', pos: [9.7, 0.25, 3.6], w: 6.8, d: 5.2, color: '#bfdbfe', border: '#2563eb', label: 'Private subnet', sub: '10.0.4.0/24', small: true, labelPos: [-2.1, 0.3, -1.9], hidden: true },
      { id: 'igw', kind: 'igw', pos: [-5.6, 0, -2], label: 'Internet Gateway', hidden: true },
      { id: 'webA', kind: 'ec2', pos: [2.4, 0.25, -3.2], label: 'Web', small: true, hidden: true },
      { id: 'webB', kind: 'ec2', pos: [2.4, 0.25, 4.0], label: 'Web', small: true, hidden: true },
      { id: 'db', kind: 'rds', pos: [10, 0.25, -3.2], label: 'Database', sub: 'RDS', hidden: true },
    ],
    steps: [
      {
        title: 'VPC: mạng riêng của bạn',
        text: 'Khi tạo VPC, bạn chọn một dải IP riêng (CIDR), ví dụ 10.0.0.0/16 ≈ 65.000 địa chỉ. Tài nguyên trong VPC của bạn tách biệt với khách hàng khác của AWS.',
        show: ['vpcLine'],
        dur: 5,
      },
      {
        title: 'Chia subnet theo AZ',
        text: 'Mỗi subnet nằm gọn trong một AZ. Thường mỗi AZ có một subnet public (cho web) và một subnet private (cho database).',
        run: [show('azA', 0.2), show('azB', 0.4), show('pubA', 0.9), show('privA', 1.2), show('pubB', 1.5), show('privB', 1.8)],
      },
      {
        title: 'Internet Gateway',
        text: 'Gắn Internet Gateway vào VPC và thêm route 0.0.0.0/0 → IGW cho subnet public. Máy trong subnet public (có IP public) mới nói chuyện được với Internet.',
        cam: { target: [-2, 1, 0], dist: 28 },
        show: ['igw', 'webA', 'webB'],
        loop: { start: 1, every: 1.6, run: [pk('user', 'webA', { via: ['igw'], label: 'HTTPS', back: { label: '200', color: OK } })] },
      },
      {
        title: 'Database ở subnet private',
        text: 'Subnet private không có route ra Internet Gateway: database chỉ nhận kết nối từ bên trong VPC (ví dụ từ web server), không ai ở Internet chạm tới được.',
        show: ['db', 'hacker'],
        dur: 8,
        loop: {
          every: 2,
          run: [pk('webA', 'db', { label: 'SQL', color: DB, back: { label: 'rows', color: OK } }), at(0.9, pk('hacker', 'igw', { label: '→ database?', color: BAD, fail: 'bounce', then: [co('igw', 'Không có đường vào', 'bad')] }))],
        },
      },
      {
        title: 'Security Group: lớp bảo vệ thứ hai',
        text: 'SG-web cho phép cổng 443 từ Internet; SG-db chỉ cho phép cổng 3306 từ SG-web. Gói tin không được phép vẫn bị chặn dù có đường đi.',
        hide: ['hacker'],
        run: [at(0.3, co('webA', 'SG-web: 443 ← Internet', 'info', { dur: 3.5 })), at(1.6, co('db', 'SG-db: 3306 ← SG-web', 'info', { dur: 3.5 }))],
        loop: { every: 1.8, run: [pk('user', 'webA', { via: ['igw'], size: 0.8 }), at(0.6, pk('webA', 'db', { color: DB, size: 0.8 }))] },
      },
      {
        title: 'Máy private muốn ra Internet?',
        text: 'Muốn máy ở subnet private tải bản cập nhật hay gọi API bên ngoài mà không bị truy cập ngược vào? Dùng NAT Gateway đặt ở subnet public — xem bài NAT Gateway.',
        loop: { every: 1.8, run: [pk('user', 'webB', { via: ['igw'], size: 0.8 }), at(0.6, pk('webB', 'db', { color: DB, size: 0.8 }))] },
      },
    ],
  },

  // ── NAT Gateway ────────────────────────────────────────────────────────────
  nat: {
    stage: { w: 40, d: 21 },
    cam: { target: [0, 1, -2], dist: 28 },
    nodes: [
      { id: 'net', kind: 'external', pos: [-14.5, 0, -2.5], label: 'Internet', sub: 'ubuntu.com · API thanh toán' },
      { id: 'hacker', kind: 'user', shirt: '#ef4444', pos: [-14.5, 0, 6], label: 'Kẻ lạ trên Internet', hidden: true },
      { id: 'vpcLine', kind: 'outline', pos: [5, 0.06, 0.2], w: 22.2, d: 17.6, r: 1.2, color: '#8C4FFF', label: 'VPC', sub: '10.0.0.0/16', labelPos: [-10.1, 0.4, 8.8] },
      { id: 'azA', kind: 'az', pos: [5, 0.25, -3.9], w: 20.6, d: 7.2, label: 'AZ A', labelPos: [-9.3, 0.5, 3.1], seed: 3 },
      { id: 'azB', kind: 'az', pos: [5, 0.25, 4.3], w: 20.6, d: 7.2, label: 'AZ B', labelPos: [-9.3, 0.5, 3.1], seed: 7, hidden: true },
      { id: 'pubA', kind: 'subnet', pos: [-1.5, 0.25, -3.9], w: 6.2, d: 6, color: '#bbf7d0', border: '#16a34a', text: 'PUBLIC SUBNET', textAt: [0, 0, -2.5], textSize: 0.42 },
      { id: 'privA', kind: 'subnet', pos: [8.6, 0.25, -3.9], w: 12.6, d: 6, color: '#bfdbfe', border: '#2563eb', text: 'PRIVATE SUBNET · 10.0.2.0/24', textAt: [0, 0, -2.5], textSize: 0.42 },
      { id: 'pubB', kind: 'subnet', pos: [-1.5, 0.25, 4.3], w: 6.2, d: 6, color: '#bbf7d0', border: '#16a34a', text: 'PUBLIC SUBNET', textAt: [0, 0, 2.5], textSize: 0.42, hidden: true },
      { id: 'privB', kind: 'subnet', pos: [8.6, 0.25, 4.3], w: 12.6, d: 6, color: '#bfdbfe', border: '#2563eb', text: 'PRIVATE SUBNET · 10.0.4.0/24', textAt: [0, 0, 2.5], textSize: 0.42, hidden: true },
      { id: 'igw', kind: 'igw', pos: [-6.2, 0, -2.5], label: 'Internet Gateway' },
      { id: 'appA', kind: 'ec2', pos: [7, 0.25, -3.9], label: 'App server', sub: '10.0.2.15 · không có IP public' },
      { id: 'appB', kind: 'ec2', pos: [7, 0.25, 4.3], label: 'App server', sub: '10.0.4.20', hidden: true },
      { id: 'natA', kind: 'nat', pos: [-1.5, 0.25, -3.9], label: 'NAT Gateway', sub: 'Elastic IP 52.74.10.8', hidden: true },
      { id: 'natB', kind: 'nat', pos: [-1.5, 0.25, 4.3], label: 'NAT Gateway', sub: 'Elastic IP 13.212.5.9', hidden: true },
      { id: 'rtPriv', kind: 'token', shape: 'card', text: 'RT', color: '#1e3a8a', pos: [12.8, 0.25, -5.6], size: 1.0, label: 'Route table · private', sub: '0.0.0.0/0 → NAT Gateway', hidden: true },
      { id: 'rtPub', kind: 'token', shape: 'card', text: 'RT', color: '#14532d', pos: [-3.7, 0.25, -6.1], size: 1.0, label: 'Route table · public', sub: '0.0.0.0/0 → Internet Gateway', hidden: true },
      { id: 'vpce', kind: 'igw', pos: [16.2, 0, 4.3], scale: 0.6, label: 'Gateway Endpoint', sub: 'tới S3', hidden: true },
      { id: 's3', kind: 's3', pos: [18.4, 0, 4.3], label: 'S3', hidden: true },
    ],
    steps: [
      {
        title: 'Máy trong private subnet cần ra Internet',
        text: 'App server nằm trong private subnet: không có IP public nên không ai từ Internet gọi thẳng vào được — an toàn. Nhưng chính nó vẫn cần gọi ra ngoài: tải bản vá, cài thư viện, gọi API thanh toán, gửi email…',
        loop: { every: 2.8, run: [pk('appA', null, { toPos: [2.6, 1.3, -3.9], label: 'apt update', color: CYAN, fail: 'bounce', then: [co('appA', 'Không có đường ra Internet ✗', 'bad')] })] },
      },
      {
        title: 'Đặt NAT Gateway ở public subnet',
        text: 'NAT Gateway là dịch vụ được AWS quản lý, đặt trong một public subnet và gắn một Elastic IP — địa chỉ public cố định. Public subnet có đường ra Internet qua Internet Gateway.',
        cam: { target: [-3, 1, -3], dist: 17 },
        show: ['natA'],
        run: [at(1.2, co('natA', 'Elastic IP: 52.74.10.8', 'info', { dur: 3 }))],
      },
      {
        title: 'Sửa route table',
        text: 'Route table của private subnet thêm dòng 0.0.0.0/0 → NAT Gateway: mọi traffic đi ra ngoài VPC sẽ qua NAT. Route table của public subnet trỏ 0.0.0.0/0 → Internet Gateway.',
        cam: { target: [3, 1, -3], dist: 25 },
        show: ['rtPriv', 'rtPub'],
        run: [at(0.5, pk('rtPriv', 'natA', { shape: 'card', label: '0.0.0.0/0 → NAT', color: '#93c5fd', speed: 5 })), at(2, pk('rtPub', 'igw', { shape: 'card', label: '0.0.0.0/0 → IGW', color: '#86efac', speed: 5 }))],
      },
      {
        title: 'Đi ra: NAT "đổi địa chỉ"',
        text: 'App gửi request từ IP riêng 10.0.2.15. NAT Gateway thay địa chỉ nguồn bằng Elastic IP của nó rồi gửi ra Internet qua Internet Gateway. Kết quả trả về đi ngược lại đúng đường đó tới app.',
        cam: { target: [-2, 1, -2], dist: 28 },
        dur: 9,
        loop: {
          every: 4.2,
          run: [
            pk('appA', 'natA', {
              label: 'từ 10.0.2.15',
              color: CYAN,
              then: [pk('natA', 'net', { via: ['igw'], label: 'từ 52.74.10.8', color: CYAN, back: { label: 'bản vá', color: OK, shape: 'cube' }, backThen: [pk('natA', 'appA', { label: 'bản vá → 10.0.2.15', color: OK, shape: 'cube' })] })],
            }),
          ],
        },
      },
      {
        title: 'Chỉ cho đi ra, không cho vào',
        text: 'NAT Gateway chỉ cho qua kết nối do máy bên trong khởi tạo (và phần trả lời của nó). Kẻ lạ trên Internet không thể dùng NAT để mở kết nối vào app server.',
        show: ['hacker'],
        loop: {
          every: 3,
          run: [
            pk('hacker', 'natA', { via: ['igw'], label: '→ 10.0.2.15 ?', color: BAD, fail: 'bounce', then: [co('natA', 'Chặn kết nối từ ngoài vào', 'bad')] }),
            at(1.4, pk('appA', 'natA', { color: CYAN, size: 0.7, then: [pk('natA', 'net', { via: ['igw'], color: CYAN, size: 0.7, back: { color: OK } })] })),
          ],
        },
      },
      {
        title: 'NAT Gateway nằm trong một AZ',
        text: 'NAT Gateway là tài nguyên theo AZ. Nếu app ở AZ B cũng đi nhờ NAT của AZ A, một sự cố ở AZ A sẽ cắt luôn đường ra Internet của AZ B.',
        cam: { target: [2, 1, 0.5], dist: 33 },
        hide: ['hacker'],
        show: ['azB', 'pubB', 'privB', 'appB'],
        dur: 10,
        run: [
          at(0.8, pk('appB', 'natA', { label: 'đi nhờ NAT ở AZ A', color: CYAN, then: [pk('natA', 'net', { via: ['igw'], color: CYAN })] })),
          at(3.4, { do: 'quake', node: 'azA', breaks: ['natA', 'appA'] }),
          at(5.4, pk('appB', 'natA', { label: 'apt update', color: CYAN, fail: 'drop', then: [co('appB', 'Mất đường ra Internet ✗', 'bad')] })),
          at(7.6, pk('appB', 'natA', { label: 'API thanh toán', color: CYAN, fail: 'drop' })),
        ],
      },
      {
        title: 'Mỗi AZ một NAT Gateway',
        text: 'Cách làm khuyên dùng: mỗi AZ có NAT Gateway riêng, private subnet của AZ nào trỏ vào NAT của AZ đó. AZ A sập thì app ở AZ B vẫn ra Internet qua NAT của chính nó.',
        show: ['natB'],
        run: [at(0.9, co('natB', 'NAT riêng của AZ B ✓', 'good', { dur: 3 }))],
        loop: { start: 1.4, every: 3.2, run: [pk('appB', 'natB', { label: 'từ 10.0.4.20', color: CYAN, then: [pk('natB', 'net', { via: ['igw'], label: 'từ 13.212.5.9', color: CYAN, back: { label: 'OK', color: OK } })] })] },
      },
      {
        title: 'Chi phí và VPC Endpoint',
        text: 'NAT Gateway tính tiền theo giờ (kể cả khi không dùng) và theo từng GB dữ liệu đi qua. Truy cập S3, DynamoDB từ private subnet thì dùng Gateway VPC Endpoint: miễn phí và không cần đi qua NAT.',
        cam: { target: [8, 1, 2], dist: 27 },
        show: ['vpce', 's3'],
        run: [at(0.8, co('natB', 'Phí: theo giờ + theo GB', 'warn', { dur: 3 })), at(2.6, co('vpce', 'Gateway Endpoint: miễn phí', 'good', { dur: 3 }))],
        loop: { start: 1.2, every: 2.4, run: [pk('appB', 's3', { via: ['vpce'], label: 'GetObject', color: OK, back: { label: 'ảnh.jpg', color: OK, shape: 'cube' } })] },
      },
    ],
  },

  // ── IAM ────────────────────────────────────────────────────────────────────
  iam: {
    stage: { w: 32, d: 19 },
    cam: { target: [-3, 1, 0], dist: 27 },
    nodes: [
      { id: 'dev', kind: 'user', pos: [-11, 0, -4], label: 'Lan', sub: 'Developer' },
      { id: 'intern', kind: 'user', shirt: '#facc15', pos: [-11, 0, 4], label: 'Minh', sub: 'Thực tập sinh', hidden: true },
      { id: 'iam', kind: 'iam', pos: [-2, 0, 0], label: 'IAM', sub: 'kiểm tra quyền' },
      { id: 'policy', kind: 'token', shape: 'card', text: '{ }', color: '#7f1d1d', pos: [-2, 0, -6], size: 1.3, label: 'Policy (JSON)', sub: 'Allow s3:GetObject', hidden: true },
      { id: 'bucket', kind: 's3', pos: [8, 0, -3.5], label: 'S3', sub: 'bucket hoá đơn' },
      { id: 'app', kind: 'ec2', pos: [8, 0, 4.5], label: 'EC2', sub: 'ứng dụng', hidden: true },
      { id: 'role', kind: 'token', shape: 'card', text: 'Role', fontSize: 80, color: '#991b1b', pos: [3, 0, 7.2], size: 1.2, label: 'IAM Role', sub: 'S3ReadOnly', hidden: true },
    ],
    steps: [
      {
        title: 'Mọi request đều qua IAM',
        text: 'Mỗi lời gọi API tới AWS đều được IAM kiểm tra: ai đang gọi, muốn làm gì, trên tài nguyên nào.',
        loop: { every: 2.4, run: [pk('dev', 'iam', { label: 'GetObject hoadon.pdf', then: [{ do: 'flash', node: 'iam', kind: 'allow' }, pk('iam', 'bucket', { color: OK, label: 'được phép ✓' })] })] },
      },
      {
        title: 'Quyền nằm trong policy',
        text: 'Policy là tài liệu JSON gồm Effect (Allow/Deny), Action (ví dụ s3:GetObject) và Resource (bucket nào). Policy được gắn vào user, group hoặc role.',
        show: ['policy'],
        run: [at(0.5, pk('policy', 'iam', { shape: 'card', label: 'Allow s3:GetObject', color: '#fca5a5', speed: 4 }))],
      },
      {
        title: 'Mặc định là từ chối',
        text: 'Minh chưa được cấp quyền xoá. Hành động nào không được Allow rõ ràng đều bị từ chối (implicit deny).',
        show: ['intern'],
        loop: { every: 2.4, run: [pk('intern', 'iam', { label: 'DeleteObject', color: '#facc15', fail: 'bounce', then: [{ do: 'flash', node: 'iam', kind: 'deny' }, co('iam', 'AccessDenied', 'bad')] })] },
      },
      {
        title: 'Role cho ứng dụng',
        text: 'Ứng dụng trên EC2 nhận quyền qua IAM Role: AWS cấp khoá tạm thời và tự xoay vòng. Không bao giờ ghi cứng access key trong code.',
        cam: { target: [1, 1, 1], dist: 27 },
        show: ['app', 'role'],
        run: [at(0.5, pk('role', 'app', { shape: 'card', label: 'khoá tạm thời', color: '#fca5a5', speed: 4 }))],
        loop: { start: 2, every: 2.4, run: [pk('app', 'iam', { label: 'GetObject (role)', then: [{ do: 'flash', node: 'iam', kind: 'allow' }, pk('iam', 'bucket', { color: OK })] })] },
      },
      {
        title: 'Nguyên tắc vàng',
        text: 'Bật MFA cho tài khoản root rồi cất đi. Mỗi người một danh tính riêng, gom quyền theo group, chỉ cấp quyền tối thiểu cần thiết.',
        loop: { every: 2.4, run: [pk('dev', 'iam', { label: 'GetObject', then: [{ do: 'flash', node: 'iam', kind: 'allow' }, pk('iam', 'bucket', { color: OK })] })] },
      },
    ],
  },

  // ── CloudWatch ─────────────────────────────────────────────────────────────
  cloudwatch: {
    stage: { w: 34, d: 19 },
    cam: { target: [-2, 1, 0], dist: 22 },
    nodes: [
      { id: 's1', kind: 'ec2', pos: [-8, 0, -3], label: 'EC2 #1', small: true },
      { id: 's2', kind: 'ec2', pos: [-8, 0, 3], label: 'EC2 #2', small: true },
      { id: 's3', kind: 'ec2', pos: [-4.5, 0, 0], label: 'EC2 #3', small: true, hidden: true },
      { id: 'cw', kind: 'cloudwatch', pos: [3, 0, 0], label: 'CloudWatch', sub: 'Dashboard' },
      { id: 'sns', kind: 'token', shape: 'card', text: 'SNS', color: '#be185d', pos: [10, 0, -4], size: 1.2, label: 'SNS', sub: 'gửi thông báo', hidden: true },
      { id: 'admin', kind: 'user', pos: [14, 0, 1], label: 'Quản trị viên', hidden: true },
    ],
    steps: [
      {
        title: 'Thu thập metric',
        text: 'Mỗi EC2 tự gửi số liệu như CPUUtilization, NetworkIn… về CloudWatch (mặc định 5 phút một lần, bật giám sát chi tiết thì 1 phút).',
        load: { s1: 0.3, s2: 0.3, cw: 0.3 },
        loop: { every: 1.3, run: [pk('s1', 'cw', { label: 'CPU 30%', color: DB, size: 0.6 }), at(0.65, pk('s2', 'cw', { label: 'CPU 28%', color: DB, size: 0.6 }))] },
      },
      {
        title: 'Dashboard và biểu đồ',
        text: 'Metric được vẽ thành biểu đồ theo thời gian. Bạn tự tạo dashboard gom các chỉ số quan trọng của hệ thống.',
        cam: { target: [3, 1.5, 0], dist: 11 },
        loop: { every: 1.3, run: [pk('s1', 'cw', { color: DB, size: 0.6 }), at(0.65, pk('s2', 'cw', { color: DB, size: 0.6 }))] },
      },
      {
        title: 'Vượt ngưỡng → ALARM',
        text: 'Alarm theo dõi điều kiện "CPU trung bình > 70% trong 2 chu kỳ". Tải tăng, alarm chuyển sang trạng thái ALARM.',
        cam: { target: [-2, 1, 0], dist: 22 },
        load: { s1: 0.9, s2: 0.9, cw: 0.85 },
        run: [at(2, co('cw', 'ALARM · CPU > 70%', 'bad', { dy: 1.6 }))],
        loop: { every: 0.9, run: [pk('s1', 'cw', { label: 'CPU 90%', color: DB, size: 0.6 }), at(0.45, pk('s2', 'cw', { label: 'CPU 91%', color: DB, size: 0.6 }))] },
      },
      {
        title: 'Hành động: gửi thông báo',
        text: 'Alarm gửi tin tới một SNS topic, SNS phát email/SMS tới người phụ trách.',
        cam: { target: [4, 1, 0], dist: 29 },
        show: ['sns', 'admin'],
        run: [at(0.6, pk('cw', 'sns', { label: 'ALARM', color: BAD, then: [pk('sns', 'admin', { shape: 'card', label: 'Email cảnh báo', color: '#fda4af' })] }))],
      },
      {
        title: 'Hành động: tự động scale',
        text: 'Alarm cũng có thể ra lệnh cho Auto Scaling thêm máy. Tải được chia lại, CPU giảm và alarm trở về OK.',
        cam: { target: [-2, 1, 0], dist: 24 },
        dur: 8,
        run: [at(0.4, pk('cw', 's3', { color: '#fb923c', label: 'Scale out' })), show('s3', 1.3), state('s3', 'pending', 1.3), state('s3', 'ok', 3.3), load('s1', 0.55, 3.4), load('s2', 0.55, 3.4), load('s3', 0.55, 3.4), load('cw', 0.5, 3.4), at(4.4, co('cw', 'OK ✓', 'good', { dy: 1.6 }))],
      },
      {
        title: 'Logs',
        text: 'Ứng dụng ghi log vào CloudWatch Logs để tìm lỗi, lọc theo từ khoá và tạo metric từ log (ví dụ đếm số lỗi 500).',
        loop: { every: 1.1, run: [pk('s1', 'cw', { label: 'GET /cart 200', color: '#94a3b8', size: 0.5 }), at(0.55, pk('s2', 'cw', { label: 'ERROR timeout', color: BAD, size: 0.5 }))] },
      },
    ],
  },

  // ── SQS ────────────────────────────────────────────────────────────────────
  sqs: {
    stage: { w: 36, d: 19 },
    cam: { target: [0, 1, 0], dist: 31 },
    nodes: [
      { id: 'crowd', kind: 'users', pos: [-14, 0, 0], radius: 3.6, count: 20, label: 'Người mua hàng' },
      { id: 'web', kind: 'ec2', pos: [-6.5, 0, 0], label: 'Web', sub: 'producer' },
      { id: 'q', kind: 'sqs', pos: [1.5, 0, 0], label: 'SQS queue', sub: 'orders', count: 0 },
      { id: 'w1', kind: 'ec2', pos: [10, 0, -3], label: 'Worker 1', small: true },
      { id: 'w2', kind: 'ec2', pos: [10, 0, 3], label: 'Worker 2', small: true },
      { id: 'w3', kind: 'ec2', pos: [13.5, 0, 0], label: 'Worker 3', small: true, hidden: true },
      { id: 'dlq', kind: 'token', text: 'DLQ', color: '#9f1239', pos: [1.5, 0, 6], size: 1.1, label: 'Dead-letter queue', hidden: true },
    ],
    steps: [
      {
        title: 'Gửi tin vào hàng đợi',
        text: 'Khi có đơn hàng, web không xử lý ngay mà gửi một tin nhắn vào SQS rồi báo người dùng "đã nhận đơn".',
        run: [at(0.4, pk('web', 'q', { shape: 'card', label: 'Đơn #1', color: '#fde68a', then: [count('q', 1)] }))],
      },
      {
        title: 'Worker lấy tin và xử lý',
        text: 'Các worker liên tục hỏi (poll) hàng đợi, lấy tin ra xử lý (trừ kho, gửi email…), xong thì xoá tin khỏi hàng đợi.',
        load: { w1: 0.4, w2: 0.4 },
        loop: {
          every: 1.8,
          run: [pk('web', 'q', { shape: 'card', color: '#fde68a', size: 0.8, then: [count('q', 2)] }), at(0.9, pk('q', 'w1', { shape: 'card', color: '#fde68a', label: 'Đơn', size: 0.8, then: [count('q', 1), co('w1', 'Xong ✓', 'good')] }))],
        },
      },
      {
        title: 'Đợt tăng đột biến',
        text: 'Khuyến mãi lớn, đơn đổ về dồn dập. Hàng đợi giữ hộ toàn bộ tin, worker cứ xử lý hết sức — không đơn nào bị mất.',
        count: { crowd: 180 },
        load: { w1: 0.95, w2: 0.95 },
        dur: 8,
        run: [count('q', 4, 1), count('q', 8, 2.5), count('q', 12, 4)],
        loop: { every: 0.3, run: [pk('crowd', 'q', { via: ['web'], size: 0.6, speed: 10, color: '#fde68a' }), at(0.15, pk('q', 'w1', { size: 0.6, color: '#fde68a' }))] },
      },
      {
        title: 'Thêm worker',
        text: 'Có thể tự động thêm worker theo độ dài hàng đợi (metric ApproximateNumberOfMessages). Hàng đợi vơi dần.',
        cam: { target: [3, 1, 0], dist: 30 },
        dur: 8,
        run: [show('w3', 0.3), state('w3', 'pending', 0.3), state('w3', 'ok', 2.2), load('w3', 0.7, 2.2), count('q', 9, 2.5), count('q', 5, 4), count('q', 2, 5.5)],
        loop: { every: 0.5, run: [pk('q', 'w1', { size: 0.7, color: '#fde68a' }), at(0.17, pk('q', 'w2', { size: 0.7, color: '#fde68a' })), at(0.34, pk('q', 'w3', { size: 0.7, color: '#fde68a' }))] },
      },
      {
        title: 'Worker lỗi giữa chừng',
        text: 'Worker 1 hỏng khi đang xử lý. Tin chưa bị xoá nên sau visibility timeout nó hiện lại trong hàng đợi để worker khác làm tiếp.',
        count: { crowd: 20 },
        load: { w2: 0.4, w3: 0.4 },
        dur: 8,
        run: [
          at(0.3, pk('q', 'w1', { shape: 'card', label: 'Đơn #77', color: '#fde68a', then: [{ do: 'break', node: 'w1' }] })),
          at(2.6, pk('w1', 'q', { shape: 'card', label: 'Đơn #77', color: '#fde68a', then: [co('q', 'Hiện lại sau timeout', 'warn')] })),
          at(4.2, pk('q', 'w2', { shape: 'card', label: 'Đơn #77', color: '#fde68a', then: [co('w2', 'Xong ✓', 'good')] })),
        ],
      },
      {
        title: 'Dead-letter queue',
        text: 'Tin lỗi quá nhiều lần (ví dụ 5 lần) được chuyển sang dead-letter queue để kỹ sư kiểm tra, không làm tắc hàng đợi chính.',
        show: ['dlq'],
        cam: { target: [1.5, 1, 2.5], dist: 20 },
        run: [at(0.6, pk('q', 'dlq', { shape: 'card', label: 'tin lỗi 5 lần', color: '#fb7185', speed: 4 }))],
      },
    ],
  },
};
