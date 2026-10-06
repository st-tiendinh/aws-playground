// Vietnamese number formatting for the HUD and cards.
const nf = new Intl.NumberFormat('vi-VN');

export function fmtUsers(n) {
  if (n >= 1e6) {
    const v = n / 1e6;
    return `${v >= 10 ? Math.round(v) : v.toFixed(1).replace('.0', '').replace('.', ',')} triệu`;
  }
  if (n >= 1e4) return `${nf.format(Math.round(n / 1000))} nghìn`;
  return nf.format(Math.round(n));
}

export const fmtInt = (n) => nf.format(Math.round(n));

export function fmtRps(n) {
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 1e4 ? 0 : 1).replace('.', ',')}k`;
  return n >= 10 ? String(Math.round(n)) : n.toFixed(1).replace('.', ',');
}

export function fmtPct(x) {
  const v = Math.max(0, Math.min(1, x)) * 100;
  if (v >= 99.95) return '100%';
  if (v >= 99) return v.toFixed(1).replace('.', ',') + '%';
  return Math.round(v) + '%';
}

export const fmtMs = (ms) => (ms == null ? '—' : ms >= 1000 ? (ms / 1000).toFixed(1).replace('.', ',') + ' s' : Math.round(ms) + ' ms');

export function fmtMoney(x) {
  if (x >= 100) return '$' + Math.round(x);
  if (x >= 1) return '$' + x.toFixed(2);
  return '$' + x.toFixed(3);
}

export const STATUS = {
  ok: { text: 'Hoạt động tốt', cls: 'ok' },
  slow: { text: 'Chậm', cls: 'slow' },
  degraded: { text: 'Gián đoạn', cls: 'degraded' },
  down: { text: 'SẬP', cls: 'down' },
};
