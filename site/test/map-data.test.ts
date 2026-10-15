// 指標のマップの材料（lib/map-data.ts・lib/map-label.ts）。コミットした data/extracted を読む
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  MAP_KINDS, cellHtml, mapCells, mapCheck, mapCounts, mapDataHash, mapDataJson, mapDataPath, mapGroups, type MapData, type MapKind,
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

test('将来像ごとのまとまりはマスを報告書の順のまま区切ったもので、最新の報告に無いマスは隠して書く', () => {
  for (const { kind } of MAP_KINDS) {
    const groups = mapGroups(kind);
    assert.deepEqual(groups.map((g) => g.s), [1, 2, 3, 4, 5]);
    assert.equal(groups.reduce((s, g) => s + g.n, 0), mapCells(kind).length);
    assert.equal(groups.reduce((s, g) => s + g.latest, 0), mapCounts(kind)[at]);
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

test('マス目の読み上げは、区分ごとの数を県の並びのまま（0 の区分は省く）', () => {
  assert.equal(
    mapLabel('成果指標', 'R7', [['100%以上', 1200], ['60%以上100%未満', 0], ['0%以下', 3]], '指標', null),
    '成果指標のマップ（R7、1,203指標）。100%以上 1,200指標、0%以下 3指標。矢印キーでマスを移ると、下に中身を出します',
  );
  assert.match(mapLabel('活動指標', 'R4', [['順調', 2]], '件', 1), /。絞り込みの条件に合うのは 1件。矢印キー/);
});
