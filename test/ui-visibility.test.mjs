import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const tokens = read("assets/tokens.css");
const css = read("assets/app.css");
const theme = read("assets/theme.js");
const assets = read("assets/view-assets.js");
const quotes = read("assets/sise.js");
const page = read("index.html");

function paletteTokens() {
  const palettes = new Map();
  let base = {};
  for (const match of tokens.matchAll(/:root(?:\[data-palette="([^"]+)"\])?\s*\{([^}]+)\}/g)) {
    const vars = Object.fromEntries(
      [...match[2].matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()])
    );
    if (!match[1]) base = vars;
    palettes.set(match[1] ?? "black", { ...base, ...vars });
  }
  return palettes;
}

function luminance(hex) {
  assert.match(hex, /^#[\da-f]{6}$/i);
  const channels = hex.slice(1).match(/../g).map((v) => parseInt(v, 16) / 255);
  const linear = channels.map((v) => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function contrast(a, b) {
  const levels = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (levels[0] + 0.05) / (levels[1] + 0.05);
}

test("모든 테마의 입력 경계 3:1 및 보조 텍스트 4.5:1 대비를 유지한다", () => {
  const palettes = paletteTokens();
  assert.deepEqual([...palettes.keys()], ["black", "storm", "cobalt", "espresso"]);
  for (const [name, palette] of palettes) {
    for (const surface of ["--panel", "--raised"]) {
      assert.ok(contrast(palette["--line-strong"], palette[surface]) >= 3,
        name + ": " + surface + " controls need a 3:1 visible boundary");
    }
    assert.ok(contrast(palette["--dim"], palette["--panel"]) >= 4.5,
      name + ": secondary labels need a 4.5:1 contrast");
    assert.notEqual(palette["--warn"], palette["--accent"],
      name + ": warnings must not use the primary action color");
  }
});

test("브랜드 포인트는 테마 선택기와 실제 토큰이 일치한다", () => {
  for (const palette of paletteTokens().values()) {
    assert.ok(theme.includes('accent: "' + palette["--accent"] + '"'));
  }
  assert.match(theme, /\.theme-btn\{width:44px;height:44px/);
  assert.match(theme, /focus-visible/);
});

test("완료 기록은 투명도 대신 명시적 보조색으로 표현한다", () => {
  assert.doesNotMatch(css, /\.dates \.done\s*\{[^}]*opacity\s*:/);
  assert.doesNotMatch(css, /\.rung\.done\s+:is\([^)]+\)\s*\{[^}]*opacity\s*:/);
  assert.match(css, /\.dates \.done \.dday\s*\{[^}]*color:\s*var\(--dim\)/);
});

test("자산 기간 상세 선택은 펼침식이며 기존 날짜·슬라이더를 보존한다", () => {
  assert.match(assets, /<details class="range-custom"/);
  assert.match(assets, /<summary class="range-summary">/);
  assert.match(assets, /\$\{datePicker\("from"/);
  assert.match(assets, /\$\{datePicker\("to"/);
  assert.match(assets, /\$\{sliderBox\(t, w\)\}/);
  assert.match(assets, /querySelector\("\.range-custom"\)\.open = false/);
  assert.match(assets, /!!bar\.querySelector\("\.range-custom"\)\?\.open/);
  assert.match(css, /\.range-summary\s*\{[^}]*min-height:\s*44px/);
  assert.match(css, /\.date-select\s*\{[^}]*border:\s*1px solid var\(--line-strong\)/);
});

test("시세와 차트 색상이 팔레트에 반응하고 작은 화면에서 정보가 줄바꿈된다", () => {
  assert.match(quotes, /gc="var\(--up\)",yc="var\(--down\)"/);
  assert.match(quotes, /color-mix\(in srgb, \$\{l\}/); // heatmap SVG 색상 보간
  assert.match(quotes, /up:e\("--up"\),down:e\("--down"\)/); // canvas용 실제 색상
  assert.match(page, /\.extended-note\s*\{[^}]*-webkit-line-clamp:\s*2/);
  assert.match(page, /max-width:\s*380px/);
});
