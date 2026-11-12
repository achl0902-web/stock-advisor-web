// 자산: 계좌(보유·비중·손익), 관심가(가격선 사다리·날짜), ETF 구성 감시.
import { ACCOUNT_ORDER, state, accountKeys, accountGroup, accountLabel, accountShort, accountView, levelItems, levelLabel, levelNote, todayKST, worthSeries } from "./store.js";
import { SERIES, CASH, donut, line, bindLines, dayText } from "./chart.js";
import { inline, markdown } from "./md.js";
import { view, esc, money, nf, pct, tone, dateLabel, dday, distText, krwShort, qtyText, head, subtabs, chips, bindChips } from "./ui.js";

const TABS = [["#/assets", "계좌", "accounts"], ["#/assets/long", "연금·코인", "long"], ["#/assets/levels", "관심가", "levels"], ["#/assets/etf", "ETF", "etf"]];

/* ---------- 계좌: 위에 기간(버튼·슬라이더), 투자성과와 평가액 추이, 계좌 구성 도넛, 고른 계좌의 성과·종목 구성 ---------- */
const picked = {}; // 묶음(계좌·연금·코인)마다 고른 계좌
const PERIODS = [["7", "1주"], ["30", "1개월"], ["90", "3개월"], ["365", "1년"], ["all", "전체"]];
// 고른 기간: preset을 누르면 끝은 마지막 날, 슬라이더를 움직이면 preset이 풀린다. 날짜는 worth.t의 값
const win = { preset: "365", from: null, to: null };
let trends = []; // 지금 화면에 그린 성과 칸들 [{key, now, label}]: 기간을 바꾸면 이것만 다시 그린다

function presetWindow(t) {
  if (win.preset === "all") return { from: t[0], to: t.at(-1) };
  if (!win.preset) return { from: win.from || t[0], to: win.to || t.at(-1) };
  const from = new Date(Date.parse(t.at(-1)) - +win.preset * 86400000).toISOString().slice(0, 10);
  return { from: t.find(d => d >= from) || t[0], to: t.at(-1) };
}

// 기간 고르기: 버튼(1주~전체)과 시작·끝 손잡이 두 개짜리 슬라이더. 화면 위에 하나, 아래 모든 성과 칸에 같이 쓴다
function rangeBox() {
  const t = state.model.worth?.t;
  if (!t?.length) return "";
  const w = presetWindow(t);
  const span = (Date.parse(t.at(-1)) - Date.parse(t[0])) / 86400000;
  return `<i class="range-sentinel" aria-hidden="true"></i><section class="range" aria-label="기간">
    <div class="seg seg-fill" role="group" aria-label="기간 빠르게 고르기">${PERIODS.map(([v, l]) => `<button type="button" data-period="${v}" aria-pressed="${win.preset === v}" ${v !== "all" && +v > span + 7 ? "disabled" : ""}>${l}</button>`).join("")}</div>
    <div class="slider" style="--a:${t.indexOf(w.from) / (t.length - 1) * 100}%;--b:${t.indexOf(w.to) / (t.length - 1) * 100}%">
      <span class="slider-track" aria-hidden="true"><i></i></span>
      <input type="range" id="r-from" min="0" max="${t.length - 1}" value="${t.indexOf(w.from)}" aria-label="시작일">
      <input type="range" id="r-to" min="0" max="${t.length - 1}" value="${t.indexOf(w.to)}" aria-label="끝일">
    </div>
    <p class="range-dates"><b class="fig" id="r-from-l">${esc(dayText(w.from))}</b><span>부터</span><b class="fig" id="r-to-l">${esc(dayText(w.to))}</b><span>까지</span></p>
  </section>`;
}

let stuckObs = null;
function bindRange() {
  const t = state.model.worth?.t;
  if (!t?.length) return;
  // 스크롤해도 위에 붙어 따라온다. 붙어 있는 동안은 버튼을 접어 화면을 덜 가린다
  stuckObs?.disconnect();
  const sentinel = view.querySelector(".range-sentinel"), bar = view.querySelector(".range");
  stuckObs = new IntersectionObserver(([e]) => bar.classList.toggle("stuck", !e.isIntersecting), { rootMargin: "-64px 0px 0px 0px" });
  stuckObs.observe(sentinel);
  const from = document.getElementById("r-from"), to = document.getElementById("r-to"), box = view.querySelector(".slider");
  let raf = 0;
  const apply = moved => {
    let a = +from.value, b = +to.value;
    if (a > b - 1) { if (moved === from) a = from.value = Math.max(0, b - 1); else b = to.value = Math.min(t.length - 1, a + 1); }
    Object.assign(win, { preset: null, from: t[a], to: t[b] });
    box.style.setProperty("--a", `${a / (t.length - 1) * 100}%`);
    box.style.setProperty("--b", `${b / (t.length - 1) * 100}%`);
    document.getElementById("r-from-l").textContent = dayText(t[a]);
    document.getElementById("r-to-l").textContent = dayText(t[b]);
    view.querySelectorAll("[data-period]").forEach(x => x.setAttribute("aria-pressed", "false"));
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(drawTrends); // 끄는 동안 한 화면에 한 번만 다시 그린다
  };
  from.addEventListener("input", () => apply(from));
  to.addEventListener("input", () => apply(to));
  view.querySelectorAll("[data-period]").forEach(btn => btn.addEventListener("click", () => {
    win.preset = btn.dataset.period;
    const w = presetWindow(t);
    from.value = t.indexOf(w.from); to.value = t.indexOf(w.to);
    box.style.setProperty("--a", `${from.value / (t.length - 1) * 100}%`);
    box.style.setProperty("--b", `${to.value / (t.length - 1) * 100}%`);
    document.getElementById("r-from-l").textContent = dayText(w.from);
    document.getElementById("r-to-l").textContent = dayText(w.to);
    view.querySelectorAll("[data-period]").forEach(x => x.setAttribute("aria-pressed", String(x === btn)));
    drawTrends();
  }));
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

const won = v => (v > 0 ? "+" : v < 0 ? "−" : "") + nf(0).format(Math.abs(Math.round(v))) + "원";

function drawTrends() {
  const m = state.model, t = m.worth?.t;
  if (!t?.length) return;
  const w = presetWindow(t);
  view.querySelectorAll("[data-trend]").forEach(el => {
    const { key, now, label } = trends[+el.dataset.trend] || {};
    if (!key) return;
    const { points, marks, sum } = worthSeries(m.worth, key, w, now);
    if (!sum) { el.innerHTML = `<p class="hint">이 기간에는 평가 기록이 없습니다.</p>`; return; }
    const legend = marks.length ? `<ul class="ln-legend">${marks.map(x => `<li><i></i>${esc(dayText(x.t))} ${esc(x.label)}</li>`).join("")}</ul>` : "";
    el.innerHTML = `
      <div class="perf">
        <div><span>투자손익</span><b class="fig tone-${tone(sum.pnl)}">${won(sum.pnl)}</b></div>
        <div><span>투자수익률</span><b class="fig tone-${tone(sum.pnl)}">${sum.rate != null ? pct(sum.rate, 2) : "–"}</b></div>
      </div>
      ${line(points, { fmt: krwShort, marks, label: `${label} 평가액과 투자원금 추이` })}
      <p class="ln-key"><span><i class="k-v"></i>평가액</span><span><i class="k-p"></i>투자원금(기초 + 입출금)</span></p>
      ${legend}
      <dl class="facts perf-facts">
        <div><dt>기초 평가금액 <small>${esc(dayText(sum.from))}</small></dt><dd class="fig">${nf(0).format(sum.base)}원</dd></div>
        <div><dt>기말 평가금액 <small>${esc(dayText(sum.to))}</small></dt><dd class="fig">${nf(0).format(sum.end)}원</dd></div>
        <div><dt>순 입출금</dt><dd class="fig">${won(sum.flows)}</dd></div>
        <div><dt>투자원금</dt><dd class="fig">${nf(0).format(sum.principal)}원</dd></div>
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

function accountPanel(v, color) {
  const { a, key } = v, m = state.model;
  const safe = a.safe_assets || {};
  // 종목 색은 설정 파일 순서를 따른다(비중이 바뀌어도 같은 종목은 같은 색). 현금은 회색.
  const slices = v.rows.map((r, i) => ({ key: r.h.symbol, label: m.names[r.h.symbol] || r.h.symbol, value: r.value || 0, color: SERIES[i % SERIES.length] }));
  if (v.cash > 0) slices.push({ key: "cash", label: "현금", value: v.cash, color: CASH });
  const rows = v.rows.map(({ h, q, value, pl, weight }, i) => {
    const unit = h.market === "CRYPTO" ? h.symbol : "주";
    return `<li class="hold">
      <div class="hold-top"><b><i class="sw" style="background:${slices[i].color}"></i>${esc(m.names[h.symbol] || h.symbol)}${safe[h.symbol] ? `<span class="tag">안전자산</span>` : ""}${h.leverage > 1 ? `<span class="tag">${h.leverage}배</span>` : ""}</b><span class="fig">${value != null ? krwShort(value) : "–"}<small>${weight != null ? nf(1).format(weight) + "%" : ""}</small></span></div>
      <div class="hold-sub"><span>${qtyText(h.qty, unit)}${h.avg_price ? `, 평단 ${money(h.avg_price, h.currency)}` : ""}</span><span>${q?.price != null ? `<span class="fig">${money(q.price, h.currency)}</span>${pl != null ? ` <b class="fig tone-${tone(pl)}">${pct(pl)}</b>` : ""}` : "시세 없음"}</span></div>
    </li>`;
  }).join("");
  const cashText = [a.cash_krw ? money(a.cash_krw, "KRW") : null, a.cash_usd ? money(a.cash_usd, "USD") : null].filter(Boolean).join(", ");
  const cashRow = v.cash > 0 ? `<li class="hold"><div class="hold-top"><b><i class="sw" style="background:${CASH}"></i>현금</b><span class="fig">${krwShort(v.cash)}<small>${v.cashPct != null ? nf(1).format(v.cashPct) + "%" : ""}</small></span></div><div class="hold-sub"><span>${cashText}</span></div></li>` : "";
  const basis = v.live
    ? `지금 시세로 계산했습니다${m.boardAt ? ` (시세판 ${dateLabel(m.boardAt)} 수집)` : ""}.`
    : v.snap ? `시세가 없는 종목이 있어 ${dateLabel(v.snap.at)} 분석 시점 값입니다. 시세 탭을 한 번 열면 새로 수집합니다.` : "시세가 없는 종목이 있고 불러온 최근 판단에 이 계좌 분석이 없어 평가액을 계산하지 못했습니다. 시세 탭을 한 번 열면 새로 수집합니다.";
  const expo = v.snap?.brief.portfolio?.effective_exposure_pct;
  return `<section class="panel account">
    ${head(a.label || key, `<b class="fig total"><i class="sw" style="background:${color}"></i>${v.total != null ? krwShort(v.total) : "–"}</b>`)}
    ${a.purpose ? `<details class="purpose"><summary>${esc(a.purpose.split(/(?<=다\.)\s/)[0])}</summary><p>${esc(a.purpose)}</p></details>` : ""}
    ${trend(key, v.live ? { [key]: v.total } : null, a.label || key)}
    ${goalBlock(a)}${limitBlock(a, v)}
    <div class="split">
      ${v.total && slices.length > 1 ? donut(slices, { size: 132, center: `${v.rows.length}종목`, sub: v.cash > 0 ? "현금 포함" : "" }) : ""}
      <ul class="holds">${rows}${cashRow}</ul>
    </div>
    <p class="hint">${basis}${expo ? ` 레버리지 반영 실효 노출 ${nf(1).format(expo)}%.` : ""}</p>
  </section>`;
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
    ${keys.length ? `${rangeBox()}<div class="cards">${keys.map(k => accountPanel(accountView(k), colorOf(k))).join("")}</div>
    <p class="hint foot">바로 쓸 돈이 아니라서 계좌 탭의 유동 자산 합계에는 넣지 않습니다.</p>${worthNote(keys)}` : `<p class="none">퇴직연금·크립토 계좌가 설정 파일(config/accounts.json)에 없습니다.</p>`}`;
  bindRange();
  drawTrends();
}

function renderGroup() {
  const tab = "accounts";
  const keys = accountGroup(state.model.accounts, false);
  if (!keys.length) { view.innerHTML = `${subtabs(TABS, tab)}<p class="none">이 묶음의 계좌가 설정 파일(config/accounts.json)에 없습니다.</p>`; return; }
  const views = keys.map(accountView);
  if (!keys.includes(picked[tab])) picked[tab] = keys[0];
  const cur = picked[tab];
  const color = Object.fromEntries(keys.map(k => [k, colorOf(k)]));
  const title = "유동 자산";
  const all = views.every(v => v.total != null) ? views.reduce((s, v) => s + v.total, 0) : null;
  trends = [];
  view.innerHTML = `
    ${subtabs(TABS, tab)}
    ${rangeBox()}
    <div class="accounts">
      <div class="col">
        <section class="panel">
          <header class="worth"><span>${title}</span><b class="fig">${all != null ? krwShort(all) : "–"}</b></header>
          ${trend(keys, Object.fromEntries(views.filter(v => v.live).map(v => [v.key, v.total])), title)}
        </section>
        <section class="panel">
          ${head("계좌 구성", `<span class="hint">눌러서 계좌 보기</span>`)}
          <div class="split">
            ${all ? donut(views.map(v => ({ key: v.key, label: accountShort(v.key), value: v.total || 0, color: color[v.key] })), { center: krwShort(all), sub: `${views.length}개 계좌`, picked: cur }) : ""}
            <div class="picker" role="group" aria-label="계좌">${views.map(v => `<button type="button" data-acc="${esc(v.key)}" aria-pressed="${v.key === cur}">
              <i class="sw" style="background:${color[v.key]}"></i><span>${esc(accountShort(v.key))}</span><b class="fig">${v.total != null ? krwShort(v.total) : "–"}</b><small class="fig">${all ? nf(0).format(v.total / all * 100) + "%" : ""}</small>
            </button>`).join("")}</div>
          </div>
        </section>
      </div>
      ${accountPanel(views.find(v => v.key === cur), color[cur])}
    </div>
    ${worthNote(keys)}`;
  view.querySelectorAll("[data-acc]").forEach(b => b.addEventListener("click", () => { picked[tab] = b.dataset.acc; renderGroup(); }));
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
