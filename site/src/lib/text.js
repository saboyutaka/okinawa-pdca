// PDFから読んだ文章の改行を整える。文の途中の折り返しはつなぎ、見出し・箇条の頭・文末の改行は残す
// 報告書の表の値の改行を空白にして1行にする（「1,032万t-CO₂\n（R3年度）」→「1,032万t-CO₂ （R3年度）」）。空なら —
export const oneLine = (v) => (v || '—').replace(/\s*\n\s*/g, ' ');

export function joinLines(text) {
  let out = '';
  let prev = '';
  for (const line of (text || '').split('\n')) {
    if (!out) out = line;
    else if (/^[・\[【※○◯●①-⑳（(]/.test(line) || /[。」）)】：:]$/.test(prev) || prev.length <= 20) out += `\n${line}`;
    else out += line;
    prev = line;
  }
  return out;
}

// 県の分析（Check・Action）を「[主な取組]」「[成果指標]」の行で区切る
export function sections(text) {
  const parts = [];
  let cur = { head: null, body: [] };
  for (const line of joinLines(text).split('\n')) {
    const m = line.match(/^\[(.+?)\]$/);
    if (m) {
      if (cur.head || cur.body.length) parts.push(cur);
      cur = { head: m[1], body: [] };
    } else cur.body.push(line);
  }
  parts.push(cur);
  return parts.filter((p) => p.head || p.body.join('').trim()).map((p) => ({ head: p.head, body: p.body.join('\n') }));
}

// 最初の一文（「施策の方向」の要約に使う）
export function firstSentence(text) {
  const t = (text || '').replace(/\n/g, '').replace(/^[・\s]+/, '');
  const i = t.indexOf('。');
  return i >= 0 ? t.slice(0, i + 1) : t;
}
