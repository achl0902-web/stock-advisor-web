import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const bundle = readFileSync(new URL("../assets/sise.js", import.meta.url), "utf8");
const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");

test("시세 완료시각과 자산 이력 완료시각을 독립적으로 보여준다", () => {
  assert.match(bundle, /시세 \$\{f1\(t\.asof\)\} 완료/);
  assert.match(bundle, /t\.history_asof\?\x60자산 이력 \$\{f1\(t\.history_asof\)\} 완료/);
  assert.match(bundle, /new Date\(t\.history_asof\)<new Date\(t\.asof\)/);
  assert.match(bundle, /자산 이력 갱신 대기/);
  assert.match(bundle, /className:"fresh-times"/);
});

test("좁은 화면에서 두 줄 표시가 가로 넘침을 만들지 않도록 제한한다", () => {
  assert.match(html, /\.fresh\s*\{[^}]*min-width:\s*0/);
  assert.match(html, /\.fresh-times\s*\{[^}]*display:\s*grid;[^}]*min-width:\s*0/);
  assert.match(html, /\.fresh-times span \+ span\s*\{[^}]*font-size:\s*12px/);
});
