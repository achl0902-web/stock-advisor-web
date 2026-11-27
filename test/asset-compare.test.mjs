import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { comparisonData, comparisonChart } from "../assets/asset-compare.js";

const worth = {
  t: ["2026-11-01", "2026-11-02", "2026-11-03"],
  v: { main: [100, 110, 120], bio: [null, 50, 55], pension: [300, 303, 306], crypto: [20, 21, 23] },
  f: { main: [0, 0, 20], bio: [0, 0, 0], pension: [0, 0, 0], crypto: [0, 0, 0] },
};

test("주 계좌와 바이오 합계에서는 계좌가 처음 생긴 날을 누락 없이 합산한다", () => {
  const { dates, series } = comparisonData(worth, ["main", "bio"], { from: "2026-11-01", to: "2026-11-03" }, null, "total");
  assert.deepEqual(dates, worth.t);
  assert.deepEqual(series[0].values, [100, 160, 175]);
});

test("선택 계좌만 개별 선에 포함되며 4개 모두 선택할 수 있다", () => {
  const four = comparisonData(worth, ["main", "bio", "pension", "crypto"], null, null, "accounts");
  assert.deepEqual(four.series.map(x => x.key), ["main", "bio", "pension", "crypto"]);
  assert.deepEqual(four.series.find(x => x.key === "bio").values, [null, 50, 55]);
  const only = comparisonData(worth, ["crypto"], null, null, "accounts");
  assert.deepEqual(only.series.map(x => x.key), ["crypto"]);
});

test("입금은 수익으로 간주하지 않고 시간가중 수익률을 계산한다", () => {
  const results = comparisonData(worth, ["main", "bio"], null, null, "returns");
  assert.ok(Math.abs(results.series.find(x => x.key === "main").values[2]) < 1e-7);
  assert.ok(Math.abs(results.series.find(x => x.key === "bio").values[2] - 10) < 1e-7);
  const html = comparisonChart(results, { main: "주 계좌", bio: "바이오" }, {}, { mode: "returns", fmt: v => `${v.toFixed(1)}%` });
  assert.match(html, /compare-line-path/);
  assert.match(html, /바이오/);
});

test("현재 값은 선택 계좌가 모두 최신 시세로 평가될 때만 추가한다", () => {
  const fresh = comparisonData(worth, ["main", "bio"], null, { main: 125, bio: 60 }, "total");
  assert.equal(fresh.dates.at(-1), "지금");
  assert.equal(fresh.series[0].values.at(-1), 185);
  const stale = comparisonData(worth, ["main", "bio"], null, { main: 125, bio: null }, "total");
  assert.equal(stale.dates.at(-1), "2026-11-03");
});

test("네 계좌 선택·도넛 유지·가족 보기 제한과 새 메뉴 순서를 코드로 확인한다", () => {
  const assets = readFileSync(new URL("../assets/view-assets.js", import.meta.url), "utf8");
  const nav = readFileSync(new URL("../assets/nav.js", import.meta.url), "utf8");
  assert.match(assets, /COMPARE_ORDER = \["main", "bio", "pension", "crypto"\]/);
  assert.match(assets, /window\.saFamily\s*\?\s*\["main", "crypto"\]/);
  assert.match(assets, /donut\(v,/);
  assert.ok(nav.indexOf('"today", "오늘"') < nav.indexOf('"assets", "자산"'));
  assert.ok(nav.indexOf('"assets", "자산"') < nav.indexOf('"sise", "시장"'));
  assert.ok(nav.indexOf('"sise", "시장"') < nav.indexOf('"log", "기록"'));
});
