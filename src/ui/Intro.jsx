// Welcome card: what the playground does and the two ways to start.
import { useState } from 'react';
import { useApp, useUi, writePref } from '../state/store.js';
import { Icon } from './icons.jsx';

export function Intro() {
  const { engine, ui } = useApp();
  const open = useUi((s) => s.intro);
  const [again, setAgain] = useState(false);
  if (!open) return null;

  const close = (mode) => {
    if (again) writePref('intro', false);
    ui.set({ intro: false });
    if (mode) engine.setMode(mode);
  };

  return (
    <div className="intro-wrap" role="dialog" aria-modal="true" aria-labelledby="intro-title">
      <div className="intro">
        <h1 id="intro-title">Học AWS bằng cách nhìn nó chạy</h1>
        <p className="lead">Mô phỏng 3D các dịch vụ AWS cơ bản dành cho người mới. Không cần tài khoản AWS, không tốn tiền.</p>
        <div className="intro-grid">
          <button className="intro-card" onClick={() => close('explore')}>
            <span className="intro-icon">
              <Icon name="book" size={26} />
            </span>
            <b>Học từng dịch vụ</b>
            <span>Xem luồng hoạt động của EC2, S3, Load Balancer, RDS, Lambda… qua từng bước có hoạt hình và giải thích.</span>
            <em>
              Bắt đầu học <Icon name="arrowRight" size={15} />
            </em>
          </button>
          <button className="intro-card" onClick={() => close('sandbox')}>
            <span className="intro-icon alt">
              <Icon name="flask" size={26} />
            </span>
            <b>Sandbox kiến trúc</b>
            <span>Tự chọn thành phần AWS, rồi thả động đất, làm hỏng server hay cho 1 triệu người truy cập để xem điều gì xảy ra.</span>
            <em>
              Vào Sandbox <Icon name="arrowRight" size={15} />
            </em>
          </button>
        </div>
        <ul className="intro-tips">
          <li>
            <Icon name="target" size={16} /> Kéo chuột để xoay, cuộn để phóng to, chuột phải để di chuyển camera.
          </li>
          <li>
            <Icon name="info" size={16} /> Bấm vào bất kỳ vật thể 3D nào để xem nó là gì.
          </li>
          <li>
            <Icon name="alert" size={16} /> Con số trong mô phỏng là minh hoạ, thời gian được nén cho dễ quan sát.
          </li>
        </ul>
        <footer>
          <label>
            <input type="checkbox" checked={again} onChange={(e) => setAgain(e.target.checked)} /> Không hiện lại lần sau
          </label>
          <button className="btn btn-ghost" onClick={() => close(null)}>
            Đóng
          </button>
        </footer>
        <p className="disclaimer">Dự án học tập độc lập, không liên kết hay được bảo trợ bởi Amazon Web Services.</p>
      </div>
    </div>
  );
}
