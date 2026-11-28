import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import { resolve, sep, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = resolve(fileURLToPath(new URL("../", import.meta.url)));
const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
};

async function serveDemo() {
  const server = createServer(async (req, res) => {
    const requested = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
    const path = resolve(root, "." + requested);
    if (!path.startsWith(root + sep)) {
      res.writeHead(403).end();
      return;
    }
    try {
      const data = await readFile(path);
      res.writeHead(200, { "content-type": mime[extname(path)] || "application/octet-stream" });
      res.end(data);
    } catch {
      res.writeHead(404).end();
    }
  });
  await new Promise((done) => server.listen(0, "127.0.0.1", done));
  return {
    url: `http://127.0.0.1:${server.address().port}/preview-demo.html#/assets`,
    close: () => new Promise((done) => server.close(done)),
  };
}

async function inspectLayout(page) {
  return page.evaluate(async () => {
    window.scrollTo(0, document.documentElement.scrollHeight);
    await new Promise(requestAnimationFrame);
    const rect = (element) => {
      const r = element.getBoundingClientRect();
      return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
    };
    const range = rect(document.querySelector(".range"));
    const fields = [...document.querySelectorAll(".range-inputs .date-select")].map(rect);
    const visibleDates = [...document.querySelectorAll(".range-inputs .date-value")].map((el) => ({
      value: el.textContent.trim(),
      clipped: el.scrollWidth > el.clientWidth + 1,
    }));
    const targets = [...document.querySelectorAll(
      ".compare-pick, .range-step-pair button, .range-inputs .date-select, .tabbar a",
    )].filter((el) => el.getClientRects().length).map((el) => ({
      name: el.getAttribute("aria-label") || el.textContent.trim(),
      ...rect(el),
    }));
    const dock = rect(document.querySelector(".tabbar"));
    const end = rect(document.querySelector("#view").lastElementChild);
    return {
      viewport: document.documentElement.clientWidth,
      documentWidth: document.documentElement.scrollWidth,
      range,
      fields,
      visibleDates,
      targets,
      dock,
      end,
      sliderOpen: document.querySelector(".range-custom").open,
    };
  });
}

test("자산 페이지는 실제 모바일 렌더링에서 날짜·카드·도크 넘침이 없다", { timeout: 120_000 }, async () => {
  const server = await serveDemo();
  let browser;
  const failures = [];
  try {
    browser = await chromium.launch({ headless: true });
    for (const width of [320, 375, 390, 430]) {
      const context = await browser.newContext({
        viewport: { width, height: 844 },
        deviceScaleFactor: 1,
        isMobile: true,
        hasTouch: true,
        reducedMotion: "reduce",
      });
      const page = await context.newPage();
      try {
        const response = await page.goto(server.url, { waitUntil: "networkidle" });
        assert.equal(response?.status(), 200, "가상 데이터 미리보기 HTML 응답 오류");
        await page.locator(".range-custom[open]").waitFor({ timeout: 10_000 });
        await page.locator(".range-fine > summary").click();
        const m = await inspectLayout(page);
        const problems = [];
        if (m.documentWidth > m.viewport + 1) {
          problems.push(`가로 넘침 ${m.documentWidth - m.viewport}px`);
        }
        if (!m.sliderOpen) problems.push("기간 슬라이더가 접힘");
        if (m.fields.length !== 2) problems.push("시작일·종료일 필드가 2개가 아님");
        if (m.fields.some((r) => r.left < m.range.left - 1 || r.right > m.range.right + 1)) {
          problems.push("날짜 입력칸이 카드 밖으로 나감");
        }
        if (m.fields.length === 2) {
          const [a, b] = m.fields;
          if (a.left < b.right - 1 && b.left < a.right - 1
              && a.top < b.bottom - 1 && b.top < a.bottom - 1) {
            problems.push("날짜 입력칸이 서로 겹침");
          }
        }
        if (m.visibleDates.some((x) => x.clipped)) {
          problems.push("연도가 포함된 날짜 값이 말줄임 처리됨");
        }
        for (const item of m.targets) {
          if (item.width < 44 || item.height < 44) {
            problems.push(`44px 조작 목표 미달: ${item.name} ${item.width}×${item.height}`);
          }
        }
        if (m.end.bottom > m.dock.top - 8) {
          problems.push("끝까지 스크롤해도 마지막 콘텐츠가 하단 도크에 가림");
        }
        if (problems.length) {
          await mkdir(resolve(root, "browser-artifacts"), { recursive: true });
          await page.screenshot({ path: resolve(root, `browser-artifacts/assets-${width}.png`), fullPage: true });
          failures.push({ width, problems });
        }
      } finally {
        await context.close();
      }
    }
    assert.deepEqual(failures, [], JSON.stringify(failures, null, 2));
  } finally {
    await browser?.close();
    await server.close();
  }
});

test("실제 DOM에서 계좌·기간 조작은 성과에 반영되고 슬라이더는 열린 채 유지된다", { timeout: 30_000 }, async () => {
  const server = await serveDemo();
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const response = await page.goto(server.url, { waitUntil: "networkidle" });
    assert.equal(response?.status(), 200, "가상 데이터 미리보기 HTML 응답 오류");
    await page.locator(".range-custom[open]").waitFor({ timeout: 10_000 });
    const total = page.locator(".account [data-total]");
    const investmentReturn = page.locator(".account .perf > div").last().locator("b");
    const before = {
      total: await total.innerText(),
      investmentReturn: await investmentReturn.innerText(),
    };
    await page.locator('[data-compare-key="pension"]').click();
    assert.equal(await page.locator('[data-compare-key="pension"]').getAttribute("aria-pressed"), "true");
    assert.notEqual(await total.innerText(), before.total, "계좌 토글에 평가액 합계가 연동되지 않음");
    assert.notEqual(await investmentReturn.innerText(), before.investmentReturn, "계좌 토글에 투자수익률이 연동되지 않음");
    assert.equal(await page.locator(".range-custom").getAttribute("open"), "");
    const oldRange = await page.locator(".range-summary .range-dates").innerText();
    await page.locator(".range-top button").filter({ hasText: "1주" }).click();
    assert.notEqual(await page.locator(".range-summary .range-dates").innerText(), oldRange);
    assert.equal(await page.locator(".range-custom").getAttribute("open"), "");
    assert.equal(await page.getByText("선택 계좌 구성", { exact: true }).count(), 0);
  } finally {
    await browser?.close();
    await server.close();
  }
});

test("WCAG 2.2: 기간 손잡이를 키보드로 조작하고 모든 테마의 기본 텍스트 대비를 보장한다", { timeout: 30_000 }, async () => {
  const server = await serveDemo();
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const response = await page.goto(server.url, { waitUntil: "networkidle" });
    assert.equal(response?.status(), 200);
    await page.locator(".range-custom[open]").waitFor({ timeout: 10_000 });
    const thumb = page.locator('.range:not(.range-float) input[data-end="from"]');
    const before = await thumb.getAttribute("aria-valuetext");
    await thumb.focus();
    await page.keyboard.press("ArrowRight");
    assert.notEqual(await thumb.getAttribute("aria-valuetext"), before, "키보드 방향키가 시작일을 변경하지 못함");
    assert.equal(await page.locator(".range-custom").getAttribute("open"), "");

    const scores = await page.evaluate(() => {
      const luminance = (hex) => {
        const rgb = hex.match(/[0-9a-f]{2}/gi).map((x) => parseInt(x, 16) / 255);
        const linear = rgb.map((v) => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
        return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
      };
      const contrast = (a, b) => {
        const x = luminance(a), y = luminance(b);
        return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
      };
      return ["default", "storm", "cobalt", "espresso"].flatMap((palette) => {
        if (palette === "default") document.documentElement.removeAttribute("data-palette");
        else document.documentElement.dataset.palette = palette;
        const tokens = getComputedStyle(document.documentElement);
        const color = (name) => tokens.getPropertyValue(`--${name}`).trim();
        return ["ink", "sub", "dim"].flatMap((fg) => ["panel", "raised"].map((bg) => ({
          palette, fg, bg, contrast: contrast(color(fg), color(bg)),
        })));
      });
    });
    const insufficient = scores.filter((x) => x.contrast < 4.5);
    assert.deepEqual(insufficient, [], `일반 텍스트 WCAG AA 대비 미달: ${JSON.stringify(insufficient)}`);
  } finally {
    await browser?.close();
    await server.close();
  }
});
