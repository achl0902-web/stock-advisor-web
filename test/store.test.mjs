// store.js의 순수 계산 확인. 실행: node --test test/store.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { mergeLevels, nearest, upcoming, valueAccount, levelLabel, levelNote } from "../assets/store.js";

const alerts = { items: [
  { code: "0168K0", name: "바이오", hold: 4540, keep: 1840, alerts: [
    { id: "bio-1", op: ">=", price: 5630, msg: "1차: 약 900주 매도 (매물대)" },
    { id: "bio-low", op: "<=", price: 4645, msg: "52주 최저 이탈: 재검토" },
    { id: "bio-time", date: "2027-02-01", msg: "시간 기준: 매달 축소" },
  ] },
  { code: "QLD", name: "QLD", market: "US", account: "주 계좌", until: "2027-05-07", alerts: [{ id: "dd-1", op: "<=", price: 68.87, msg: "1단계 $68.87: 매수" }] },
  { code: "QLD", name: "QLD", market: "US", account: "주 계좌", until: "2026-11-13", alerts: [
    { id: "p-2", op: "<=", price: 77.43, msg: "2차 관심 $77.43 도달: 확인" },
    { id: "p-dup", op: "<=", price: 68.87, msg: "같은 가격" },
  ] },
  { code: "OLD", name: "지난 것", account: "주 계좌", until: "2026-11-01", alerts: [{ id: "old", op: "<=", price: 1, msg: "x" }] },
] };
const keyOf = label => (label === "주 계좌" ? "main" : "bio");

test("mergeLevels: 같은 계좌·종목은 합치고, 같은 가격은 한 번만, 기한 지난 항목은 뺀다", () => {
  const items = mergeLevels(alerts, { "bio-low": "2026-11-04" }, keyOf, "2026-11-12");
  assert.deepEqual(items.map(i => `${i.account}|${i.code}`), ["pension|0168K0", "main|QLD"]);
  const [bio, qld] = items;
  assert.equal(bio.plan, true);
  assert.equal(bio.hold, 4540);
  assert.equal(bio.currency, "KRW");
  assert.equal(bio.prices.find(p => p.id === "bio-low").fired, "2026-11-04");
  assert.equal(bio.dates.length, 1);
  assert.equal(qld.currency, "USD");
  assert.deepEqual(qld.prices.map(p => p.price), [68.87, 77.43]);
});

test("nearest: 닿지 않은 선을 현재가에서 가까운 순으로, 이미 닿은 선은 뺀다", () => {
  const items = mergeLevels(alerts, { "bio-low": "2026-11-04" }, keyOf, "2026-11-12");
  const rows = nearest(items, { "0168K0": { price: 5000 }, QLD: { price: 80 } });
  assert.deepEqual(rows.map(r => r.level.id), ["p-2", "bio-1", "dd-1"]);
  assert.ok(rows[0].dist < 0 && !rows[0].reached);
  assert.equal(nearest(items, { QLD: { price: 77 } })[0].reached, true); // <= 조건을 이미 넘음
  assert.equal(nearest(items, {}).length, 0); // 시세가 없으면 거리를 못 잰다
});

test("upcoming: 알리지 않은 날짜를 이른 순으로", () => {
  const items = mergeLevels(alerts, {}, keyOf, "2026-11-12");
  assert.deepEqual(upcoming(items).map(d => d.id), ["bio-time"]);
  assert.equal(upcoming(mergeLevels(alerts, { "bio-time": "2027-02-01" }, keyOf, "2026-11-12")).length, 0);
});

test("valueAccount: 시세가 다 있으면 지금 시세로, 하나라도 없으면 분석 시점 값으로", () => {
  const a = { cash_krw: 100000, cash_usd: 100, holdings: [
    { symbol: "QLD", qty: 10, avg_price: 50, currency: "USD" },
    { symbol: "A", qty: 2, avg_price: 1000, currency: "KRW" },
  ] };
  const live = valueAccount(a, { QLD: { price: 100 }, A: { price: 1500 } }, 1000);
  assert.equal(live.live, true);
  assert.equal(live.total, 10 * 100 * 1000 + 2 * 1500 + 100000 + 100 * 1000);
  assert.equal(live.rows[0].pl, 100);
  assert.ok(Math.abs(live.rows.reduce((s, r) => s + r.weight, 0) + live.cashPct - 100) < 1e-9);
  const snap = valueAccount(a, { QLD: { price: 100 } }, 1000, { total_krw: 999, holdings: [{ symbol: "A", weight_pct: 7 }] });
  assert.equal(snap.live, false);
  assert.equal(snap.total, 999);
  assert.equal(snap.rows[1].weight, 7);
  assert.equal(valueAccount(a, { QLD: { price: 100 }, A: { price: 1500 } }, null).live, false); // 달러 종목인데 환율이 없음
});

test("levelLabel·levelNote: 알림 문구에서 이름과 설명을 나눈다", () => {
  assert.equal(levelLabel("2차 관심 $77.43 도달: 주문해 두었다면 확인"), "2차 관심");
  assert.equal(levelLabel("1차: 약 900주 매도"), "1차");
  assert.equal(levelNote("1차: 약 900주 매도"), "약 900주 매도");
  assert.equal(levelNote("설명 없음"), "");
});

import { worthSeries } from "../assets/store.js";
test("worthSeries: 입출금을 뺀 투자손익·수익률, 기간 중 생긴 계좌는 입금으로", () => {
  const worth = { t: ["2026-11-01", "2026-11-02", "2026-11-03", "2026-11-04"],
    v: { a: [100, 120, 230, 220], c: [null, null, 50, 60] },
    f: { a: [0, 0, 100, 0], c: [0, 0, 0, 0] },
    events: { a: [{ d: "2026-11-03", label: "입금" }] } };
  const a = worthSeries(worth, "a", {}, null, "2026-11-04");
  assert.deepEqual(a.points.map(p => p.v), [100, 120, 230, 220]);
  assert.deepEqual(a.points.map(p => p.p), [100, 100, 200, 200]);  // 투자원금: 11/3에 100 입금
  assert.deepEqual(a.sum, { from: "2026-11-01", to: "2026-11-04", base: 100, end: 220, flows: 100, principal: 200, pnl: 20, rate: 10 });
  assert.deepEqual(a.marks, [{ t: "2026-11-03", label: "입금" }]);
  // 합계: c가 11/3에 생기면 그 50은 입금, 이후 +10은 손익
  const all = worthSeries(worth, ["a", "c"], {}, null, "2026-11-04");
  assert.deepEqual(all.points.map(p => p.v), [100, 120, 280, 280]);
  assert.equal(all.sum.flows, 150);
  assert.equal(all.sum.pnl, 30);
  // 기간 11/3~11/3: 기초는 전날(11/2) 마감 120, 11/3에 100 입금하고 230 → 손익 10
  assert.deepEqual(worthSeries(worth, "a", { from: "2026-11-03", to: "2026-11-03" }, null, "2026-11-04").sum,
    { from: "2026-11-02", to: "2026-11-03", base: 120, end: 230, flows: 100, principal: 220, pnl: 10, rate: 10 / 220 * 100 });
  const live = worthSeries(worth, "a", {}, { a: 250 }, "2026-11-05");
  assert.equal(live.points.at(-1).t, "지금");
  assert.equal(live.sum.pnl, 50);
  // 그 계좌가 생기기 전 날은 앞에서 잘라 낸다
  assert.deepEqual(worthSeries(worth, "c", {}, null, "2026-11-04").points.map(p => p.t), ["2026-11-03", "2026-11-04"]);
  assert.equal(worthSeries(null, "all").sum, null);
  // 실현손익·배당은 기초 다음 날부터 기말까지만
  const rz = { ...worth, realized: { a: [["2026-11-01", "X", 999], ["2026-11-03", "QLD", 7]] }, income: { a: [["2026-11-04", "배당", 3]] } };
  const r = worthSeries(rz, "a", {}, null, "2026-11-04").sum;
  assert.deepEqual([r.realized, r.income, r.unrealized, r.sells.length, r.partial], [7, 3, 10, 1, false]);
  assert.equal(worthSeries(rz, ["a", "c"], {}, null, "2026-11-04").sum.partial, true);
  assert.equal(worthSeries(worth, "a", {}, null, "2026-11-04").sum.realized, undefined); // 거래내역이 없으면 칸을 안 그린다
});
