// 자산: 계좌(보유·비중·손익), 관심가(가격선 사다리·날짜), ETF 구성 감시.
import { ACCOUNT_ORDER, state, accountKeys, accountGroup, accountLabel, accountShort, accountView, viewOn, inUsd, levelItems, levelLabel, levelNote, todayKST, worthSeries } from "./store.js";
import { SERIES, CASH, donut, line, bindLines, dayText } from "./chart.js";
import { inline, markdown } from "./md.js";
import { view, esc, money, nf, pct, tone, dateLabel, dday, distText, krwShort, usdShort, qtyText, head, subtabs, chips, bindChips } from "./ui.js";

const TABS = [["#/assets", "계좌", "accounts"], ["#/assets/long", "연금·코인", "long"], ["#/assets/levels", "관심가", "levels"], ["#/assets/etf", "ETF", "etf"]];

/* ---------- 계좌: 위에 기간(버튼·슬라이더), 투자성과와 평가액 추이, 계좌 구성 도넛, 고른 계좌의 성과·종목 구성 ---------- */
const picked = {}; // 묶음(계좌·연금·코인)마다 고른 계좌
const PERIODS = [["7", "1주"], ["30", "1개월"], ["90", "3개월"], ["365", "1년"], ["all", "전체"]];
// 고른 기간: preset을 누르면 끝은 마지막 날, 슬라이더를 움직이면 preset이 풀린다. 날짜는 worth.t의 값
const win = { preset: "365", from: null, to: null };
let unit = "KRW"; // 계좌 탭의 성과를 원화로 볼지 달러로 볼지
let unitOn = false; // 지금 화면이 원/달러 고르기를 쓰는지(계좌 탭만)
let trends = []; // 지금 화면에 그린 성과 칸들 [{key, now, label}]: 기간을 바꾸면 이것만 다시 그린다

function presetWindow(t) {
  if (win.preset === "all") return { from: t[0], to: t.at(-1) };
  if (!win.preset) return { from: win.from || t[0], to: win.to || t.at(-1) };
  const from = new Date(Date.parse(t.at(-1)) - +win.preset * 86400000).toISOString().slice(0, 10);
  return { from: t.find(d => d >= from) || t[0], to: t.at(-1) };
}

// 기간 고르기: 버튼(1주~전체)과 시작·끝 손잡이 두 개짜리 슬라이더. 화면 위에 하나, 아래 모든 성과 칸에 같이 쓴다
// 손잡이 두 개 슬라이더. 제자리 막대와 위에 뜨는 막대가 같은 모양을 쓴다
function sliderBox(t, w) {
  const at = d => t.indexOf(d) / (t.length - 1) * 100;
  return `<div class="slider" style="--a:${at(w.from)}%;--b:${at(w.to)}%">
      <span class="slider-track" aria-hidden="true"><i></i></span>
      <input type="range" data-end="from" min="0" max="${t.length - 1}" value="${t.indexOf(w.from)}" aria-label="시작일">
      <input type="range" data-end="to" min="0" max="${t.length - 1}" value="${t.indexOf(w.to)}" aria-label="끝일">
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
    ${sliderBox(t, w)}
    <p class="range-dates"><b class="fig" data-label="from">${esc(dayText(w.from))}</b><span>부터</span><b class="fig" data-label="to">${esc(dayText(w.to))}</b><span>까지</span></p>
  </section>
  <div class="range-float" aria-label="기간" role="group">
    <p class="range-dates"><b class="fig" data-label="from">${esc(dayText(w.from))}</b><span>~</span><b class="fig" data-label="to">${esc(dayText(w.to))}</b></p>
    ${sliderBox(t, w)}
  </div>`;
}

const TOP = 64; // 위 막대 높이(56) + 여유
let floatObs = null;
let dragY = null; // 손잡이를 끄는 동안 지켜야 할 스크롤 위치
addEventListener("scroll", () => { if (dragY != null && Math.abs(scrollY - dragY) > 1) scrollTo(0, dragY); }, { passive: true });
for (const e of ["pointerup", "pointercancel", "touchend", "touchcancel"]) addEventListener(e, () => { dragY = null; });
function bindRange() {
  const t = state.model.worth?.t;
  if (!t?.length) return;
  const bar = view.querySelector(".range"), float = view.querySelector(".range-float");
  floatObs?.disconnect();
  floatObs = new IntersectionObserver(([e]) => {
    const past = !e.isIntersecting && e.boundingClientRect.top < TOP;
    if (past) fit();
    float.classList.toggle("on", past);
    float.inert = !past;
  }, { rootMargin: `-${TOP}px 0px 0px 0px` });
  floatObs.observe(bar);
  // 뜨는 막대는 제자리 막대와 같은 가로 자리·폭에 놓는다(넓은 화면의 옆 탭 막대만큼 비켜서)
  const fit = () => { const r = bar.getBoundingClientRect(); float.style.setProperty("--fl", `${r.left}px`); float.style.setProperty("--fw", `${r.width}px`); };
  onresize = fit;
  float.inert = true;

  const ins = end => view.querySelectorAll(`.slider input[data-end="${end}"]`);
  // 두 막대를 같은 값으로 맞춘다
  const show = (a, b) => {
    ins("from").forEach(x => { x.value = a; });
    ins("to").forEach(x => { x.value = b; });
    view.querySelectorAll(".slider").forEach(box => {
      box.style.setProperty("--a", `${a / (t.length - 1) * 100}%`);
      box.style.setProperty("--b", `${b / (t.length - 1) * 100}%`);
    });
    view.querySelectorAll('[data-label="from"]').forEach(x => { x.textContent = dayText(t[a]); });
    view.querySelectorAll('[data-label="to"]').forEach(x => { x.textContent = dayText(t[b]); });
  };
  // 손잡이를 잡는 순간 아이폰 사파리는 그 입력칸을 "보이게" 하려고 화면을 끌어올린다.
  // 끄는 동안에는 페이지가 움직일 이유가 없으니, 잡은 자리에서 벗어나면 바로 되돌린다.
  const hold = () => { dragY = scrollY; };
  view.querySelectorAll(".slider input").forEach(x => {
    x.addEventListener("pointerdown", hold); x.addEventListener("touchstart", hold, { passive: true });
  });
  let raf = 0;
  view.querySelectorAll(".slider input").forEach(input => input.addEventListener("input", () => {
    const box = input.closest(".slider");
    let a = +box.querySelector('[data-end="from"]').value, b = +box.querySelector('[data-end="to"]').value;
    if (a > b - 1) { if (input.dataset.end === "from") a = Math.max(0, b - 1); else b = Math.min(t.length - 1, a + 1); }
    Object.assign(win, { preset: null, from: t[a], to: t[b] });
    show(a, b);
    view.querySelectorAll("[data-period]").forEach(x => x.setAttribute("aria-pressed", "false"));
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(drawTrends); // 끄는 동안 한 화면에 한 번만 다시 그린다
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
  return `<div class="breakdown">
    <h3>투자손익 나눠 보기</h3>
    <ul class="bd">
      ${row("실현손익", sum.realized, "판 종목, 이동평균 원가")}
      ${row("배당·이자", sum.income, "세금 뺀 금액")}
      ${row("평가손익 변화", sum.unrealized, "아직 들고 있는 종목")}
    </ul>
    ${sells.length ? `<details class="sells"><summary>기간 중 매도 ${sum.sells.length}건</summary><ul>${sells.map(x =>
      `<li><span>${esc(dayText(x.d))} ${esc(names[x.sym] || x.sym)}</span><b class="fig tone-${tone(x.v)}">${won(x.v)}</b></li>`).join("")}</ul>${sum.sells.length > 8 ? `<p class="hint">최근 8건만 보여 줍니다.</p>` : ""}</details>` : `<p class="hint">이 기간에 판 종목은 없습니다.</p>`}
    ${sum.partial ? `<p class="hint">거래내역이 없는 계좌는 실현손익을 계산하지 않아 평가손익 변화에 들어 있습니다.</p>` : ""}
  </div>`;
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
  const i = t.indexOf(win.to);
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
    const { points, marks, sum } = worthSeries(inU ? inUsd(m.worth) : m.worth, key, w, nowU);
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
      ${inU && el.dataset.trend === "0" ? `<p class="hint">달러 기준: 날마다 그날 환율로 평가액과 입출금을 달러로 바꿔 잽니다. 원화 현금·국내 종목은 환율이 오르면 달러로는 손실이고, 미국 종목의 환차익은 빠집니다.</p>` : ""}
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
  if (!a.risk_asset_max_pct || v.cashPct == null) return "";
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
    return `<li class="hold">
      <div class="hold-top"><b><i class="sw" style="background:${slices[i].color}"></i>${esc(m.names[h.symbol] || h.symbol)}${safe[h.symbol] ? `<span class="tag">안전자산</span>` : ""}${h.leverage > 1 ? `<span class="tag">${h.leverage}배</span>` : ""}</b><span class="fig">${amt(value)}<small>${weight != null ? nf(1).format(weight) + "%" : ""}</small></span></div>
      <div class="hold-sub"><span>${qtyText(h.qty, unit)}${h.avg_price ? `, 평단 ${money(h.avg_price, h.currency)}` : ""}</span><span>${q?.price != null ? `<span class="fig">${money(q.price, h.currency)}</span>${pl != null ? ` <b class="fig tone-${tone(pl)}">${pct(pl)}</b>` : ""}` : "시세 없음"}</span></div>
    </li>`;
  }).join("");
  const cashText = [a.cash_krw ? money(a.cash_krw, "KRW") : null, a.cash_usd ? money(a.cash_usd, "USD") : null].filter(Boolean).join(", ");
  const cashRow = v.cash > 0 ? `<li class="hold"><div class="hold-top"><b><i class="sw" style="background:${CASH}"></i>현금</b><span class="fig">${amt(v.cash)}<small>${v.cashPct != null ? nf(1).format(v.cashPct) + "%" : ""}</small></span></div><div class="hold-sub"><span>${cashText}</span></div></li>` : "";
  const basis = v.on
    ? `${dayText(v.on)} 종가로 잰 그날 보유입니다(끝 손잡이 날짜). 평단과 수익률도 그날까지의 거래로 계산한 값입니다.`
    : v.live
    ? `지금 시세로 계산했습니다${m.boardAt ? ` (시세판 ${dateLabel(m.boardAt)} 수집)` : ""}.`
    : v.snap ? `시세가 없는 종목이 있어 ${dateLabel(v.snap.at)} 분석 시점 값입니다. 시세 탭을 한 번 열면 새로 수집합니다.` : "시세가 없는 종목이 있고 불러온 최근 판단에 이 계좌 분석이 없어 평가액을 계산하지 못했습니다. 시세 탭을 한 번 열면 새로 수집합니다.";
  const expo = v.on ? null : v.snap?.brief.portfolio?.effective_exposure_pct;
  return `<div class="split">
      ${v.total && slices.length > 1 ? donut(slices, { size: 132, center: `${v.rows.length}종목`, sub: v.cash > 0 ? "현금 포함" : "" }) : ""}
      <ul class="holds">${rows || (v.cash > 0 ? "" : `<li class="hint">그날은 이 계좌에 들고 있던 것이 없습니다.</li>`)}${cashRow}</ul>
    </div>
    <p class="hint">${basis}${expo ? ` 레버리지 반영 실효 노출 ${nf(1).format(expo)}%.` : ""}</p>`;
}

// 계좌 칸: 이름·평가액, 성과 추이, 목표, 구성. 구성(data-hold)과 평가액(data-total)은 끝날을 옮기면 그 자리에서 바뀐다
// (live: 성과 추이 끝에 붙일 지금 평가액은 끝날과 상관없이 지금 값)
function accountPanel(v, color, { trendKey = null, now = undefined, live = v } = {}) {
  const { a, key } = v;
  return `<section class="panel account" data-key="${esc(key)}">
    ${head(a.label || key, `<b class="fig total">${color ? `<i class="sw" style="background:${color}"></i>` : ""}<span data-total>${amt(v.total)}</span></b>`)}
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

// 계좌 탭은 바로 쓸 수 있는 돈(주 계좌·바이오)의 합계와 구성. 연금·코인 탭은 합계 없이 계좌마다 따로.
export const renderAccounts = () => renderGroup();

const colorOf = k => SERIES[accountKeys(state.model.accounts).indexOf(k) % SERIES.length]; // 같은 계좌는 어느 탭에서나 같은 색

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

export function renderLongTerm() {
  const keys = accountGroup(state.model.accounts, true);
  trends = [];
  view.innerHTML = `
    ${subtabs(TABS, "long")}
    ${keys.length ? `${rangeBox({ units: true })}<div class="cards">${keys.map(k => accountPanel(viewAt(k), colorOf(k), { live: accountView(k) })).join("")}</div>
    <p class="hint foot">바로 쓸 돈이 아니라서 계좌 탭의 전체 합계에는 넣지 않습니다.</p>${worthNote(keys)}` : `<p class="none">퇴직연금·크립토 계좌가 설정 파일(config/accounts.json)에 없습니다.</p>`}`;
  holds = () => keys.forEach(k => refreshPanel(view.querySelector(`.panel.account[data-key="${CSS.escape(k)}"]`), viewAt(k)));
  holdsAt = asOfIdx();
  bindRange();
  drawTrends();
}

// 전체: 계좌들의 종목을 종목마다 합친다(수량·평가액은 더하고, 평단은 수량 가중). 현금도 합친다.
function mergedView(views) {
  const by = new Map();
  for (const v of views) for (const r of v.rows) {
    const x = by.get(r.h.symbol);
    const cost = r.h.avg_price ? r.h.avg_price * r.h.qty : null;
    if (!x) { by.set(r.h.symbol, { h: { ...r.h }, q: r.q, value: r.value, cost }); continue; }
    x.h.qty += r.h.qty;
    x.value = x.value != null && r.value != null ? x.value + r.value : null;
    x.cost = x.cost != null && cost != null ? x.cost + cost : null;
  }
  const total = views.every(v => v.total != null) ? views.reduce((s, v) => s + v.total, 0) : null;
  const cash = views.reduce((s, v) => s + (v.cash || 0), 0);
  const rows = [...by.values()].map(({ h, q, value, cost }) => {
    h.avg_price = cost != null && h.qty ? cost / h.qty : null;
    return { h, q, value, pl: q?.price && h.avg_price ? (q.price / h.avg_price - 1) * 100 : null, weight: total && value != null ? value / total * 100 : null };
  });
  const sum = f => views.reduce((s, v) => s + (v.a[f] || 0), 0);
  const a = { label: "전체 계좌", holdings: rows.map(r => r.h), cash_krw: sum("cash_krw"), cash_usd: sum("cash_usd") };
  return { key: "all", a, rows, cash, total, live: views.every(v => v.live), cashPct: total ? cash / total * 100 : null, snap: null, on: views.find(v => v.on)?.on };
}

function renderGroup() {
  const tab = "accounts";
  const keys = accountGroup(state.model.accounts, false);
  if (!keys.length) { view.innerHTML = `${subtabs(TABS, tab)}<p class="none">이 묶음의 계좌가 설정 파일(config/accounts.json)에 없습니다.</p>`; return; }
  if (picked[tab] !== "all" && !keys.includes(picked[tab])) picked[tab] = "all";
  const cur = picked[tab];
  const color = Object.fromEntries(keys.map(k => [k, colorOf(k)]));
  const live = keys.map(accountView); // 지금 시세(성과 추이 끝의 '지금' 점)
  const nowAll = Object.fromEntries(live.filter(v => v.live).map(v => [v.key, v.total]));
  // 끝날의 구성: 끝 손잡이가 마지막 날이면 지금, 아니면 그날
  const views = () => keys.map(viewAt);
  const viewOf = (k, vs = views()) => k === "all" ? mergedView(vs) : vs.find(v => v.key === k);
  // 고른 계좌 칸: 전체는 계좌를 합친 성과·종목, 아니면 그 계좌
  const panelOf = k => k === "all"
    ? accountPanel(viewOf(k), null, { trendKey: keys, now: nowAll, live: mergedView(live) })
    : accountPanel(viewOf(k), color[k], { live: live.find(v => v.key === k) });
  // 계좌 구성(도넛·고르기 단추)
  const comp = vs => {
    const all = mergedView(vs).total, on = vs.find(v => v.on)?.on;
    return `${head("계좌 구성", `<span class="hint">${on ? `${esc(dayText(on))} 기준` : "눌러서 계좌 보기"}</span>`)}
          <div class="split">
            ${all ? donut(vs.map(v => ({ key: v.key, label: accountShort(v.key), value: v.total || 0, color: color[v.key] })), { center: short(all), krw: all, sub: `${vs.length}개 계좌`, picked: picked[tab] }) : ""}
            <div class="picker" role="group" aria-label="계좌"><button type="button" data-acc="all" aria-pressed="${picked[tab] === "all"}">
              <i class="sw sw-all" aria-hidden="true"></i><span>전체</span><b class="fig">${amt(all)}</b><small></small>
            </button>${vs.map(v => `<button type="button" data-acc="${esc(v.key)}" aria-pressed="${v.key === picked[tab]}">
              <i class="sw" style="background:${color[v.key]}"></i><span>${esc(accountShort(v.key))}</span><b class="fig">${amt(v.total)}</b><small class="fig">${all && v.total != null ? nf(0).format(v.total / all * 100) + "%" : ""}</small>
            </button>`).join("")}</div>
          </div>`;
  };
  trends = [];
  view.innerHTML = `
    ${subtabs(TABS, tab)}
    ${rangeBox({ units: true })}
    <div class="accounts">
      <div class="col">
        <section class="panel" data-comp>${comp(views())}</section>
      </div>
      ${panelOf(cur)}
    </div>
    ${worthNote(keys)}`;
  // 계좌를 고르면 아래 계좌 칸만 바꿔 끼운다. 화면 전체를 다시 그리면 그리는 사이 페이지가 잠깐 짧아져
  // 아이폰 사파리가 스크롤을 맨 위쪽으로 끌어올린다. 도넛 조각을 눌러도 같다.
  const pick = k => {
    if ((k !== "all" && !keys.includes(k)) || k === picked[tab]) return;
    picked[tab] = k;
    view.querySelectorAll("[data-acc]").forEach(x => x.setAttribute("aria-pressed", String(x.dataset.acc === k)));
    view.querySelectorAll(".donut circle[data-key]").forEach(c => c.classList.toggle("on", c.dataset.key === k));
    const t = state.model.worth?.t;
    keepPlace(() => {
      const panel = view.querySelector(".accounts > .panel.account");
      trends = []; // 성과 칸은 고른 계좌 칸 하나뿐
      panel.insertAdjacentHTML("afterend", panelOf(k));
      panel.remove();
      if (t?.length) paintTrends(state.model, t);
    });
  };
  const bindComp = () => {
    view.querySelectorAll("[data-acc]").forEach(b => b.addEventListener("click", () => pick(b.dataset.acc)));
    view.querySelectorAll("[data-comp] .donut circle[data-key]").forEach(c => {
      if (!keys.includes(c.dataset.key)) return;
      c.classList.add("pickable");
      c.addEventListener("click", () => pick(c.dataset.key));
    });
  };
  bindComp();
  // 끝 손잡이를 옮기면 계좌 구성과 고른 계좌의 평가액·종목을 그날 것으로
  holds = () => {
    const vs = views();
    view.querySelector("[data-comp]").innerHTML = comp(vs);
    bindComp();
    refreshPanel(view.querySelector(".accounts > .panel.account"), viewOf(picked[tab], vs));
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
  const sell = it.plan && it.hold != null && it.keep != null && it.keep < it.hold;
  return `<section class="panel level">
    ${head(it.name, `<span class="hint">${esc(it.code)}</span>`)}
    ${sell ? `<p class="lede">${nf(0).format(it.hold)}주에서 ${it.keep ? `${nf(0).format(it.keep)}주까지` : "전부"} 줄이는 계획</p>` : ""}
    ${it.prices.length ? ladder(it, q) : ""}
    ${it.dates.length ? `<ul class="dates">${it.dates.map(d => `<li class="${d.fired ? "done" : d.date <= today ? "due" : ""}">
      <span class="dday fig">${d.fired ? "알림" : dday(d.date, today)}</span>
      <span class="dates-main"><b>${esc(d.date.slice(5).replace("-", "/"))} ${esc(levelLabel(d.msg))}</b><p>${esc(levelNote(d.msg))}</p></span>
    </li>`).join("")}</ul>` : ""}
    ${!q?.price && it.prices.length ? `<p class="hint">현재가가 없어 거리를 계산하지 못했습니다. 시세 탭을 한 번 열면 새로 수집합니다.</p>` : ""}
  </section>`;
}

export function renderLevels() {
  const m = state.model;
  const items = levelItems();
  const keys = ACCOUNT_ORDER.filter(k => items.some(it => it.account === k));
  if (levelAcct !== "all" && !keys.includes(levelAcct)) levelAcct = "all";
  const today = todayKST();
  const shown = keys.filter(k => levelAcct === "all" || k === levelAcct);
  view.innerHTML = `
    ${subtabs(TABS, "levels")}
    <p class="lede">가격이나 날짜에 닿으면 GitHub 이슈로 알림이 옵니다.${m.alertState?.checked_at ? ` 마지막 점검 ${dateLabel(new Date(m.alertState.checked_at))}.` : ""}</p>
    ${chips([["all", "전체"], ...keys.map(k => [k, accountShort(k)])], levelAcct, "계좌")}
    ${shown.map(k => `<section class="group"><h2>${esc(accountLabel(k))}</h2><div class="cards">${items.filter(it => it.account === k).map(it => levelCard(it, today)).join("")}</div></section>`).join("")
      || `<p class="none">걸어 둔 관심가가 없습니다.</p>`}
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
  view.innerHTML = `${subtabs(TABS, "etf")}<p class="none">불러오는 중…</p>`;
  const repo = state.repo;
  const code = repo.list("etfwatch/reports/").map(p => p.match(/(\w+)\.md$/)?.[1]).find(c => c && !c.includes("_")) || "426020";
  const [md, ev] = await Promise.all([
    repo.text(`etfwatch/reports/${code}.md`).catch(() => null),
    repo.text(`etfwatch/reports/${code}_eval.md`).catch(() => null),
  ]);
  if (!view.querySelector('.seg [aria-current][href="#/assets/etf"]')) return; // 불러오는 사이 다른 화면으로 넘어감
  if (!md) { view.innerHTML = `${subtabs(TABS, "etf")}<p class="none">감시 리포트가 없습니다.</p>`; return; }
  const title = md.match(/^# (.*)$/m)?.[1]?.replace(/ 구성 변경 이력$/, "") || code;
  const dataLine = md.match(/^- 데이터: (.*)$/m)?.[1] || "";
  const log = parseRebalLog(md);
  const shown = etfAll ? log : log.slice(0, 6);
  const evPeriods = ev ? (ev.split(/^## 기간별.*$/m)[1] || "").split(/^## /m)[0] : "";
  const evSummary = ev ? (ev.match(/^- 리밸런싱 \d+회.*$/gm) || []) : [];
  view.innerHTML = `
    ${subtabs(TABS, "etf")}
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
