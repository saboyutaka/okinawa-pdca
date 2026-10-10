// 状態の印。色だけで意味を伝えないよう、状態ごとに形を変える（ページの HTML とブラウザのスクリプトの両方で使う）
export const SHAPES = { good: 'circle', warning: 'diamond', serious: 'up', critical: 'square', none: 'dash', blank: 'ring' };

const PATHS = {
  circle: '<circle cx="6" cy="6" r="5"/>',
  diamond: '<path d="M6 .7 11.3 6 6 11.3 .7 6Z"/>',
  up: '<path d="M6 1 11.4 10.8H.6Z"/>',
  down: '<path d="M.6 1.2H11.4L6 11Z"/>',
  square: '<rect x="1.4" y="1.4" width="9.2" height="9.2" rx="1"/>',
  dash: '<rect x=".8" y="4.6" width="10.4" height="2.8" rx="1"/>',
  ring: '<circle class="ring" cx="6" cy="6" r="4.6"/>',
};

export function iconSvg(tone, shape, size = 12) {
  const s = shape || SHAPES[tone] || 'ring';
  return `<svg class="ic tone-${tone || 'blank'}" viewBox="0 0 12 12" width="${size}" height="${size}" aria-hidden="true" focusable="false">${PATHS[s]}</svg>`;
}

// 施策の判定（A〜G）の形と短い言い方。C・D は成果の遅れ（▲）、E・F は取組の遅れ（▼・斜線）
export const JUDGE_UI = {
  A: { shape: 'circle', short: '順調' },
  B: { shape: 'diamond', short: '概ね順調' },
  C: { shape: 'up', short: '成果が遅れている' },
  D: { shape: 'up', short: '成果が遅れている' },
  E: { shape: 'down', short: '取組が遅れている', hatch: true },
  F: { shape: 'down', short: '取組が遅れている', hatch: true },
  G: { shape: 'square', short: '大幅遅れ' },
};
// 判定をまとめて数えるときの区分（トップ・テーマの棒）
export const JUDGE_GROUPS = [
  { key: 'A', keys: ['A'], label: 'A 順調', tone: 'good', shape: 'circle' },
  { key: 'B', keys: ['B'], label: 'B 概ね順調', tone: 'warning', shape: 'diamond' },
  { key: 'C・D', keys: ['C', 'D'], label: 'C・D 成果が遅れている', tone: 'serious', shape: 'up' },
  { key: 'E・F', keys: ['E', 'F'], label: 'E・F 取組が遅れている', tone: 'serious', shape: 'down', hatch: true },
  { key: 'G', keys: ['G'], label: 'G 大幅遅れ', tone: 'critical', shape: 'square' },
];
export const judgeGroupOf = (key) => JUDGE_GROUPS.find((g) => g.keys.includes(key));

// くらしのテーマの線画（24×24）。C は円、R は角丸の四角、それ以外は path
const THEME_ICONS = {
  kosodate: ['C8 7 3', 'M3 21v-3a5 5 0 0 1 10 0v3', 'C17 10.5 2.2', 'M14 21v-2a3 3 0 0 1 6 0v2'],
  manabi: ['M3 5h6a3 3 0 0 1 3 3v12a2 2 0 0 0-2-2H3z', 'M21 5h-6a3 3 0 0 0-3 3v12a2 2 0 0 1 2-2h7z'],
  iryo: ['R3 3 18 18 4', 'M12 8v8', 'M8 12h8'],
  fukushi: ['M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.5-7 10-7 10z'],
  kanko: ['R3 7 18 13 3', 'C12 13.5 3.5', 'M8 7l1.5-3h5L16 7'],
  shigoto: ['R3 7 18 13 2', 'M9 7V5h6v2', 'M3 12h18'],
  nougyo: ['M12 21v-9', 'M12 12c0-4 3-6 7-6 0 4-3 6-7 6z', 'M12 14c0-3-2-5-6-5 0 3 2 5 6 5z'],
  kotsu: ['R5 3 14 15 3', 'M5 11h14', 'C8.5 15 1', 'C15.5 15 1', 'M8 18v2', 'M16 18v2'],
  ritou: ['M4 15c2-4 6-6 8-6s6 2 8 6z', 'M12 9V4', 'M12 4c2 0 3 1 4 2', 'M2 19c2 0 2-1.5 4-1.5S8 19 10 19s2-1.5 4-1.5S16 19 18 19s2-1.5 4-1.5'],
  kankyo: ['M5 19c0-8 5-14 14-14 0 9-6 14-14 14z', 'M5 19l7-7'],
  anzen: ['M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z', 'M9 12l2 2 4-4'],
  bunka: ['M9 18V6l10-2v12', 'C7 18 2', 'C17 16 2'],
  heiwa: ['M4 14c4 0 6-2 8-6 1 3 4 4 8 4-2 4-6 6-11 6l-3 2z'],
  sumai: ['M3 11l9-7 9 7', 'M5 10v10h14V10', 'M10 20v-5h4v5'],
};
export function themeIconSvg(id) {
  const parts = (THEME_ICONS[id] || []).map((p) => {
    const n = p.slice(1).trim().split(' ');
    if (p[0] === 'C') return `<circle cx="${n[0]}" cy="${n[1]}" r="${n[2]}"/>`;
    if (p[0] === 'R') return `<rect x="${n[0]}" y="${n[1]}" width="${n[2]}" height="${n[3]}" rx="${n[4]}"/>`;
    return `<path d="${p}"/>`;
  });
  return `<svg class="theme-ic" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${parts.join('')}</svg>`;
}
