import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("공유 표시에서는 view=all URL로 개인 모드가 열리지 않고 민감 탭을 렌더링하지 않는다", () => {
  const dom = new JSDOM('<nav id="tabbar" data-current="log"></nav>', {
    url: "https://example.test/log.html?view=all#/log",
    runScripts: "outside-only",
  });
  try {
    dom.window.localStorage.setItem("sa:view", "family");
    dom.window.eval(read("assets/nav.js"));
    assert.equal(dom.window.saFamily, true);
    assert.equal(dom.window.localStorage.getItem("sa:view"), "family");
    assert.deepEqual([...dom.window.document.querySelectorAll("#tabbar a")].map(a => a.dataset.tab), ["assets", "sise"]);
  } finally { dom.window.close(); }
});

test("공유 모드는 개인 전환·설정 링크와 토큰 입력을 노출하지 않고, 인증이 없으면 표시를 중단한다", () => {
  const assets = read("assets/view-assets.js");
  const app = read("assets/app.js");
  const nav = read("assets/nav.js");
  assert.doesNotMatch(assets, /href=["']\.\/\?view=all|개인 보기 전환|공유용 표시 모드/);
  assert.doesNotMatch(nav, /removeItem\(["']sa:view/);
  assert.match(app, /document\.getElementById\("settings-link"\)\.remove\(\)/);
  assert.match(app, /if \(FAMILY && path !== "assets"\)/);
  assert.match(app, /if \(!cfg\?\.token\) \{ if \(FAMILY\) shareUnavailable\(\)/);
  assert.match(app, /개인용 GitHub 토큰을 입력하거나 다른 사람에게 전달하지 마세요/);
});
