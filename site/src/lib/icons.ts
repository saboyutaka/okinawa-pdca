// 状態の印。色だけで意味を伝えないよう、状態ごとに形を変える（ページの HTML とブラウザのスクリプトの両方で使う）
// 状態の色（styles/global.css の .tone-*）。good 順調 → warning → serious → critical 大幅遅れ、none 未着手、blank 記載なし・公表なし
export type Tone = 'good' | 'warning' | 'serious' | 'critical' | 'none' | 'blank';
export type Shape = keyof typeof PATHS;

export const SHAPES: Record<Tone, Shape> = { good: 'circle', warning: 'diamond', serious: 'up', critical: 'square', none: 'dash', blank: 'ring' };

const PATHS = {
  circle: '<circle cx="6" cy="6" r="5"/>',
  diamond: '<path d="M6 .7 11.3 6 6 11.3 .7 6Z"/>',
  up: '<path d="M6 1 11.4 10.8H.6Z"/>',
  down: '<path d="M.6 1.2H11.4L6 11Z"/>',
  square: '<rect x="1.4" y="1.4" width="9.2" height="9.2" rx="1"/>',
  dash: '<rect x=".8" y="4.6" width="10.4" height="2.8" rx="1"/>',
  ring: '<circle class="ring" cx="6" cy="6" r="4.6"/>',
};

export function iconSvg(tone?: Tone | null, shape?: Shape | null, size = 12) {
  const s = shape || (tone && SHAPES[tone]) || 'ring';
  return `<svg class="ic tone-${tone || 'blank'}" viewBox="0 0 12 12" width="${size}" height="${size}" aria-hidden="true" focusable="false">${PATHS[s]}</svg>`;
}

// 施策の判定（A〜G）の形と短い言い方。C・D は成果の遅れ（▲）、E・F は取組の遅れ（▼・斜線）
export const JUDGE_UI: Record<string, { shape: Shape; short: string; hatch?: boolean }> = {
  A: { shape: 'circle', short: '順調' },
  B: { shape: 'diamond', short: '概ね順調' },
  C: { shape: 'up', short: '成果が遅れている' },
  D: { shape: 'up', short: '成果が遅れている' },
  E: { shape: 'down', short: '取組が遅れている', hatch: true },
  F: { shape: 'down', short: '取組が遅れている', hatch: true },
  G: { shape: 'square', short: '大幅遅れ' },
};
// 判定をまとめて数えるときの区分（トップ・テーマの棒）
export const JUDGE_GROUPS: { key: string; keys: string[]; label: string; tone: Tone; shape: Shape; hatch?: boolean }[] = [
  { key: 'A', keys: ['A'], label: 'A 順調', tone: 'good', shape: 'circle' },
  { key: 'B', keys: ['B'], label: 'B 概ね順調', tone: 'warning', shape: 'diamond' },
  { key: 'C・D', keys: ['C', 'D'], label: 'C・D 成果が遅れている', tone: 'serious', shape: 'up' },
  { key: 'E・F', keys: ['E', 'F'], label: 'E・F 取組が遅れている', tone: 'serious', shape: 'down', hatch: true },
  { key: 'G', keys: ['G'], label: 'G 大幅遅れ', tone: 'critical', shape: 'square' },
];
export const judgeGroupOf = (key: string | null | undefined) => JUDGE_GROUPS.find((g) => key != null && g.keys.includes(key));

// くらしのテーマの線画（24×24）。C は円、R は角丸の四角、それ以外は path
const THEME_ICONS: Record<string, string[]> = {
  kosodate: ['C8 7 3', 'M3 21v-3a5 5 0 0 1 10 0v3', 'C17 10.5 2.2', 'M14 21v-2a3 3 0 0 1 6 0v2'],
  manabi: ['M3 5h6a3 3 0 0 1 3 3v12a2 2 0 0 0-2-2H3z', 'M21 5h-6a3 3 0 0 0-3 3v12a2 2 0 0 1 2-2h7z'],
  iryo: ['R3 3 18 18 4', 'M12 8v8', 'M8 12h8'],
  fukushi: ['M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.5-7 10-7 10z'],
  tayousei: ['M2.5 18a9.5 9.5 0 0 1 19 0', 'M6.5 18a5.5 5.5 0 0 1 11 0', 'M10.5 18a1.5 1.5 0 0 1 3 0'],
  tsunagari: ['C8 6 2.5', 'C16 6 2.5', 'M4 20v-5a4 4 0 0 1 8 0', 'M12 15a4 4 0 0 1 8 0v5', 'M10 14.5h4'],
  anzen: ['M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z', 'M9 12l2 2 4-4'],
  sumai: ['M3 11l9-7 9 7', 'M5 10v10h14V10', 'M10 20v-5h4v5'],
  kotsu: ['R5 3 14 15 3', 'M5 11h14', 'C8.5 15 1', 'C15.5 15 1', 'M8 18v2', 'M16 18v2'],
  ritou: ['M4 15c2-4 6-6 8-6s6 2 8 6z', 'M12 9V4', 'M12 4c2 0 3 1 4 2', 'M2 19c2 0 2-1.5 4-1.5S8 19 10 19s2-1.5 4-1.5S16 19 18 19s2-1.5 4-1.5'],
  hataraku: ['R3 7 18 13 2', 'M9 7V5h6v2', 'M3 12h18'],
  shoko: ['M4 4h16l1.5 5h-19z', 'M4.5 9v11h15V9', 'M10 20v-5.5h4V20'],
  kanko: ['R3 7 18 13 3', 'C12 13.5 3.5', 'M8 7l1.5-3h5L16 7'],
  nougyo: ['M12 21v-9', 'M12 12c0-4 3-6 7-6 0 4-3 6-7 6z', 'M12 14c0-3-2-5-6-5 0 3 2 5 6 5z'],
  digital: ['R3 4 18 12 2', 'M8 20h8', 'M12 16v4', 'M9 9l-2 1.5L9 12', 'M15 9l2 1.5L15 12'],
  daigaku: ['M2 9l10-5 10 5-10 5z', 'M6 11v5c3 2.5 9 2.5 12 0v-5', 'M22 9v6'],
  startup: ['M12 2.5c3 2.2 4.5 5.4 4.5 9.5v4.5h-9V12c0-4.1 1.5-7.3 4.5-9.5z', 'C12 10 1.8', 'M7.5 13.5L5 16.5V19l2.5-1.5', 'M16.5 13.5l2.5 3V19l-2.5-1.5', 'M10.5 19.5L12 22l1.5-2.5'],
  butsuryu: ['R2 6 11 10 1', 'M13 9h4l4 4v3h-8', 'C6.5 18 2', 'C17 18 2'],
  shizen: ['M5 19c0-8 5-14 14-14 0 9-6 14-14 14z', 'M5 19l7-7'],
  umi: ['M2 8c2 0 2-1.5 4-1.5S8 8 10 8s2-1.5 4-1.5S16 8 18 8s2-1.5 4-1.5', 'M2 13c2 0 2-1.5 4-1.5S8 13 10 13s2-1.5 4-1.5S16 13 18 13s2-1.5 4-1.5', 'M2 18c2 0 2-1.5 4-1.5S8 18 10 18s2-1.5 4-1.5S16 18 18 18s2-1.5 4-1.5'],
  eco: ['M20 12a8 8 0 0 1-13.7 5.6', 'M4 12a8 8 0 0 1 13.7-5.6', 'M17.7 2.5v4h-4', 'M6.3 21.5v-4h4'],
  bunka: ['M9 18V6l10-2v12', 'C7 18 2', 'C17 16 2'],
  kokusai: ['C12 12 9', 'M3 12h18', 'M12 3c3.5 3 3.5 15 0 18', 'M12 3c-3.5 3-3.5 15 0 18'],
  heiwa: ['M4 14c4 0 6-2 8-6 1 3 4 4 8 4-2 4-6 6-11 6l-3 2z'],
};
export function themeIconSvg(id: string) {
  const parts = (THEME_ICONS[id] || []).map((p) => {
    const n = p.slice(1).trim().split(' ');
    if (p[0] === 'C') return `<circle cx="${n[0]}" cy="${n[1]}" r="${n[2]}"/>`;
    if (p[0] === 'R') return `<rect x="${n[0]}" y="${n[1]}" width="${n[2]}" height="${n[3]}" rx="${n[4]}"/>`;
    return `<path d="${p}"/>`;
  });
  return `<svg class="theme-ic" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${parts.join('')}</svg>`;
}
