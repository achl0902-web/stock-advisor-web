// 자산: 계좌(보유·비중·손익), 관심가(가격선 사다리·날짜), ETF 구성 감시.
import { ACCOUNT_ORDER, state, accountKeys, accountLabel, accountShort, accountView, viewOn, inUsd, levelItems, levelLabel, levelNote, todayKST, worthSeries, quoteStatus, livePositionsMatch } from "./store.js";
import { SERIES, CASH, donut, line, bindLines, dayText } from "./chart.js";
import { normalizeDateRange, shiftDateIndexByDays } from "./date-range.js";
import { mergedView } from "./portfolio-merge.js";
import { inline, markdown } from "./md.js";
import { view, esc, money, nf, pct, tone, dateLabel, dday, distText, krwShort, usdShort, qtyText, head, subtabs, chips, bindChips, icon, MARKET_TABS } from "./ui.js";


/* ---------- 계좌: 위에 기간(버튼·슬라이더), 선택 계좌의 투자성과·평가액 추이·종목 구성 ---------- */
const PERIODS = [["7", "1주"], ["30", "1개월"], ["90", "3개월"], ["365", "1년"], ["all", "전체"]];
// 선택한 기간은 양끝 모두 같은 형식으로 보여 주고, 기초 평가일은 아래 성과에 별도로 표시한다.
const rangeDate = d => d?.slice(2).replaceAll("-", ".") || "–";
// 날짜 입력의 iOS 기본 UI는 고유 너비가 커서 카드 밖으로 튀어나온다.
// 표시 너비는 우리 컨트롤이 담당하고, 투명한 날짜 입력은 터치·키보드·접근성에 그대로 쓴다.
function datePicker(end, label, date, min, max) {
  return `<label class="date-field"><span>${label}</span>
    <span class="date-select">
      <span class="date-value fig" data-date-value="${end}" aria-hidden="true">${date.replaceAll("-", ".")}</span>
      <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 10h18"/></svg>
      <input type="date" data-date="${end}" value="${date}" min="${min}" max="${max}" aria-label="성과 ${label}">
    </span>
  </label>`;
}
// 고른 기간: preset을 누르면 끝은 마지막 날, 슬라이더를 움직이면 preset이 풀린다. 날짜는 worth.t의 값
const win = { preset: "365", from: null, to: null };
let unit = "KRW"; // 계좌 탭의 성과를 원화로 볼지 달러로 볼지
let unitOn = false; // 지금 화면이 원/달러 고르기를 쓰는지(계좌 탭만)
let trends = []; // 지금 화면에 그린 성과 칸들 [{key, now, label}]: 기간을 바꾸면 이것만 다시 그린다

function presetWindow(t) {
  if (win.preset === "all") return { from: t[0], to: t.at(-1) };
  if (!win.preset) return normalizeDateRange(t, win.from || t[0], win.to || t.at(-1));
  const from = new Date(Date.parse(t.at(-1)) - +win.preset * 86400000).toISOString().slice(0, 10);
  return { from: t.find(d => d >= from) || t[0], to: t.at(-1) };
}

// 기간 고르기: 버튼(1주~전체)과 시작·끝 손잡이 두 개짜리 슬라이더. 화면 위에 하나, 아래 모든 성과 칸에 같이 쓴다
// 손잡이 두 개 슬라이더. 제자리 막대와 위에 뜨는 막대가 같은 모양을 쓴다
function sliderBox(t, w) {
  const at = d => t.length > 1 ? t.indexOf(d) / (t.length - 1) * 100 : 0;
  return `<div class="slider" style="--a:${at(w.from)}%;--b:${at(w.to)}%">
      <span class="slider-track" aria-hidden="true"><i></i></span>
      <input type="range" data-end="from" min="0" max="${t.length - 1}" value="${t.indexOf(w.from)}" aria-label="시작일" aria-valuetext="${esc(dayText(w.from))}" ${t.length < 2 ? "disabled" : ""}>
      <input type="range" data-end="to" min="0" max="${t.length - 1}" value="${t.indexOf(w.to)}" aria-label="끝일" aria-valuetext="${esc(dayText(w.to))}" ${t.length < 2 ? "disabled" : ""}>
    </div>`;
}

function rangeBox({ units = false } = {}) {
  unitOn = units && !!inUsd(state.model.worth);
  const t = state.model.worth?.t;
  if (!t?.length) return "";
  const w = presetWindow(t);
  const span = (Date.parse(t.at(-1)) - Date.parse(t[0])) / 86400000;
  // 제자리 막대는 크기가 절대 바뀌지 않는다(바뀌면 아래 내용이 통째로 밀린다).
  // 그 자리를 지나 내려가면 같은 슬라이더를 단 작은 막대를 화면 위에 따로 띄운다.
  const unitSeg = unitOn ? `<div class="seg seg-unit" role="group" aria-label="통화 기준">${[["KRW", "원"], ["USD", "$"]].map(([v, l]) => `<button type="button" data-unit="${v}" aria-pressed="${unit === v}" aria-label="${v === "KRW" ? "원화 기준" : "달러 기준"}">${l}</button>`).join("")}</div>` : "";
  return `<section class="range" aria-label="기간">
    <div class="range-top"><div class="seg seg-fill" role="group" aria-label="기간 빠르게 고르기">${PERIODS.map(([v, l]) => `<button type="button" data-period="${v}" aria-pressed="${win.preset === v}" ${v !== "all" && +v > span + 7 ? "disabled" : ""}>${l}</button>`).join("")}</div>${unitSeg}</div>
    <details class="range-custom" open>
      <summary class="range-summary"><span>기간 슬라이더</span><span class="range-dates"><b class="fig" data-label="from">${esc(rangeDate(w.from))}</b><span>~</span><b class="fig" data-label="to">${esc(rangeDate(w.to))}</b></span></summary>
      <div class="range-custom-controls">
        ${sliderBox(t, w)}
        <div class="range-steps" role="group" aria-label="시작일과 종료일 일주일씩 조정">
          ${[["from", "시작일"], ["to", "종료일"]].map(([end, label]) => `<div class="range-step-pair" role="group" aria-label="${label} 조정"><span>${label}</span><button type="button" data-step-end="${end}" data-step="-7" aria-label="${label} 일주일 전">−7일</button><button type="button" data-step-end="${end}" data-step="7" aria-label="${label} 일주일 후">+7일</button></div>`).join("")}
        </div>
        <details class="range-fine">
          <summary>날짜 직접 선택</summary>
          <div class="range-fine-controls">
            <div class="range-inputs" role="group" aria-label="기간 날짜 직접 선택">
              ${datePicker("from", "시작일", w.from, t[0], t.at(-1))}
              ${datePicker("to", "종료일", w.to, t[0], t.at(-1))}
            </div>
          </div>
        </details>
      </div>
    </details>
  </section>
  <div class="range-float" aria-label="기간" role="group">
    <p class="range-dates"><b class="fig" data-label="from">${esc(rangeDate(w.from))}</b><span>~</span><b class="fig" data-label="to">${esc(rangeDate(w.to))}</b></p>
    ${sliderBox(t, w)}
  </div>`;
}

function priceStatusBar() {
  const status = quoteStatus(state.model);
  const at = status.asof ? `${dateLabel(status.asof)} 수집` : "수집 이력 없음";
  const age = status.ageMinutes == null ? "" : status.ageMinutes >= 30 ? ` · 수집 후 ${status.ageMinutes < 60 ? `${status.ageMinutes}분` : `${Math.floor(status.ageMinutes / 60)}시간`} 경과` : "";
  const delayed = new Set(status.stale.map(x => x.sym));
  const failed = status.errors.filter(x => !delayed.has(x));
  const stale = status.stale.length ? (window.saFamily
    ? `<span>일부 시세 날짜 지연</span>`
    : `<details open><summary>시세 날짜 지연 ${status.stale.length}건</summary><p>${status.stale.map(x => `${esc(x.sym)}: ${esc(x.date || "가격 없음")} (기준 ${esc(x.expected || "확인 불가")})`).join(" · ")}</p></details>`) : "";
  const errors = failed.length ? (window.saFamily
    ? `<span>시세 수집 실패 ${failed.length}건</span>`
    : `<details><summary>시세 수집 실패 ${failed.length}건</summary><p>${esc(failed.join(", "))}</p></details>`) : "";
  const fx = state.model.fxStale ? `<span>환율 종가가 지연되어 달러 자산의 현재 원화 환산을 보류했습니다.</span>` : "";
  return `<aside class="price-status ${status.level}" role="status"><span>시세판 ${at}${age} · 종목별 가격일은 보유 목록에서 확인</span>${stale}${errors}${fx}</aside>`;
}

const TOP = 64; // 위 막대 높이(56) + 여유
let floatObs = null;
let floatResizeHandler = null;
let dragY = null; // 손잡이를 끄는 동안 지켜야 할 스크롤 위치
addEventListener("scroll", () => { if (dragY != null && Math.abs(scrollY - dragY) > 1) scrollTo(0, dragY); }, { passive: true });
for (const e of ["pointerup", "pointercancel", "touchend", "touchcancel"]) addEventListener(e, () => { dragY = null; });
function bindRange() {
  const t = state.model.worth?.t;
  if (!t?.length) return;
  const bar = view.querySelector(".range"), float = view.querySelector(".range-float");
  floatObs?.disconnect();
  floatObs = new IntersectionObserver(([e]) => {
    const past = !e.isIntersecting && e.boundingClientRect.top < TOP && !!bar.querySelector(".range-custom")?.open;
    if (past) fit();
    float.classList.toggle("on", past);
    float.inert = !past;
  }, { rootMargin: `-${TOP}px 0px 0px 0px` });
  floatObs.observe(bar);
  // 뜨는 막대는 제자리 막대와 같은 가로 자리·폭에 놓는다(넓은 화면의 옆 탭 막대만큼 비켜서)
  const fit = () => { const r = bar.getBoundingClientRect(); float.style.setProperty("--fl", `${r.left}px`); float.style.setProperty("--fw", `${r.width}px`); };
  if (floatResizeHandler) removeEventListener("resize", floatResizeHandler);
  floatResizeHandler = () => {
    if (!bar.isConnected) { removeEventListener("resize", floatResizeHandler); floatResizeHandler = null; return; }
    fit();
  };
  addEventListener("resize", floatResizeHandler, { passive: true });
  float.inert = true;

  const ins = end => view.querySelectorAll(`.slider input[data-end="${end}"]`);
  // 두 막대를 같은 값으로 맞춘다
  const show = (a, b) => {
    ins("from").forEach(x => { x.value = a; x.setAttribute("aria-valuetext", dayText(t[a])); });
    ins("to").forEach(x => { x.value = b; x.setAttribute("aria-valuetext", dayText(t[b])); });
    view.querySelectorAll(".slider").forEach(box => {
      box.style.setProperty("--a", `${t.length > 1 ? a / (t.length - 1) * 100 : 0}%`);
      box.style.setProperty("--b", `${t.length > 1 ? b / (t.length - 1) * 100 : 0}%`);
    });
    view.querySelectorAll('[data-date="from"]').forEach(x => { x.value = t[a]; });
    view.querySelectorAll('[data-date="to"]').forEach(x => { x.value = t[b]; });
    view.querySelectorAll('[data-date-value="from"]').forEach(x => { x.textContent = t[a].replaceAll("-", "."); });
    view.querySelectorAll('[data-date-value="to"]').forEach(x => { x.textContent = t[b].replaceAll("-", "."); });
    view.querySelectorAll('[data-label="from"]').forEach(x => { x.textContent = rangeDate(t[a]); });
    view.querySelectorAll('[data-label="to"]').forEach(x => { x.textContent = rangeDate(t[b]); });
  };
  // 손잡이를 잡는 순간 아이폰 사파리는 그 입력칸을 "보이게" 하려고 화면을 끌어올린다.
  // 끄는 동안에는 페이지가 움직일 이유가 없으니, 잡은 자리에서 벗어나면 바로 되돌린다.
  const hold = () => { dragY = scrollY; };
  const customWindow = (a, b) => {
    Object.assign(win, { preset: null, from: t[a], to: t[b] });
    show(a, b);
    view.querySelectorAll("[data-period]").forEach(x => x.setAttribute("aria-pressed", "false"));
  };
  view.querySelectorAll(".slider input").forEach(x => {
    x.addEventListener("pointerdown", hold); x.addEventListener("touchstart", hold, { passive: true });
  });
  let raf = 0;
  view.querySelectorAll(".slider input").forEach(input => input.addEventListener("input", () => {
    const box = input.closest(".slider");
    let a = +box.querySelector('[data-end="from"]').value, b = +box.querySelector('[data-end="to"]').value;
    if (a > b - 1) { if (input.dataset.end === "from") a = Math.max(0, b - 1); else b = Math.min(t.length - 1, a + 1); }
    customWindow(a, b);
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(drawTrends); // 끄는 동안 한 화면에 한 번만 다시 그린다
  }));
  // 긴 이력의 1픽셀 차이가 며칠씩 벌어지는 모바일에서 7일 단위로 조정한다.
  view.querySelectorAll("[data-step-end]").forEach(btn => btn.addEventListener("click", () => {
    const w = presetWindow(t);
    let a = t.indexOf(w.from), b = t.indexOf(w.to);
    const delta = Number(btn.dataset.step);
    if (btn.dataset.stepEnd === "from") a = Math.min(shiftDateIndexByDays(t, a, delta), Math.max(0, b - 1));
    else b = Math.max(shiftDateIndexByDays(t, b, delta), Math.min(t.length - 1, a + 1));
    customWindow(a, b);
    drawTrends();
  }));
  view.querySelectorAll("[data-date]").forEach(input => input.addEventListener("change", () => {
    const current = presetWindow(t);
    const a = view.querySelector('[data-date="from"]').value || current.from;
    const b = view.querySelector('[data-date="to"]').value || current.to;
    const w = normalizeDateRange(t, a, b, input.dataset.date);
    customWindow(w.start, w.end);
    cancelAnimationFrame(raf);
    drawTrends();
  }));
  view.querySelectorAll("[data-unit]").forEach(btn => btn.addEventListener("click", () => {
    unit = btn.dataset.unit;
    view.querySelectorAll("[data-unit]").forEach(x => x.setAttribute("aria-pressed", String(x === btn)));
    view.querySelectorAll("[data-krw]").forEach(x => { x.textContent = short(+x.dataset.krw); }); // 합계·계좌·종목 평가액
    drawTrends();
  }));
  view.querySelectorAll("[data-period]").forEach(btn => btn.addEventListener("click", () => {
    win.preset = btn.dataset.period;
    const w = presetWindow(t);
    show(t.indexOf(w.from), t.indexOf(w.to));
    view.querySelectorAll("[data-period]").forEach(x => x.setAttribute("aria-pressed", String(x === btn)));
    drawTrends();
  }));
}

// 다시 그리면 성과 칸 높이가 기간마다 달라진다(표시, 매도 목록 등). 보던 내용이 화면에서
// 움직이지 않도록, 화면 맨 위에 걸친 칸 하나를 기준으로 잡아 두었다가 그만큼 스크롤을 되돌린다.
// 아이폰 사파리는 이 보정을 브라우저가 해 주지 않는다.
function keepPlace(redraw) {
  const marks = [...view.querySelectorAll("[data-trend], [data-trend] + *, .range")];
  const below = marks.map(el => [el, el.getBoundingClientRect().top]).filter(([, y]) => y >= TOP);
  const pick = below.length ? below.reduce((p, q) => q[1] < p[1] ? q : p) : null;
  redraw();
  if (!pick || pick[1] > innerHeight || !pick[0].isConnected) return; // 바꿔 끼운 칸이 기준이었으면 위쪽은 그대로다
  const d = pick[0].getBoundingClientRect().top - pick[1];
  if (Math.abs(d) >= 1) scrollBy(0, d);
  if (dragY != null) dragY = scrollY; // 높이 보정으로 옮긴 자리가 새 기준
}

// 성과 칸 자리: 그리기는 drawTrends가 한다. key: 계좌·계좌 목록, now: {계좌: 지금 평가액}
function trend(key, now, label) {
  if (!state.model.worth?.t?.length) return `<p class="hint">투자성과와 평가액 추이는 시세 탭을 한 번 열면 계산됩니다.</p>`;
  trends.push({ key, now, label });
  return `<div class="trend" data-trend="${trends.length - 1}"></div>`;
}

// 투자손익을 나눠 보기: 판 것(실현) + 배당·이자 + 아직 들고 있는 것의 평가손익 변화. 기간 중 판 종목 목록
function realizedBlock(sum) {
  const names = state.model.names;
  const row = (label, v, note = "") => `<li><span>${label}${note ? `<small>${note}</small>` : ""}</span><b class="fig tone-${tone(v)}">${won(v)}</b></li>`;
  const sells = sum.sells.slice(0, 8);
  return `<details class="breakdown-details"><summary>투자손익 나눠 보기</summary><div class="breakdown">
    <ul class="bd">
      ${row("실현손익", sum.realized, "판 종목, 이동평균 원가")}
      ${row("배당·이자", sum.income, "세금 뺀 금액")}
      ${row("평가손익 변화", sum.unrealized, "아직 들고 있는 종목")}
    </ul>
    ${sells.length ? `<details class="sells"><summary>기간 중 매도 ${sum.sells.length}건</summary><ul>${sells.map(x =>
      `<li><span>${esc(dayText(x.d))} ${esc(names[x.sym] || x.sym)}</span><b class="fig tone-${tone(x.v)}">${won(x.v)}</b></li>`).join("")}</ul>${sum.sells.length > 8 ? `<p class="hint">최근 8건만 보여 줍니다.</p>` : ""}</details>` : `<p class="hint">이 기간에 판 종목은 없습니다.</p>`}
    ${sum.partial ? `<p class="hint">거래내역이 없는 계좌는 실현손익을 계산하지 않아 평가손익 변화에 들어 있습니다.</p>` : ""}
  </div></details>`;
}

// 금액: 고른 통화로. signed는 부호를 붙인다
const usd = () => unitOn && unit === "USD";
const full = v => usd() ? "$" + nf(0).format(Math.round(v)) : nf(0).format(Math.round(v)) + "원";
const won = v => (v > 0 ? "+" : v < 0 ? "−" : "") + full(Math.abs(v));
// 평가액 줄임 표기(1.24억원 ↔ $92.9K, 지금 환율). data-krw를 달아 두면 원/$를 바꿀 때 그 자리에서 글자만 바꾼다
// 끝날을 지난 날로 옮겼으면 그날 환율, 아니면 지금 환율
const rate = () => { const i = asOfIdx(); return i == null ? state.model.fx : viewFx(i) || state.model.fx; };
const viewFx = i => { const fx = state.model.worth?.fx || []; for (let j = i; j >= 0; j--) if (fx[j]) return fx[j]; return null; };
const short = v => usd() && rate() ? usdShort(v / rate()) : krwShort(v);
const amt = v => v == null ? "–" : `<span data-krw="${v}">${esc(short(v))}</span>`;

// 끝 손잡이가 마지막 날이 아니면 그 날의 위치(구성·종목을 그날 것으로), 마지막 날이면 null(지금 시세)
function asOfIdx() {
  const w = state.model.worth, t = w?.t;
  if (!t?.length || !w.pos) return null;
  const i = t.indexOf(presetWindow(t).to);
  return i < 0 || i === t.length - 1 ? null : i;
}
const viewAt = k => { const i = asOfIdx(); return (i != null && viewOn(k, i)) || accountView(k); };
let holds = null, holdsAt; // 지금 화면의 구성·종목을 끝날에 맞춰 다시 그리는 함수, 그린 끝날

function drawTrends() {
  const m = state.model, t = m.worth?.t;
  if (!t?.length) return;
  keepPlace(() => {
    paintTrends(m, t);
    const i = asOfIdx();
    if (holds && i !== holdsAt) { holdsAt = i; holds(); }
  });
}
function paintTrends(m, t) {
  const w = presetWindow(t);
  view.querySelectorAll("[data-trend]").forEach(el => {
    const { key, now, label } = trends[+el.dataset.trend] || {};
    if (!key) return;
    const inU = usd(), fxNow = m.fx;
    const nowU = inU ? (fxNow && now ? Object.fromEntries(Object.entries(now).map(([k, x]) => [k, x / fxNow])) : null) : now;
    const keys = Array.isArray(key) ? key : [key];
    const verifiedLive = !!nowU && livePositionsMatch(m.worth, m.accounts, keys);
    const { points, marks, sum } = worthSeries(inU ? inUsd(m.worth) : m.worth, key, w, nowU, todayKST(), { verifiedLive });
    if (!sum) { el.innerHTML = `<p class="hint">이 기간에는 평가 기록이 없습니다.</p>`; return; }
    const legend = marks.length ? `<ul class="ln-legend">${marks.map(x => `<li><i></i>${esc(dayText(x.t))} ${esc(x.label)}</li>`).join("")}</ul>` : "";
    el.innerHTML = `
      <div class="perf">
        <div><span>투자손익</span><b class="fig tone-${tone(sum.pnl)}">${won(sum.pnl)}</b></div>
        <div><span>투자수익률</span><b class="fig tone-${tone(sum.pnl)}">${sum.rate != null ? pct(sum.rate, 2) : "–"}</b></div>
      </div>
      ${line(points, { fmt: inU ? usdShort : krwShort, marks, label: `${label} 평가액과 투자원금 추이${inU ? "(달러 기준)" : ""}` })}
      <p class="ln-key"><span><i class="k-v"></i>평가액</span><span><i class="k-p"></i>투자원금(기초 + 입출금)</span></p>
      ${legend}
      ${nowU && !verifiedLive && w.to === t.at(-1) ? `<p class="hint tone-warn">최근 이력 이후 계좌의 보유 수량·현금이 달라져, 입출금을 수익으로 오인하지 않도록 추이는 마지막 확인된 기록까지만 표시합니다. 현재 평가액은 상단에 별도 표시됩니다.</p>` : ""}
      ${inU && el.dataset.trend === "0" ? `<p class="hint">달러 기준: 날마다 그날 환율로 평가액과 입출금을 달러로 바꿔 잽니다. 원화 현금·국내 종목은 환율이 오르면 달러로는 손실이고, 미국 종목의 환차익은 빠집니다.</p>` : ""}
      <p class="perf-baseline hint">${sum.from < w.from
        ? `선택 시작일 ${esc(rangeDate(w.from))}의 손익까지 포함하도록 전일 종가(${esc(rangeDate(sum.from))})를 기초로 계산합니다.`
        : `기록 시작일 ${esc(rangeDate(sum.from))} 평가액을 기초로 계산합니다.`}</p>
      <dl class="facts perf-facts">
        <div><dt>기초 평가금액 <small>${esc(dayText(sum.from))}</small></dt><dd class="fig">${full(sum.base)}</dd></div>
        <div><dt>기말 평가금액 <small>${esc(dayText(sum.to))}</small></dt><dd class="fig">${full(sum.end)}</dd></div>
        <div><dt>순 입출금</dt><dd class="fig">${won(sum.flows)}</dd></div>
        <div><dt>투자원금</dt><dd class="fig">${full(sum.principal)}</dd></div>
      </dl>
      ${sum.realized != null ? realizedBlock(sum) : ""}`;
  });
  bindLines(view);
}

function limitBlock(a, v) {
  if (!a.risk_asset_max_pct) return "";
  if (v.cashPct == null || v.rows.some(r => r.weight == null))
    return `<p class="hint tone-warn">위험자산 비중은 일부 시세·환율이 누락돼 계산 대기 중입니다.</p>`;
  const safe = a.safe_assets || {};
  const safePct = v.rows.filter(r => safe[r.h.symbol]).reduce((s, r) => s + (r.weight || 0), 0);
  const risk = Math.max(0, 100 - safePct - v.cashPct);
  const over = risk > a.risk_asset_max_pct;
  return `<div class="gauge ${over ? "over" : ""}">
    <div class="gauge-h"><span>위험자산 비중</span><b class="fig">${nf(1).format(risk)}%<small> / 한도 ${a.risk_asset_max_pct}%</small></b></div>
    <div class="gauge-bar" aria-hidden="true"><i style="width:${Math.min(100, risk)}%"></i><em style="left:${a.risk_asset_max_pct}%"></em></div>
    <p class="${over ? "tone-warn" : "hint"}">${over ? `한도를 ${nf(1).format(risk - a.risk_asset_max_pct)}%p 넘었습니다. 정리 계획대로 줄이는 중입니다.` : `한도까지 ${nf(1).format(a.risk_asset_max_pct - risk)}%p 남았습니다.`}</p>
  </div>`;
}

function goalBlock(a) {
  const h = a.goal && a.holdings.find(x => x.symbol === a.goal.symbol);
  if (!h) return "";
  const p = h.qty / a.goal.qty * 100;
  return `<div class="gauge">
    <div class="gauge-h"><span>목표 ${qtyText(a.goal.qty, h.symbol)}</span><b class="fig">${nf(1).format(p)}%<small> 모음</small></b></div>
    <div class="gauge-bar gauge-accent" aria-hidden="true"><i style="width:${Math.min(100, p)}%"></i></div>
    <p class="hint">${qtyText(Math.max(0, a.goal.qty - h.qty), h.symbol)} 남았습니다.</p>
  </div>`;
}

function holdBlock(v) {
  const { a } = v, m = state.model;
  const safe = a.safe_assets || {};
  // 종목 색은 설정 파일 순서를 따른다(비중이 바뀌어도 같은 종목은 같은 색). 현금은 회색.
  const slices = v.rows.map((r, i) => ({ key: r.h.symbol, label: m.names[r.h.symbol] || r.h.symbol, value: r.value || 0, color: SERIES[i % SERIES.length] }));
  if (v.cash > 0) slices.push({ key: "cash", label: "현금", value: v.cash, color: CASH });
  const rows = v.rows.map(({ h, q, value, pl, weight }, i) => {
    const unit = h.market === "CRYPTO" ? h.symbol : "주";
    const priceDay = v.on ? "" : q?.barDate ? `<small class="price-date">${q.invalid ? "지연 종가" : q.source === "KIS" ? "KIS 종가" : "종가"} ${esc(dayText(q.barDate))}</small>` : q?.at ? `<small class="price-date">확인 ${esc(dateLabel(q.at))}</small>` : "";
    return `<li class="hold">
      <div class="hold-top"><b><i class="sw" style="background:${slices[i].color}"></i>${esc(m.names[h.symbol] || h.symbol)}${safe[h.symbol] ? `<span class="tag">안전자산</span>` : ""}${h.leverage > 1 ? `<span class="tag">${h.leverage}배</span>` : ""}</b><span class="fig">${amt(value)}<small>${weight != null ? nf(1).format(weight) + "%" : ""}</small></span></div>
      <div class="hold-sub"><span>${qtyText(h.qty, unit)}${h.avg_price ? `, 평단 ${money(h.avg_price, h.currency)}` : ""}</span><span>${q?.price != null ? `<span class="fig">${money(q.price, h.currency)}</span>${pl != null ? ` <b class="fig tone-${tone(pl)}">${pct(pl)}</b>` : ""}${priceDay}` : "시세 없음"}</span></div>
    </li>`;
  }).join("");
  const cashText = [a.cash_krw ? money(a.cash_krw, "KRW") : null, a.cash_usd ? money(a.cash_usd, "USD") : null].filter(Boolean).join(", ");
  const cashRow = v.cashMissingFx
    ? `<li class="hold"><div class="hold-top"><b><i class="sw" style="background:${CASH}"></i>현금</b><span class="tone-warn">환율 확인 필요</span></div><div class="hold-sub"><span>${cashText}</span><span>원화 환산·비중 계산 대기</span></div></li>`
    : v.cash > 0 ? `<li class="hold"><div class="hold-top"><b><i class="sw" style="background:${CASH}"></i>현금</b><span class="fig">${amt(v.cash)}<small>${v.cashPct != null ? nf(1).format(v.cashPct) + "%" : ""}</small></span></div><div class="hold-sub"><span>${cashText}</span></div></li>` : "";
  const basis = v.mixedBasis ? "계좌별 평가 기준일이 달라 전체 금액을 합산하지 않았습니다. 개별 계좌를 선택해 확인해 주세요."
    : v.on
    ? `${dayText(v.on)} 종가로 잰 그날 보유입니다(끝 손잡이 날짜). 평단과 수익률도 그날까지의 거래로 계산한 값입니다.`
    : v.live
    ? `최근 확보한 시세로 계산했습니다${m.boardAt ? ` (시세판 ${dateLabel(m.boardAt)} 수집)` : ""}. 실시간 가격과 다를 수 있습니다.`
    : v.fallbackWorthDate ? `시세가 없거나 종가 검증에 실패해 ${esc(dayText(v.fallbackWorthDate))} 자산 이력의 평가총액을 대신 표시합니다. 일부 보유 비중은 확인할 수 없습니다.`
    : v.snap ? `시세가 없는 종목이 있어 ${dateLabel(v.snap.at)} 분석 시점 값입니다. 시세 탭을 한 번 열면 새로 수집합니다.` : "시세가 일부 없어 현재 평가총액을 계산하지 못했습니다. 시세판에서 수집을 확인해 주세요.";
  const expo = v.on ? null : v.snap?.brief.portfolio?.effective_exposure_pct;
  return `<div class="split">
      ${v.total && slices.length && v.cash != null && v.rows.every(r => r.value != null) ? donut(slices, { size: 180, center: `${v.rows.length}종목`, sub: v.cash > 0 ? "현금 포함" : "" }) : ""}
      <ul class="holds">${rows || (v.cash > 0 || v.cashMissingFx ? "" : `<li class="hint">그날은 이 계좌에 들고 있던 것이 없습니다.</li>`)}${cashRow}</ul>
    </div>
    <p class="hint">${basis}${expo ? ` 레버리지 반영 실효 노출 ${nf(1).format(expo)}%.` : ""}</p>`;
}

// 계좌 칸: 이름·평가액, 성과 추이, 목표, 보유종목 구성. 구성(data-hold)과 평가액(data-total)은 끝날을 옮기면 그 자리에서 바뀐다
// (live: 성과 추이 끝에 붙일 지금 평가액은 끝날과 상관없이 지금 값)
function accountPanel(v, color, { trendKey = null, now = undefined, live = v, context = "" } = {}) {
  const { a, key } = v;
  return `<section class="panel account" data-key="${esc(key)}">
    ${head(key === "all" ? (window.saFamily ? "공유 자산 합계" : "선택 계좌 합계") : a.label || key, `<b class="fig total">${color ? `<i class="sw" style="background:${color}"></i>` : ""}<span data-total>${amt(v.total)}</span></b>`)}
    ${context ? `<p class="account-selection" aria-label="현재 선택한 계좌">${esc(context)}</p>` : ""}
    ${a.purpose ? `<details class="purpose"><summary>${esc(a.purpose.split(/(?<=다\.)\s/)[0])}</summary><p>${esc(a.purpose)}</p></details>` : ""}
    ${trend(trendKey ?? key, now !== undefined ? now : live.live ? { [key]: live.total } : null, a.label || key)}
    ${goalBlock(a)}${limitBlock(a, live)}
    <div data-hold>${holdBlock(v)}</div>
  </section>`;
}
// 끝날이 바뀌면 칸의 평가액과 구성만 바꾼다
function refreshPanel(panel, v) {
  if (!panel || !v) return;
  panel.querySelector("[data-total]").innerHTML = amt(v.total);
  panel.querySelector("[data-hold]").innerHTML = holdBlock(v);
}

// 한 화면에서 계좌를 조합해 합계·성과·보유 내역을 확인한다.
export const renderAccounts = () => renderGroup();

const colorOf = k => SERIES[accountKeys(state.model.accounts).indexOf(k) % SERIES.length]; // 같은 계좌는 어느 탭에서나 같은 색

// 성과·평가액 추이·보유종목 구성에 포함할 계좌만 고른다. 기본은 주 계좌와 바이오.
const compared = new Set();
let comparedReady = false;
let comparedFamily = null;
const COMPARE_ORDER = ["main", "bio", "pension", "crypto"];
function compareKeys() {
  const keys = COMPARE_ORDER.filter(k => state.model.accounts[k]?.holdings);
  if (window.saFamily) return keys.filter(k => k === "main" || k === "crypto");
  return keys;
}
function selectedKeys() {
  const keys = compareKeys();
  if (!comparedReady || comparedFamily !== !!window.saFamily) {
    comparedReady = true;
    comparedFamily = !!window.saFamily;
    compared.clear();
    for (const k of (window.saFamily ? ["main", "crypto"] : ["main", "bio"])) if (keys.includes(k)) compared.add(k);
  }
  for (const k of [...compared]) if (!keys.includes(k)) compared.delete(k);
  if (!compared.size && keys.length) compared.add(keys[0]);
  return keys.filter(k => compared.has(k));
}

// 추이를 무엇으로 계산했는지: 거래내역이 있는 계좌는 그 기간, 나머지는 계좌 설정 변경 기록부터
const topic = w => w + ((w.charCodeAt(w.length - 1) - 0xac00) % 28 ? "은" : "는"); // 받침에 따라 은·는

function worthNote(keys) {
  const w = state.model.worth;
  if (!w?.t?.length) return "";
  const md = d => d.slice(2).replaceAll("-", ".");
  const traded = keys.filter(k => w.trades?.[k]);
  const first = k => w.t[(w.v[k] || []).findIndex(v => v != null)];
  const rest = keys.filter(k => !traded.includes(k) && first(k));
  return `<p class="hint foot">${[
    ...traded.map(k => `${esc(topic(accountShort(k)))} 증권사 거래내역(${md(w.trades[k].from)}~${md(w.trades[k].through)}, 원·달러 예수금과 RP 포함)`),
    rest.length ? `${esc(topic(rest.map(k => accountShort(k)).join("·")))} 계좌 설정 변경 기록(${md(first(rest[0]))}부터)` : "",
  ].filter(Boolean).join(", ")}으로 그날 종가에 맞춰 다시 계산합니다. 투자손익 = 기말 − 기초 − 순 입출금, 투자수익률 = 투자손익 ÷ 투자원금(기초 + 순 입출금). 순 입출금은 거래내역의 이체·충전·출금과 주식 대체(그날 종가), 계좌 설정이 바뀐 날은 그날 종가로 잰 차이입니다.</p>`;
}

// 가족 보기는 주 계좌와 코인만 한 화면에(바이오·퇴직연금은 보이지 않게)
function renderGroup() {
  const fam = !!window.saFamily;
  const options = compareKeys();
  let keys = selectedKeys();
  if (!keys.length) { view.innerHTML = `<p class="none">계좌가 설정 파일(config/accounts.json)에 없습니다.</p>`; return; }
  const color = Object.fromEntries(options.map(k => [k, colorOf(k)]));
  let live = keys.map(accountView); // 지금 시세(성과 추이 끝의 '지금' 점)
  let nowAll = Object.fromEntries(live.filter(v => v.live).map(v => [v.key, v.total]));
  // 끝날의 구성: 끝 손잡이가 마지막 날이면 지금, 아니면 그날
  const views = () => keys.map(viewAt);
  const selectedView = (vs = views()) => keys.length === 1 ? vs[0] : mergedView(vs);
  // 단일 계좌면 해당 계좌의 목표·위험자산 한도까지, 복수면 통합 성과를 한 칸에 표시한다.
  const panelOf = () => keys.length === 1
    ? accountPanel(selectedView(), color[keys[0]], { live: live[0] })
    : accountPanel(selectedView(), null, { trendKey: keys, now: nowAll, live: mergedView(live), context: keys.map(accountShort).join(" · ") });
  trends = [];
  view.innerHTML = `
    ${fam ? `<aside class="family-banner"><b>공유용 표시 모드</b><span>주 계좌·비트코인만 화면에 표시합니다. 별도의 데이터 접근 권한을 제공하는 공유 링크는 아닙니다.</span><a href="./?view=all">개인 보기 전환</a></aside>` : ""}
    ${priceStatusBar()}
    <div class="account-filter" role="group" aria-label="합계와 추이에 포함할 계좌">
      <span class="account-filter-title">포함할 계좌</span>
      <div class="compare-picks">${options.map(k => `<button type="button" class="compare-pick" data-compare-key="${k}" aria-pressed="${compared.has(k)}"><i style="background:${color[k]}"></i>${esc(accountShort(k))}</button>`).join("")}</div>
    </div>
    ${rangeBox({ units: true })}
    <div class="accounts">
      ${panelOf()}
    </div>
    ${worthNote(keys)}`;
  // 포함 계좌를 바꿀 때는 성과 칸만 갱신한다. 기간 조작 상태와 스크롤을 유지한다.
  view.querySelectorAll("[data-compare-key]").forEach(button => button.addEventListener("click", () => {
    const k = button.dataset.compareKey;
    if (compared.has(k)) { if (compared.size === 1) return; compared.delete(k); }
    else compared.add(k);
    keys = selectedKeys();
    live = keys.map(accountView);
    nowAll = Object.fromEntries(live.filter(v => v.live).map(v => [v.key, v.total]));
    view.querySelectorAll("[data-compare-key]").forEach(x => x.setAttribute("aria-pressed", String(compared.has(x.dataset.compareKey))));
    keepPlace(() => {
      const panel = view.querySelector(".accounts > .panel.account");
      trends = [];
      panel.insertAdjacentHTML("afterend", panelOf());
      panel.remove();
      const foot = view.querySelector(".foot");
      if (foot) foot.outerHTML = worthNote(keys);
      if (state.model.worth?.t?.length) paintTrends(state.model, state.model.worth.t);
    });
  }));
  // 끝 손잡이를 옮기면 선택 계좌의 평가액·종목도 그날 것으로 변경한다.
  holds = () => {
    refreshPanel(view.querySelector(".accounts > .panel.account"), selectedView());
  };
  holdsAt = asOfIdx();
  bindRange();
  drawTrends();
}

/* ---------- 관심가: 종목마다 가격선을 높은 값부터 세우고 그 사이에 현재가를 끼운다 ---------- */
let levelAcct = "all";

function ladder(it, q) {
  const cur = it.currency;
  // 설명이 긴 선은 두 줄만 보이고, 누르면 다 펼쳐진다
  const rungs = it.prices.map(p => {
    // 판단에서 자동으로 걸린 관심가(id가 plan-)는 설명이 모두 같은 문장이라 뺀다
    const memo = String(p.id).startsWith("plan-") ? "" : levelNote(p.msg);
    const row = `<span class="rung-k">${esc(levelLabel(p.msg))}</span>
      <b class="fig">${money(p.price, cur)}</b>
      <span class="rung-d">${p.fired ? `${esc(p.fired.slice(5).replace("-", "/"))} 닿음` : q?.price ? distText((p.price / q.price - 1) * 100) : ""}</span>`;
    return { price: p.price, html: memo
      ? `<li><details class="rung ${p.fired ? "done" : ""}"><summary>${row}<p>${esc(memo)}</p></summary></details></li>`
      : `<li class="rung ${p.fired ? "done" : ""}">${row}</li>` };
  });
  if (q?.price) rungs.push({ price: q.price, html: `<li class="rung now"><span class="rung-k">현재가</span><b class="fig">${money(q.price, cur)}</b><span class="rung-d">${q.chg != null ? `<span class="fig tone-${tone(q.chg)}">${pct(q.chg, 2)}</span>` : ""}</span></li>` });
  return `<ol class="ladder">${rungs.sort((a, b) => b.price - a.price).map(r => r.html).join("")}</ol>`;
}

function levelCard(it, today) {
  const q = state.model.quotes[it.code];
  const current = q?.invalid ? null : q;
  const sell = it.plan && it.hold != null && it.keep != null && it.keep < it.hold;
  return `<section class="panel level">
    ${head(it.name, `<span class="hint">${esc(it.code)}</span>`)}
    ${sell ? `<p class="lede">${nf(0).format(it.hold)}주에서 ${it.keep ? `${nf(0).format(it.keep)}주까지` : "전부"} 줄이는 계획</p>` : ""}
    ${it.prices.length ? ladder(it, current) : ""}
    ${it.dates.length ? `<ul class="dates">${it.dates.map(d => `<li class="${d.fired ? "done" : d.date <= today ? "due" : ""}">
      <span class="dday fig">${d.fired ? "알림" : dday(d.date, today)}</span>
      <span class="dates-main"><b>${esc(d.date.slice(5).replace("-", "/"))} ${esc(levelLabel(d.msg))}</b><p>${esc(levelNote(d.msg))}</p></span>
    </li>`).join("")}</ul>` : ""}
    ${!current?.price && it.prices.length ? `<p class="hint">${q?.invalid ? `시세 날짜가 지연되어 종가 ${esc(q.barDate || "미확인")} 기준의 관심가 거리는 숨겼습니다.` : "현재가가 없어 거리를 계산하지 못했습니다."} 새로 불러오기로 다시 확인해 주세요.</p>` : ""}
  </section>`;
}

export function renderLevels(focusCode = "") {
  const m = state.model;
  const items = focusCode ? levelItems().filter(it => it.code === focusCode) : levelItems();
  const keys = ACCOUNT_ORDER.filter(k => items.some(it => it.account === k));
  if (levelAcct !== "all" && !keys.includes(levelAcct)) levelAcct = "all";
  const today = todayKST();
  const shown = keys.filter(k => levelAcct === "all" || k === levelAcct);
  view.innerHTML = `
    ${subtabs(MARKET_TABS, "levels")}
    ${focusCode ? `<a class="back" href="#/market/levels">${icon("back")}전체 관심가 보기</a>` : ""}
    <p class="lede">가격이나 날짜에 닿으면 GitHub 이슈로 알림이 옵니다.${m.alertState?.checked_at ? ` 마지막 점검 ${dateLabel(new Date(m.alertState.checked_at))}.` : ""}</p>
    ${chips([["all", "전체"], ...keys.map(k => [k, accountShort(k)])], levelAcct, "계좌")}
    ${shown.map(k => `<section class="group"><h2>${esc(accountLabel(k))}</h2><div class="cards">${items.filter(it => it.account === k).map(it => levelCard(it, today)).join("")}</div></section>`).join("")
      || `<p class="none">${focusCode ? `${esc(focusCode)}의 관심가가 없습니다.` : "걸어 둔 관심가가 없습니다."}</p>`}
    ${m.alerts?.proceeds ? `<p class="hint foot">${esc(m.alerts.proceeds)}</p>` : ""}`;
  bindChips(v => { levelAcct = v; renderLevels(); });
}

/* ---------- ETF 구성 감시 ---------- */
function parseRebalLog(md) {
  const sec = md.split(/^## 리밸런싱 일지.*$/m)[1] || "";
  return sec.split(/^### /m).slice(1).map(chunk => {
    const [h, ...rest] = chunk.split("\n");
    const groups = rest.filter(l => l.startsWith("- **")).map(l => {
      const m = l.match(/^- \*\*([^*]+)\*\* \((\d+)\): (.*)$/);
      if (!m) return null;
      const items = m[3].split("; ").map(t => {
        const x = t.match(/^(.*) \(([^)]+?)(?: US| KS)?\) ([\d.]+)% → ([\d.]+)%$/);
        return x ? { name: x[1], tick: x[2], from: +x[3], to: +x[4] } : { name: t };
      });
      return { kind: m[1], items };
    }).filter(Boolean);
    return { date: h.match(/^(\d{4}-\d{2}-\d{2})/)?.[1], turnover: h.match(/회전율 ([\d.]+)%/)?.[1], count: h.match(/종목 수 (\d+→\d+)/)?.[1], idx: h.match(/지수 노출 ([\d.]+→[\d.]+%)/)?.[1], groups };
  });
}
const KIND = { "신규 편입": "in", "전량 편출": "out", "비중 확대": "in", "비중 축소": "out" };
let etfAll = false;
export async function renderEtf() {
  view.innerHTML = `${subtabs(MARKET_TABS, "etf")}<p class="none">불러오는 중…</p>`;
  const repo = state.repo;
  const code = repo.list("etfwatch/reports/").map(p => p.match(/(\w+)\.md$/)?.[1]).find(c => c && !c.includes("_")) || "426020";
  const [md, ev] = await Promise.all([
    repo.text(`etfwatch/reports/${code}.md`).catch(() => null),
    repo.text(`etfwatch/reports/${code}_eval.md`).catch(() => null),
  ]);
  if (!view.querySelector('.seg [aria-current][href="#/market/etf"]')) return; // 불러오는 사이 다른 화면으로 넘어감
  if (!md) { view.innerHTML = `${subtabs(MARKET_TABS, "etf")}<p class="none">감시 리포트가 없습니다.</p>`; return; }
  const title = md.match(/^# (.*)$/m)?.[1]?.replace(/ 구성 변경 이력$/, "") || code;
  const dataLine = md.match(/^- 데이터: (.*)$/m)?.[1] || "";
  const log = parseRebalLog(md);
  const shown = etfAll ? log : log.slice(0, 6);
  const evPeriods = ev ? (ev.split(/^## 기간별.*$/m)[1] || "").split(/^## /m)[0] : "";
  const evSummary = ev ? (ev.match(/^- 리밸런싱 \d+회.*$/gm) || []) : [];
  view.innerHTML = `
    ${subtabs(MARKET_TABS, "etf")}
    <header class="worth"><span>${esc(dataLine)}</span><b>${esc(title)}</b></header>
    <p class="lede">하루 회전율이 4%를 넘거나 큰 종목 교체가 3건 이상이면 GitHub 이슈로 알립니다.</p>
    <div class="etf">
      <section class="panel">
        ${head("리밸런싱 일지", `<span class="hint">${log.length}회, 최근 순</span>`)}
        <ol class="rebal">${shown.map(e => `<li>
          <div class="rebal-h"><b class="fig">${esc(e.date)}</b><span class="hint">회전율 ${esc(e.turnover)}%, 종목 ${esc(e.count)}, 지수 노출 ${esc(e.idx)}</span></div>
          ${e.groups.map(g => `<div class="rebal-g"><span class="tone-${KIND[g.kind] === "in" ? "up" : KIND[g.kind] === "out" ? "down" : "flat"}">${esc(g.kind)}</span><span>${g.items.map(it => it.tick
            ? `<span class="pill" title="${esc(it.name)}"><b>${esc(it.tick)}</b> ${nf(2).format(it.from)}→${nf(2).format(it.to)}%</span>`
            : `<span class="pill">${esc(it.name)}</span>`).join("")}</span></div>`).join("")}
        </li>`).join("")}</ol>
        ${log.length > 6 ? `<button class="btn btn-ghost" type="button" id="etf-more">${etfAll ? "최근 6회만 보기" : `나머지 ${log.length - 6}회 더 보기`}</button>` : ""}
      </section>
      ${ev ? `<section class="panel">
        ${head("매매 사후 평가")}
        ${evSummary.length ? `<ul class="plain">${evSummary.map(l => `<li>${inline(l.replace(/^- /, ""))}</li>`).join("")}</ul>` : ""}
        <div class="md">${markdown(evPeriods)}</div>
        <p class="hint">매매 효과 = 실제 보유 수익 − 첫날 보유를 그대로 둔 수익.</p>
      </section>` : ""}
    </div>`;
  document.getElementById("etf-more")?.addEventListener("click", () => { etfAll = !etfAll; renderEtf(); });
}
