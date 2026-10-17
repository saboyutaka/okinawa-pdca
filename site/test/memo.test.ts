// ビルドで1度だけ作るもの（lib/memo.ts）と、施策 ID の並べ方
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once, onceBy } from '../src/lib/memo.ts';
import { compareShisakuId } from '../src/lib/data.ts';

test('once: 1度だけ作り、同じものを返す（undefined を返すものも作り直さない）', () => {
  let n = 0;
  const f = once(() => ({ n: ++n }));
  assert.equal(f(), f());
  assert.equal(n, 1);
  let m = 0;
  const g = once(() => { m++; return undefined; });
  g();
  g();
  assert.equal(m, 1);
});

test('onceBy: 引数ごとに1度だけ作る', () => {
  const made: number[] = [];
  const f = onceBy((y: number) => { made.push(y); return [y]; });
  assert.equal(f(2025), f(2025));
  assert.notEqual(f(2024), f(2025));
  assert.deepEqual(made, [2025, 2024]);
});

test('compareShisakuId: 施策 ID を報告書の順に並べる（番号は数として比べる）', () => {
  assert.deepEqual(['1-1-a-10', '1-10-a-1', '1-1-a-9', '1-2-b-1'].sort(compareShisakuId), ['1-1-a-9', '1-1-a-10', '1-2-b-1', '1-10-a-1']);
});
