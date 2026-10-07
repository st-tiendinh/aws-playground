// Colours shared by the 3D scene and the UI. Service colours follow the AWS architecture
// icon categories (compute orange, storage green, database magenta, networking purple…),
// except management: AWS paints it the same pink as integration, blue keeps the two apart —
// and developer tools, teal here so they stand apart from both.
export const CAT_COLOR = {
  foundation: '#64748b',
  compute: '#ED7100',
  storage: '#7AA116',
  database: '#C925D1',
  network: '#8C4FFF',
  integration: '#E7157B',
  management: '#3B82F6',
  devtools: '#0D9488',
  security: '#DD344C',
  users: '#38bdf8',
};

export const COLOR = {
  ok: '#22c55e',
  warn: '#f59e0b',
  bad: '#ef4444',
  info: '#38bdf8',
  // request packets
  static: '#4ade80',
  dynamic: '#fbbf24',
  db: '#f472b6',
  dns: '#c4b5fd',
  outbound: '#22d3ee',
  error: '#ff3b3b',
  cold: '#7dd3fc',
  // scene
  platformTop: '#dfe7f3',
  platformSide: '#7d8fb0',
  azTop: '#edf2fa',
  publicSubnet: '#bbf7d0',
  privateSubnet: '#bfdbfe',
  serverBody: '#273041',
  serverSlot: '#151b27',
};
