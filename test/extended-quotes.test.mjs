import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/chart-app.jsx", import.meta.url), "utf8");
const feedSource = readFileSync(new URL("../src/board-datafeed.js", import.meta.url), "utf8");
const page = readFileSync(new URL("../index.html", import.meta.url), "utf8");

test("미국 장전·장후 시세는 신선도가 확인된 경우에만 정규장 가격과 별도로 전달한다", () => {
  assert.match(feedSource, /Math\.abs\(Date\.now\(\) - Date\.parse\(n\.extended\.asof\)\) < 12e5/);
  assert.match(source, /className: "extended-note"/);
  assert.match(source, /r\.extended\.session === "pre" \? "장전" : "장후"/);
  assert.match(source, /t\.extended\.session === "pre" \? "장전" : "장후"/);
  assert.match(source, /children: formatQuotePrice\(r, r\.last\)/); // 기존 정규장 종가 유지
  assert.match(source, /children: r\.changeUnavailable \? "전일비 없음" : \$n\(r\.chg\)/); // 신규 상장 첫날만 비교불가, 나머지는 등락률 유지
});

test("좁은 모바일 시세 종목 행에서 연장장 가격이 가로폭을 넘지 않는다", () => {
  assert.match(page, /\.w-quote\s*\{[^}]*min-width:\s*0;[^}]*max-width:/);
  assert.match(page, /\.extended-note\s*\{[^}]*max-width:\s*100%;[^}]*text-overflow:\s*ellipsis;/);
});
