// 指標のマップの材料（lib/map-data.ts・lib/map-label.ts）。コミットした data/extracted を読む
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  MAP_KINDS, cellHtml, mapCells, mapCheck, mapCounts, mapDataHash, mapDataJson, mapDataPath, mapRows, type MapData, type MapKind,
} from '../src/lib/map-data.ts';
import { mapLabel } from '../src/lib/map-label.ts';
import { YEARS, LATEST, SHUYOU_COUNT, getSeika, getTorikumi, getShuyouStatus, shuyouCounts, rateBin, statusOf, countBy, RATE_BINS, STATUSES } from '../src/lib/data.ts';

const data = (kind: MapKind) => JSON.parse(mapDataJson(kind)) as MapData;
const at = YEARS.indexOf(LATEST);
// 最新の年度の区分ごとの数（凡例の言葉で）
const latestCounts = (kind: MapKind) => {
  const cats = MAP_KINDS.find((k) => k.kind === kind)!.cats;
  return Object.fromEntries(cats.map((c, i) => [c.key, mapCells(kind).filter((x) => x.c[at] === String(i)).length]));
};

test('マスの数は、年度ごとの報告の指標の数（主要指標は概要版の49指標・成果指標・主な取組の延べ件数）', () => {
  const shuyou = mapCounts('shuyou');
  assert.equal(shuyou[at], SHUYOU_COUNT[LATEST]);
  assert.equal(shuyou[YEARS.indexOf(2023)], 0); // R5 は概要版の表が画像で読めない
  assert.deepEqual(mapCounts('seika'), YEARS.map((y) => getSeika(y).length));
  assert.deepEqual(mapCounts('katsudou'), YEARS.map((y) => getTorikumi(y).length));
});

test('最新の年度の区分ごとの数は、ほかのページの数え方と同じ', () => {
  const shuyou = shuyouCounts(getShuyouStatus());
  const cats = MAP_KINDS.find((k) => k.kind === 'shuyou')!.cats;
  assert.deepEqual(Object.fromEntries(cats.map((c) => [c.label, latestCounts('shuyou')[c.key]])), shuyou);
  assert.deepEqual(latestCounts('seika'), countBy(getSeika(LATEST), rateBin, RATE_BINS.map((b) => b.key)));
  assert.deepEqual(latestCounts('katsudou'), countBy(getTorikumi(LATEST), statusOf, STATUSES.map((s) => s.key)));
});

test('中身の JSON はマスと同じ並び・同じ数で、報告の無い年度だけが null。リンクは重ならない', () => {
  for (const { kind } of MAP_KINDS) {
    const d = data(kind);
    const cells = mapCells(kind);
    assert.equal(d.items.length, cells.length, kind);
    assert.equal(d.check, mapCheck(kind));
    cells.forEach((c, i) => {
      const item = d.items[i];
      assert.deepEqual(item.y.map((y) => y == null), [...c.c].map((k) => k === '-'), `${kind} ${item.n}`);
      assert.ok(d.parents[item.p], `${kind} ${item.n} の親`);
    });
    const hrefs = d.items.map((x) => x.h);
    if (kind !== 'shuyou') assert.equal(new Set(hrefs).size, hrefs.length, kind); // 主要指標は男女別などが基本施策のページの同じカードを指す
  }
});

test('将来像ごとの行は、どの指標のマスも報告書の順のまま将来像で区切ったもので、最新の報告に無いマスは隠して書く', () => {
  const rows = mapRows();
  assert.deepEqual(rows.map((r) => r.s), [1, 2, 3, 4, 5]);
  for (const { kind } of MAP_KINDS) {
    const tiers = rows.map((r) => r.tiers.find((t) => t.kind === kind)!);
    assert.equal(tiers.map((t) => t.html).join(''), mapCells(kind).map((c) => cellHtml(kind, c)).join(''), kind);
    assert.equal(tiers.reduce((s, t) => s + t.n, 0), mapCells(kind).length);
    assert.equal(tiers.reduce((s, t) => s + t.latest, 0), mapCounts(kind)[at]);
  }
  assert.equal(cellHtml('seika', { s: 1, c: '30-0', dept: '環境部', themes: ['eco', 'shizen'] }), '<i class="mc tone-good" data-c="30-0" data-d="環境部" data-t="eco shizen"></i>');
  assert.equal(cellHtml('katsudou', { s: 1, c: '000-', dept: '', themes: [] }), '<i class="mc tone-blank" data-c="000-" hidden></i>');
});

test('書き出す場所の名前は、中身の SHA-256 の先頭8桁', () => {
  for (const { kind } of MAP_KINDS) {
    assert.equal(mapDataHash(kind), createHash('sha256').update(mapDataJson(kind)).digest('hex').slice(0, 8));
    assert.equal(mapDataPath(kind), `/map/${kind}-${mapDataHash(kind)}.json`);
  }
});

test('マス目の読み上げは、指標ごとに区分ごとの数を県の並びのまま（0 の区分は省く）', () => {
  assert.equal(
    mapLabel('R7', [
      { term: '主要指標', unit: '指標', counts: [['目標値に到達', 2], ['後退', 1]], hit: null },
      { term: '活動指標', unit: '件', counts: [['順調', 1200], ['やや遅れ', 0], ['大幅遅れ', 3]], hit: 5 },
    ]),
    '指標のマップ（R7）。主要指標 3指標（目標値に到達 2指標、後退 1指標）。活動指標 1,203件（順調 1,200件、大幅遅れ 3件。絞り込みの条件に合うのは 5件）。矢印キーでマスを移ると、その中身を出します',
  );
  assert.match(mapLabel('R5', [{ term: '主要指標', unit: '指標', counts: [['後退', 0]], hit: null }]), /主要指標はR5の分を出していません/);
});
