// ページの頭に出す最新の年度の数（施策の判定・主な取組の進捗状況・成果指標の達成率の内訳）。
// ページの説明文（lib/describe.ts）と SNS のカードの画像（lib/card.ts）は、どちらもここで数えた数を使う（ページごとに数えると、カードとページの数がずれるため）
import {
  LATEST, RATE_BINS, STATUSES, countBy, countJudges, getSeika, getSeikaGroups, getShisakuList, getTorikumi, getTorikumiGroups,
  rateBin, seikaDept, seikaGroupsOf, shisakuDepts, statusOf, type Shisaku,
} from './data.ts';
import type { Theme } from './themes.ts';
import type { SeikaRow } from './types.ts';

type Counts = Record<string, number>;
const statusKeys = STATUSES.map((s) => s.key);
const rateKeys = RATE_BINS.map((b) => b.key);

export interface Head {
  tori: Counts; // 主な取組の進捗状況の内訳
  rates: Counts; // 成果指標の計画値に対する達成率の内訳（RATE_BINS）
  seika: number; // 成果指標の数
  reached: number; // そのうち計画値に到達した数（達成率100%以上）
}
// 基本施策・将来像・くらしのテーマ・部局
export interface AreaHead extends Head {
  shisaku: Shisaku[]; // かかわる施策
  judges: Counts; // その施策の判定の内訳（countJudges）
}

const sum = (c: Counts) => Object.values(c).reduce((a, n) => a + n, 0);
export const total = sum;

function seikaHead(rows: SeikaRow[]): Pick<Head, 'rates' | 'seika' | 'reached'> {
  const rates = countBy(rows, rateBin, rateKeys);
  return { rates, seika: rows.length, reached: rates['100%以上'] };
}
const area = (shisaku: Shisaku[], tori: Counts, seika: SeikaRow[]): AreaHead => ({ shisaku, judges: countJudges(shisaku), tori, ...seikaHead(seika) });

// 施策: その施策の最新の年度の主な取組と、最新の報告にある成果指標
export function shisakuHead(s: Shisaku): Head & { judge: string | null } {
  return {
    judge: s.judges[LATEST],
    tori: countBy(s.torikumi.filter((t) => t.year === LATEST), statusOf, statusKeys),
    ...seikaHead(seikaGroupsOf(s.id).filter((r) => r.latest.year === LATEST).map((r) => r.latest)),
  };
}

// 将来像: 施策のコードが将来像の番号で始まるもの
export function futureHead(id: number): AreaHead {
  const pre = `${id}-`;
  return area(
    getShisakuList().filter((s) => s.shouraizou === id),
    countBy(getTorikumi(LATEST).filter((t) => t.shisaku_id.startsWith(pre)), statusOf, statusKeys),
    getSeika(LATEST).filter((x) => x.shisaku_id.startsWith(pre)),
  );
}

// 基本施策: その基本施策の施策の取組・成果指標
export function kihonHead(id: string): AreaHead {
  const shisaku = getShisakuList().filter((s) => s.kihon_id === id);
  const ids = new Set(shisaku.map((s) => s.id));
  return area(
    shisaku,
    countBy(shisaku.flatMap((s) => s.torikumi.filter((t) => t.year === LATEST)), statusOf, statusKeys),
    getSeika(LATEST).filter((x) => ids.has(x.shisaku_id)),
  );
}

// くらしのテーマ: テーマに入る施策の主な取組・成果指標（lib/themes.ts）
export function themeHead(t: Theme): AreaHead {
  const byId = new Map(getShisakuList().map((s) => [s.id, s]));
  const tori = getTorikumiGroups().filter((g) => g.statuses.at(-1) && t.idSet.has(g.shisaku.id));
  const seika = getSeikaGroups().filter((r) => r.latest.year === LATEST && t.idSet.has(r.shisaku.id));
  return area(
    t.ids.map((id) => byId.get(id)!),
    countBy(tori, (g) => g.statuses.at(-1)!, statusKeys),
    seika.map((r) => r.latest),
  );
}

// 部局: 主な取組は最新の所管部局で数え（docs/data.md 7.2）、成果指標は担当部課の部局（seikaDept）。
// かかわる施策は、関係部等に名前がある施策と、関係部等には無いがこの部局の取組がある施策（shisakuDepts）
export function deptHead(name: string): AreaHead {
  const tori = getTorikumiGroups().filter((g) => g.dept === name && g.statuses.at(-1));
  return area(
    getShisakuList().filter((s) => shisakuDepts(s).some((d) => d.dept === name)),
    countBy(tori, (g) => g.statuses.at(-1)!, statusKeys),
    getSeika(LATEST).filter((x) => seikaDept(x) === name),
  );
}
