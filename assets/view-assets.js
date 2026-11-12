// 자산: 계좌(보유·비중·손익), 관심가(가격선 사다리·날짜), ETF 구성 감시.
import { ACCOUNT_ORDER, state, accountKeys, accountLabel, accountShort, accountView, levelItems, levelLabel, levelNote, todayKST, worthSeries } from "./store.js";
import { SERIES, CASH, donut, line, bindLines } from "./chart.js";
import { inline, markdown } from "./md.js";
import { view, esc, money, nf, pct, tone, dateLabel, dday, distText, krwShort, qtyText, head, subtabs, chips, bindChips } from "./ui.js";

const TABS = [["#/assets", "계좌", "accounts"], ["#/assets/levels", "관심가", "levels"], ["#/assets/etf", "ETF", "etf"]];

/* ---------- 계좌: 위에 기간, 전체 평가 추이, 계좌 구성 도넛, 고른 계좌의 추이·종목 구성 ---------- */
let picked = null;
const PERIODS = [["7", "1주"], ["30", "1개월"], ["90", "3개월"], ["all", "전체"]];
let period = "all";

// 기간 처음보다 얼마나 바뀌었는지: "+1,234만원 (+4.2%) 10/24보다". 중간에 추가한 계좌는 빼고 잰다.
function changeLine(c) {
  if (!c) return "";
  const note = c.added.length ? `${c.added.join("·")} 추가분 빼고, 입금·출금 포함` : "입금·출금 포함";
  return `<p class="delta"><b class="fig tone-${tone(c.d)}">${c.d > 0 ? "+" : c.d < 0 ? "−" : ""}${krwShort(Math.abs(c.d))} (${pct(c.r)})</b><span>${esc(c.since === "지금" ? "" : c.since.slice(5).replace("-", "/"))}보다, ${note}</span></p>`;
}

// key: 계좌 또는 "all". now: {계좌: 지금 평가액} (지금 시세로 계산된 계좌만)
function trend(key, now, label) {
  const m = state.model;
  if (!m.worth?.t?.length) return `<p class="hint">평가액 추이는 시세 탭을 한 번 열면 계산됩니다.</p>`;
  const { points, marks, change } = worthSeries(m.worth, key, period === "all" ? null : +period, now);
  return `${changeLine(change)}${line(points, { fmt: krwShort, marks, label: `${label} 평가액 추이` })}`;
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
      ${v.total ? donut(slices, { size: 132, center: `${v.rows.length}종목`, sub: v.cash > 0 ? "현금 포함" : "" }) : ""}
      <ul class="holds">${rows}${cashRow}</ul>
    </div>
    <p class="hint">${basis}${expo ? ` 레버리지 반영 실효 노출 ${nf(1).format(expo)}%.` : ""}</p>
  </section>`;
}

export function renderAccounts() {
  const keys = accountKeys(state.model.accounts);
  if (!keys.length) { view.innerHTML = `${subtabs(TABS, "accounts")}<p class="none">계좌 설정 파일(config/accounts.json)이 없습니다.</p>`; return; }
  const views = keys.map(accountView);
  if (!keys.includes(picked)) picked = keys[0];
  // 계좌 색은 계좌 순서로 고정한다(고른 계좌가 바뀌어도 색은 그대로)
  const color = Object.fromEntries(keys.map((k, i) => [k, SERIES[i % SERIES.length]]));
  const all = views.every(v => v.total != null) ? views.reduce((s, v) => s + v.total, 0) : null;
  const span = state.model.worth?.t?.length ? (Date.parse(todayKST()) - Date.parse(state.model.worth.t[0])) / 86400000 : 0;
  view.innerHTML = `
    ${subtabs(TABS, "accounts")}
    <div class="seg" role="group" aria-label="기간">${PERIODS.map(([v, t]) => `<button type="button" data-period="${v}" aria-pressed="${period === v}" ${v !== "all" && +v > span + 7 ? "disabled" : ""}>${t}</button>`).join("")}</div>
    <div class="accounts">
      <div class="col">
        <section class="panel">
          <header class="worth"><span>전체 평가</span><b class="fig">${all != null ? krwShort(all) : "–"}</b></header>
          ${trend("all", Object.fromEntries(views.filter(v => v.live).map(v => [v.key, v.total])), "전체")}
        </section>
        <section class="panel">
          ${head("계좌 구성", `<span class="hint">눌러서 계좌 보기</span>`)}
          <div class="split">
            ${all ? donut(views.map(v => ({ key: v.key, label: accountShort(v.key), value: v.total || 0, color: color[v.key] })), { center: krwShort(all), sub: `${views.length}개 계좌`, picked }) : ""}
            <div class="picker" role="group" aria-label="계좌">${views.map(v => `<button type="button" data-acc="${esc(v.key)}" aria-pressed="${v.key === picked}">
              <i class="sw" style="background:${color[v.key]}"></i><span>${esc(accountShort(v.key))}</span><b class="fig">${v.total != null ? krwShort(v.total) : "–"}</b><small class="fig">${all ? nf(0).format(v.total / all * 100) + "%" : ""}</small>
            </button>`).join("")}</div>
          </div>
        </section>
      </div>
      ${accountPanel(views.find(v => v.key === picked), color[picked])}
    </div>
    ${state.model.worth?.t?.length ? `<p class="hint foot">평가액 추이는 계좌 설정의 변경 기록(${esc(state.model.worth.t[0].slice(5).replace("-", "/"))}부터)과 그날 종가로 다시 계산합니다. 입금·출금과 새로 추가한 계좌도 평가액에 그대로 들어갑니다.</p>` : ""}`;
  view.querySelectorAll("[data-acc]").forEach(b => b.addEventListener("click", () => { picked = b.dataset.acc; renderAccounts(); }));
  view.querySelectorAll("[data-period]").forEach(b => b.addEventListener("click", () => { period = b.dataset.period; renderAccounts(); }));
  bindLines(view);
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
