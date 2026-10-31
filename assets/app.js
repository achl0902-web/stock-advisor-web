import { Repo, ApiError, settings, fetchStrategyStatus } from "./data.js";
import { esc, inline, markdown } from "./md.js";

const DEFAULT_REPO = "achl0902-web/stock-advisor";
const view = document.getElementById("view");
const syncEl = document.getElementById("sync");

const DEC = {
  buy: { label: "매수", seal: ["매", "수"], tone: "up" },
  split_buy: { label: "분할 매수", seal: ["분", "할", "매", "수"], tone: "up" },
  hold: { label: "관망", seal: ["관", "망"], tone: "flat" },
  trim: { label: "비중 축소", seal: ["축", "소"], tone: "down" },
  sell: { label: "매도", seal: ["매", "도"], tone: "down" },
};
const PREMORTEM = { skip: "생략", pass: "통과", revise: "계획 수정", block: "중단" };
const ACCOUNT_ORDER = ["main", "bio", "pension", "crypto"];

let state = { repo: null, model: null, strategy: null, loading: null, error: null };

/* ---------- 숫자 표기 ---------- */
const nf = (d = 0) => new Intl.NumberFormat("ko-KR", { minimumFractionDigits: d, maximumFractionDigits: d });
function money(v, cur) {
  if (v == null || isNaN(v)) return "–";
  if (cur === "USD") return "$" + nf(2).format(v);
  return nf(0).format(Math.round(v)) + "원";
}
// 수량: 주식은 정수 주, 코인은 소수점(최대 8자리) + 코인 기호
const nfQty = new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 8 });
const qtyText = (q, unit) => !unit || unit === "주" ? nf(0).format(q) + "주" : `${nfQty.format(q)} ${unit}`;
function krwShort(v) {
  if (v == null || isNaN(v)) return "–";
  const a = Math.abs(v);
  if (a >= 1e8) return (v / 1e8).toFixed(a >= 1e9 ? 1 : 2).replace(/\.?0+$/, "") + "억원";
  if (a >= 1e4) return nf(0).format(Math.round(v / 1e4)) + "만원";
  return nf(0).format(Math.round(v)) + "원";
}
function pct(v, d = 1, sign = true) {
  if (v == null || isNaN(v)) return "–";
  const s = nf(d).format(Math.abs(v));
  return (v > 0 && sign ? "+" : v < 0 ? "−" : "") + s + "%";
}
function pp(v, d = 1) {
  if (v == null || isNaN(v)) return "–";
  return (v > 0 ? "+" : v < 0 ? "−" : "") + nf(d).format(Math.abs(v)) + "%p";
}
const tone = v => (v > 0 ? "up" : v < 0 ? "down" : "flat");

function parseRunTime(id) {
  const m = id.match(/^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})/);
  return m ? new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:00+09:00`) : null;
}
const KST = { timeZone: "Asia/Seoul" };
function dateLabel(d, withTime = true) {
  if (!d) return "–";
  const md = d.toLocaleDateString("ko-KR", { ...KST, month: "numeric", day: "numeric", weekday: "short" });
  if (!withTime) return md;
  const t = d.toLocaleTimeString("ko-KR", { ...KST, hour: "2-digit", minute: "2-digit", hour12: false });
  return `${md} ${t}`;
}
function ago(d) {
  const s = (Date.now() - d.getTime()) / 1000;
  if (s < 90) return "방금";
  if (s < 3600) return `${Math.round(s / 60)}분 전`;
  if (s < 86400) return `${Math.round(s / 3600)}시간 전`;
  return `${Math.round(s / 86400)}일 전`;
}

/* ---------- 도장 ---------- */
function seal(decision, size = "md") {
  const d = DEC[decision] || { label: decision || "?", seal: [...String(decision || "?").slice(0, 2)], tone: "flat" };
  return sealChars(size === "xs" && d.seal.length === 4 ? d.seal.slice(0, 2) : d.seal, d.tone, size, d.label);
}
function sealChars(chars, toneName, size, label) {
  const grid = chars.length === 4 ? "four" : "two";
  return `<span class="seal seal-${size} tone-${toneName} ${grid}" role="img" aria-label="${esc(label || chars.join(""))}">${chars.map(c => `<i>${esc(c)}</i>`).join("")}</span>`;
}
function confidence(n) {
  if (!n) return "";
  return `<span class="conf" aria-label="확신도 ${n}/5">${[1, 2, 3, 4, 5].map(i => `<b class="${i <= n ? "on" : ""}"></b>`).join("")}<span>확신도 ${n}/5</span></span>`;
}

/* ---------- 데이터 모델 ---------- */
function accountOf(run, accounts) {
  const entries = Object.entries(accounts || {}).filter(([k, v]) => v && typeof v === "object" && Array.isArray(v.holdings));
  if (run.account?.holdings) {
    const syms = new Set(run.account.holdings.map(h => h.symbol));
    let best = null, bestScore = 0;
    for (const [k, v] of entries) {
      const s = v.holdings.filter(h => syms.has(h.symbol)).length / Math.max(syms.size, v.holdings.length);
      if (s > bestScore) { best = k; bestScore = s; }
    }
    if (best) return best;
    const p = run.account.purpose || "";
    if (p.includes("퇴직연금")) return "pension";
    if (p.includes("바이오")) return "bio";
  }
  for (const [k, v] of entries) if (v.holdings.some(h => h.symbol === run.symbol)) return k;
  return "main";
}

async function loadModel(repo) {
  const head = await repo.index();
  const ids = [...new Set(repo.list("runs/").map(p => p.split("/")[1]))].filter(id => id && !/test/i.test(id)).sort().reverse();
  const [accounts, alerts, alertState, scorecard, notes] = await Promise.all([
    repo.json("config/accounts.json"),
    repo.json("config/price_alerts.json"),
    repo.json("reports/alerts_state.json"),
    repo.json("reports/scorecard.json"),
    repo.json("config/scorecard_notes.json"),
  ]);
  const runs = await Promise.all(ids.map(async id => {
    const p = f => `runs/${id}/${f}`;
    const done = repo.has(p("final_decision.json"));
    const [brief, dec, plan, account, pm] = await Promise.all([
      repo.json(p("brief.json")),
      done ? repo.json(p("final_decision.json")) : null,
      done ? repo.json(p("plan.json")) : null,
      repo.has(p("account.json")) ? repo.json(p("account.json")) : null,
      done && repo.has(p("premortem.json")) ? repo.json(p("premortem.json")) : null,
    ]);
    const meta = brief?.meta || {};
    const at = meta.collected_at ? new Date(meta.collected_at) : parseRunTime(id);
    return {
      id, at, done, brief, dec, plan, account, premortem: pm,
      symbol: meta.symbol || id.split("-").slice(2).join("-"),
      name: meta.name || null,
      market: meta.market,
      currency: meta.currency || (meta.market === "KR" ? "KRW" : "USD"),
      price: brief?.quote?.price ?? brief?.technical?.price_used ?? plan?.price_now ?? null,
      quoteAt: brief?.quote?.asof ? new Date(brief.quote.asof) : at,
    };
  }));
  // 이름: 연금 계획 파일의 한글 이름을 우선
  const names = {};
  for (const r of [...runs].reverse()) if (r.name) names[r.symbol] = r.name;
  for (const it of alerts?.items || []) names[it.code] = it.name;
  for (const r of runs) {
    r.name = names[r.symbol] || r.name || r.symbol;
    r.accountKey = accountOf(r, accounts);
  }
  // 종목별 최근 시세
  const lastQuote = {};
  for (const r of runs) if (r.price != null && !lastQuote[r.symbol]) lastQuote[r.symbol] = { price: r.price, at: r.quoteAt, currency: r.currency };
  if (alertState?.quotes) {
    const at = alertState.checked_at ? new Date(alertState.checked_at) : null;
    for (const [code, q] of Object.entries(alertState.quotes)) {
      if (q?.price && (!lastQuote[code] || (at && at > lastQuote[code].at))) lastQuote[code] = { price: q.price, at, currency: "KRW" };
    }
  }
  return { head, runs, accounts, alerts, alertState, scorecard, notes: notes || {}, names, lastQuote };
}

/* ---------- 공통 조각 ---------- */
const accountLabel = k => state.model?.accounts?.[k]?.label || { main: "주 계좌", bio: "바이오 계좌", pension: "퇴직연금", crypto: "크립토 계좌" }[k] || k;
function runLine(r) {
  const d = DEC[r.dec?.decision];
  return `<a class="ledger-row" href="#/run/${encodeURIComponent(r.id)}">
    ${seal(r.dec?.decision, "sm")}
    <span class="lr-main"><span class="lr-name">${esc(r.name)}</span><span class="lr-sub">${esc(r.symbol)}<span class="sep"></span>${esc(accountLabel(r.accountKey))}</span></span>
    <span class="lr-side"><span class="lr-dec tone-${d?.tone || "flat"}">${esc(d?.label || r.dec?.decision || "")}</span><span class="lr-sub">${dateLabel(r.at)}</span></span>
  </a>`;
}
function ordersTable(plan) {
  if (!plan?.orders?.length) return `<p class="muted">이번 판단에는 주문이 없습니다.</p>`;
  const cur = plan.currency;
  return `<table class="orders"><thead><tr><th>회차</th><th class="num">지정가</th><th class="num">수량</th><th class="num">금액</th></tr></thead><tbody>${
    plan.orders.map(o => `<tr>
      <td><span class="side tone-${o.side === "sell" ? "down" : "up"}">${o.side === "sell" ? "매도" : "매수"}</span> ${esc(o.leg)}${o.zone?.low ? `<div class="zone">${money(o.zone.low, cur)}~${money(o.zone.high, cur)} 구간</div>` : ""}</td>
      <td class="num">${money(o.limit_price, cur)}</td>
      <td class="num">${qtyText(o.qty, plan.qty_unit)}</td>
      <td class="num">${money(o.amount_local, cur)}${cur === "USD" ? `<div class="zone">약 ${krwShort(o.amount_krw)}</div>` : ""}</td>
    </tr>`).join("")
  }</tbody></table>`;
}
function icon(name) {
  const p = {
    ok: '<path d="M4 10.5l4 4 8-9" />',
    warn: '<path d="M10 3.5l7.5 13h-15z" /><path d="M10 8.5v3.5M10 14.2v.3" />',
    back: '<path d="M12.5 4l-6 6 6 6" />',
    gear: '<circle cx="10" cy="10" r="2.6"/><path d="M10 2.5v2.2M10 15.3v2.2M2.5 10h2.2M15.3 10h2.2M4.7 4.7l1.6 1.6M13.7 13.7l1.6 1.6M4.7 15.3l1.6-1.6M13.7 6.3l1.6-1.6"/>',
    refresh: '<path d="M16 10a6 6 0 1 1-1.8-4.3" /><path d="M16.2 3.5v3.3h-3.3" />',
  }[name];
  return `<svg class="ic" viewBox="0 0 20 20" aria-hidden="true">${p}</svg>`;
}

/* ---------- 홈 ---------- */
function strategyBlock() {
  const s = state.strategy;
  if (!s) return "";
  const out = s.regime === "out";
  const leaving = s.regime === "in" && s.next === "out";
  const returning = s.regime === "out" && s.next === "in";
  const title = leaving ? "다음 거래일 이탈 예정" : returning ? "다음 거래일 복귀 예정" : out ? "이탈 중 (SGOV 대기)" : "QLD 보유 유지";
  const axes = ["변동성", "급락", "주봉 추세", "급팽창"];
  const macroPct = s.macro != null ? Math.round(s.macro * 100) : null;
  return `<section class="strategy ${out || leaving ? "alert" : ""}">
    <div class="st-head"><h2>QLD 챔피언 전략</h2><span class="muted">${esc(s.date || "")} 미국 종가 기준</span></div>
    <p class="st-state">${title}</p>
    <div class="axes">${axes.map((a, i) => `<span class="axis ${s.axes?.[i] ? "on" : ""}"><b></b>${a}</span>`).join("")}</div>
    <p class="muted small">기술 축 ${s.votes ?? 0}/4 켜짐, 매크로 경보 ${macroPct ?? "–"}%. 2배 레버리지 매수는 이탈 때 게이트가 막습니다.</p>
  </section>`;
}

function alertPlanBlock() {
  const a = state.model.alerts;
  if (!a?.items?.length) return "";
  const fired = state.model.alertState?.fired || {};
  const today = new Date().toLocaleDateString("sv-SE", KST);
  const rows = a.items.map(it => {
    const q = state.model.lastQuote[it.code];
    const prices = it.alerts.filter(x => "price" in x);
    const ups = prices.filter(x => x.op === ">=").sort((x, y) => x.price - y.price);
    const lows = prices.filter(x => x.op === "<=");
    const nextUp = ups.find(x => !fired[x.id]);
    const nextDate = it.alerts.filter(x => x.date && !fired[x.id]).sort((x, y) => x.date.localeCompare(y.date))[0];
    let line = "";
    if (q && prices.length) {
      const vals = [q.price, ...prices.map(x => x.price)];
      const lo = Math.min(...vals) * 0.97, hi = Math.max(...vals) * 1.03;
      const pos = v => ((v - lo) / (hi - lo) * 100).toFixed(2);
      line = `<div class="scale" aria-hidden="true">
        <span class="track"></span>
        ${lows.map(x => `<span class="tick low ${fired[x.id] ? "hit" : ""}" style="left:${pos(x.price)}%"></span>`).join("")}
        ${ups.map(x => `<span class="tick up ${fired[x.id] ? "hit" : ""}" style="left:${pos(x.price)}%"></span>`).join("")}
        <span class="now" style="left:${pos(q.price)}%"></span>
      </div>`;
    }
    const gap = q && nextUp ? (nextUp.price / q.price - 1) * 100 : null;
    return `<li class="plan-item">
      <div class="pi-head"><span class="pi-name">${esc(it.name)}</span><span class="pi-price">${q ? money(q.price, "KRW") : "시세 없음"}</span></div>
      ${line}
      <p class="pi-next">${nextUp ? `다음 목표 <strong>${money(nextUp.price, "KRW")}</strong>${gap != null ? ` <span class="tone-${tone(gap)}">(${pct(gap)})</span>` : ""}: ${esc(nextUp.msg)}` : ups.length ? "가격 목표 모두 도달" : ""}</p>
      ${nextDate ? `<p class="pi-date ${nextDate.date <= today ? "due" : ""}">${esc(nextDate.date)} ${esc(nextDate.msg)}</p>` : ""}
      <p class="muted small">보유 ${nf(0).format(it.hold)}주 중 ${nf(0).format(it.keep)}주는 유지${q?.at ? `, 시세 ${dateLabel(q.at, false)}` : ""}</p>
    </li>`;
  }).join("");
  return `<section class="block">
    <div class="block-head"><h2>퇴직연금 정리 계획</h2><span class="muted small">${esc(a.plan_set || "")} 설정</span></div>
    <ul class="plan">${rows}</ul>
    <p class="legend-line small"><span class="lg now"></span>현재가 <span class="lg up"></span>매도 목표 <span class="lg low"></span>경고선</p>
  </section>`;
}

function scoreSummary(h = "now") {
  const sc = state.model.scorecard || [];
  const rows = sc.map(s => ({ s, x: s.h?.[h] })).filter(r => r.x);
  const hits = rows.filter(r => typeof r.x.hit === "boolean");
  const hitN = hits.filter(r => r.x.hit).length;
  const dirEx = rows.filter(r => r.s.decision !== "hold" && r.x.excess != null).map(r => (["trim", "sell"].includes(r.s.decision) ? -1 : 1) * r.x.excess);
  const planned = rows.filter(r => ["buy", "split_buy"].includes(r.s.decision) && r.x.plan_ret != null && r.x.lump_ret != null);
  const avg = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
  return {
    n: rows.length, hitN, hitD: hits.length,
    dirEx: avg(dirEx) != null ? avg(dirEx) * 100 : null,
    splitEffect: planned.length ? avg(planned.map(r => r.x.plan_ret - r.x.lump_ret)) * 100 : null,
    plannedN: planned.length,
  };
}

async function renderHome() {
  const m = state.model;
  const done = m.runs.filter(r => r.done);
  const latest = done[0];
  let hero = `<section class="hero empty"><p>아직 완료된 판단이 없습니다. Claude에게 종목 분석을 요청하면 여기에 나타납니다.</p></section>`;
  if (latest) {
    const d = DEC[latest.dec.decision];
    hero = `<a class="hero" href="#/run/${encodeURIComponent(latest.id)}">
      <div class="hero-seal">${seal(latest.dec.decision, "lg")}</div>
      <div class="hero-body">
        <p class="hero-when">${dateLabel(latest.at)} 판단, ${esc(accountLabel(latest.accountKey))}</p>
        <h1><span class="hero-name">${esc(latest.name)}</span> <span class="tone-${d?.tone}">${esc(d?.label || latest.dec.decision)}</span></h1>
        <p class="hero-price">현재가 ${money(latest.price, latest.currency)}${latest.dec.confidence ? `, ${confidence(latest.dec.confidence)}` : ""}</p>
      </div>
      <div class="hero-orders">${ordersTable(latest.plan)}</div>
      <p class="hero-conclusion" id="hero-conclusion"></p>
    </a>`;
  }
  const ss = scoreSummary();
  view.innerHTML = `
    ${hero}
    ${strategyBlock()}
    <section class="block">
      <div class="block-head"><h2>최근 판단</h2><a class="more" href="#/runs">전체 ${done.length}건</a></div>
      <div class="ledger">${done.slice(1, 6).map(runLine).join("") || `<p class="muted">이전 판단이 없습니다.</p>`}</div>
    </section>
    ${alertPlanBlock()}
    ${ss.n ? `<a class="block score-teaser" href="#/score">
      <div class="block-head"><h2>추천 성적표</h2><span class="more">자세히</span></div>
      <div class="tiles">
        <div class="tile"><span class="t-v">${ss.hitN}/${ss.hitD}</span><span class="t-k">방향 적중</span></div>
        <div class="tile"><span class="t-v tone-${tone(ss.dirEx)}">${pp(ss.dirEx)}</span><span class="t-k">평균 초과수익</span></div>
        <div class="tile"><span class="t-v tone-${tone(ss.splitEffect)}">${pp(ss.splitEffect)}</span><span class="t-k">분할·지정가 효과</span></div>
      </div>
    </a>` : ""}
  `;
  if (latest) {
    const md = await state.repo.text(`runs/${latest.id}/report.md`).catch(() => null);
    const el = document.getElementById("hero-conclusion");
    const c = conclusionOf(md);
    if (el && c) el.textContent = c;
  }
}

function conclusionOf(md) {
  if (!md) return null;
  const m = md.match(/\*\*결론\*\*\s*\n([^\n]+)/) || md.match(/\*\*핵심 근거\*\*\s*\n([^\n]+)/);
  if (!m) return null;
  const s = m[1].replace(/^①\s*/, "").trim();
  const first = s.split(/(?<=다\.)\s/)[0];
  return first.length < 40 && s.length > first.length ? s.split(/(?<=다\.)\s/).slice(0, 2).join(" ") : first;
}

/* ---------- 판단 목록 ---------- */
let runFilter = "all";
function renderRuns() {
  const m = state.model;
  const done = m.runs.filter(r => r.done);
  const keys = ACCOUNT_ORDER.filter(k => done.some(r => r.accountKey === k));
  const list = done.filter(r => runFilter === "all" || r.accountKey === runFilter);
  const groups = new Map();
  for (const r of list) {
    const k = dateLabel(r.at, false);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(r);
  }
  const collectOnly = m.runs.filter(r => !r.done).length;
  view.innerHTML = `
    <header class="page-head"><h1>판단 기록</h1><p class="muted">완료된 분석 ${done.length}건. 눌러서 주문표와 근거를 봅니다.</p></header>
    <div class="chips" role="tablist">${["all", ...keys].map(k => `<button class="chip ${runFilter === k ? "on" : ""}" data-filter="${k}" role="tab" aria-selected="${runFilter === k}">${k === "all" ? "전체" : esc(accountLabel(k))}</button>`).join("")}</div>
    ${[...groups].map(([d, rs]) => `<section class="day"><h2 class="day-h">${esc(d)}</h2><div class="ledger">${rs.map(runLine).join("")}</div></section>`).join("") || `<p class="muted">이 계좌의 판단이 없습니다.</p>`}
    ${collectOnly ? `<p class="muted small foot-note">데이터 수집만 하고 판단까지 가지 않은 실행 ${collectOnly}건은 목록에서 뺐습니다.</p>` : ""}
  `;
  view.querySelectorAll("[data-filter]").forEach(b => b.addEventListener("click", () => { runFilter = b.dataset.filter; renderRuns(); }));
}

/* ---------- 판단 상세 ---------- */
async function renderRun(id) {
  const r = state.model.runs.find(x => x.id === id);
  if (!r) { view.innerHTML = `<p class="muted">이 실행을 찾지 못했습니다. <a href="#/runs">목록으로</a></p>`; return; }
  const d = DEC[r.dec?.decision];
  const plan = r.plan || {};
  const pm = r.premortem;
  view.innerHTML = `
    <a class="back" href="#/runs">${icon("back")}판단 기록</a>
    <section class="detail-head">
      ${seal(r.dec?.decision, "lg")}
      <div>
        <p class="hero-when">${dateLabel(r.at)} 데이터 기준, ${esc(accountLabel(r.accountKey))}</p>
        <h1>${esc(r.name)} <span class="tone-${d?.tone}">${esc(d?.label || r.dec?.decision || "")}</span></h1>
        <p class="muted">${esc(r.symbol)}${r.brief?.meta?.exchange ? `, ${esc(r.brief.meta.exchange)}` : ""}<span class="sep"></span>현재가 ${money(r.price, r.currency)}</p>
        ${r.dec?.confidence ? confidence(r.dec.confidence) : ""}
      </div>
    </section>
    <section class="block">
      <div class="block-head"><h2>주문표</h2><span class="muted small">${esc(plan.session || "")}</span></div>
      ${ordersTable(plan)}
      <dl class="facts">
        ${plan.weight_after_pct != null ? `<div><dt>주문 뒤 비중</dt><dd>${nf(2).format(plan.weight_after_pct)}%</dd></div>` : ""}
        ${plan.qty_after != null ? `<div><dt>전부 체결 시 보유</dt><dd>${qtyText(plan.qty_after, plan.qty_unit)}${plan.goal_pct_after != null ? ` (목표의 ${nf(1).format(plan.goal_pct_after)}%)` : ""}</dd></div>` : ""}
        ${plan.planned_krw != null ? `<div><dt>계획 금액</dt><dd>${krwShort(plan.planned_krw)}</dd></div>` : ""}
        ${plan.trim_zone?.price ? `<div><dt>비중 축소 구간</dt><dd>${money(plan.trim_zone.price, plan.currency)} 이상</dd></div>` : ""}
        ${plan.fx_conversion_needed_usd ? `<div><dt>환전 필요</dt><dd>$${nf(2).format(plan.fx_conversion_needed_usd)}</dd></div>` : ""}
        ${pm ? `<div><dt>사전 부검</dt><dd>${esc(PREMORTEM[pm.verdict] || pm.verdict)}</dd></div>` : ""}
      </dl>
      ${(plan.notes || []).map(n => `<p class="note">${icon("warn")}${esc(n)}</p>`).join("")}
    </section>
    <div id="checks"></div>
    <article class="report" id="report"><p class="muted">리포트를 불러오는 중…</p></article>
  `;
  window.scrollTo(0, 0);
  const [md, checks] = await Promise.all([
    state.repo.text(`runs/${id}/report.md`).catch(() => null),
    state.repo.json(`runs/${id}/checks.json`).catch(() => null),
  ]);
  if (Array.isArray(checks) && checks.length) {
    const bad = checks.filter(c => !c.ok);
    document.getElementById("checks").innerHTML = `<section class="block">
      <details class="checks" ${bad.length ? "open" : ""}>
        <summary><h2>최종 점검</h2><span class="${bad.length ? "tone-warn" : "muted"} small">${bad.length ? `확인 필요 ${bad.length}건` : `${checks.length}개 모두 통과`}</span></summary>
        <ul>${checks.map(c => `<li class="${c.ok ? "ok" : "bad"}">${icon(c.ok ? "ok" : "warn")}<span><strong>${esc(c.item)}</strong>${c.detail ? `<span class="muted"> ${esc(c.detail)}</span>` : ""}</span></li>`).join("")}</ul>
      </details></section>`;
  }
  const rep = document.getElementById("report");
  if (!md) { rep.innerHTML = `<p class="muted">리포트 파일이 없습니다.</p>`; return; }
  const lines = md.split("\n");
  const start = lines.findIndex(l => /^\*\*(결론|핵심 근거)\*\*/.test(l));
  rep.innerHTML = `<h2 class="report-h">판단 근거</h2>` + markdown(start > 0 ? lines.slice(start).join("\n") : md);
}

/* ---------- 성적표 ---------- */
let scoreH = "now";
function renderScore() {
  const sc = state.model.scorecard || [];
  const hs = ["5", "21", "63", "126", "now"];
  const hLabel = h => (h === "now" ? "오늘까지" : `${h}거래일`);
  const avail = new Set(sc.flatMap(s => Object.keys(s.h || {})));
  if (!avail.has(scoreH)) scoreH = "now";
  const ss = scoreSummary(scoreH);
  const rows = sc.map(s => ({ s, x: s.h?.[scoreH] })).filter(r => r.x).sort((a, b) => (b.s.at || "").localeCompare(a.s.at || ""));
  const maxAbs = Math.max(0.05, ...rows.map(r => Math.abs(r.x.excess || 0)));
  const asof = sc.map(s => s.h?.now?.date).filter(Boolean).sort().pop();
  view.innerHTML = `
    <header class="page-head"><h1>추천 성적표</h1><p class="muted">지난 판단을 결정가부터 다시 채점합니다. ${asof ? `${esc(asof)} 종가 기준.` : ""}</p></header>
    <div class="seg" role="tablist">${hs.map(h => `<button class="${scoreH === h ? "on" : ""}" ${avail.has(h) ? "" : "disabled"} data-h="${h}" role="tab" aria-selected="${scoreH === h}">${hLabel(h)}</button>`).join("")}</div>
    <div class="tiles wide">
      <div class="tile"><span class="t-v">${ss.n}건</span><span class="t-k">채점</span></div>
      <div class="tile"><span class="t-v">${ss.hitN}/${ss.hitD}</span><span class="t-k">방향 적중</span></div>
      <div class="tile"><span class="t-v tone-${tone(ss.dirEx)}">${pp(ss.dirEx)}</span><span class="t-k">초과수익 평균 (방향 반영)</span></div>
      <div class="tile"><span class="t-v tone-${tone(ss.splitEffect)}">${pp(ss.splitEffect)}</span><span class="t-k">분할·지정가 효과 (${ss.plannedN}건)</span></div>
    </div>
    ${ss.n < 20 ? `<p class="note soft">${icon("warn")}20건이 안 되면 우연의 영향이 커서 경향만 참고합니다.</p>` : ""}
    <section class="block">
      <div class="block-head"><h2>판단별 벤치마크 대비</h2><span class="muted small">0을 기준으로 오른쪽이 초과</span></div>
      <ul class="bars">${rows.map(({ s, x }) => {
        const ex = x.excess ?? 0;
        const w = (Math.abs(ex) / maxAbs * 50).toFixed(2);
        const note = state.model.notes[s.run];
        const isSell = ["trim", "sell"].includes(s.decision);
        return `<li>
          <a class="bar-row" href="#/run/${encodeURIComponent(s.run)}" title="${esc(s.name)}: 수익 ${pct(x.ret * 100)}, 벤치마크 ${pct(x.bench * 100)}">
            <span class="br-seal">${seal(s.decision, "xs")}</span>
            <span class="br-name">${esc(state.model.names[s.symbol] || s.name)}</span>
            <span class="br-meta muted small">${esc(String(s.at || "").slice(5, 10).replace("-", "/"))} 판단, ${x.days}일 경과${typeof x.hit === "boolean" ? `, ${x.hit ? "적중" : "빗나감"}` : ", 관망은 채점 제외"}</span>
            <span class="br-plot"><span class="zero"></span><span class="bar tone-${tone(ex)}" style="${ex >= 0 ? `left:50%` : `right:50%`};width:${w}%"></span></span>
            <span class="br-val"><span class="tone-${tone(ex)}">${pp(ex * 100)}</span><span class="muted small">수익 ${pct(x.ret * 100)}</span></span>
          </a>
          ${x.planned != null ? `<p class="br-plan muted small">체결 ${pct(x.fill_rate * 100, 0, false)}${x.filled?.length ? ` (${x.filled.map(esc).join(", ")})` : ""}, 계획대로 ${pct(x.plan_ret * 100)}${x.lump_ret != null ? ` vs 일괄 ${pct(x.lump_ret * 100)}` : ""}${x.premortem_effect ? `, 부검 효과 ${pp(x.premortem_effect * 100, 2)}` : ""}${isSell ? ", 매도 판단은 덜 오르면 적중" : ""}</p>` : ""}
          ${note ? `<p class="br-plan small note-inline">${esc(note)}</p>` : ""}
        </li>`;
      }).join("") || `<li class="muted">이 기간을 채운 판단이 아직 없습니다.</li>`}</ul>
    </section>
  `;
  view.querySelectorAll("[data-h]").forEach(b => b.addEventListener("click", () => { scoreH = b.dataset.h; renderScore(); }));
}

/* ---------- 계좌 ---------- */
function renderAccounts() {
  const m = state.model;
  const acc = m.accounts || {};
  const keys = [...ACCOUNT_ORDER.filter(k => acc[k]), ...Object.keys(acc).filter(k => !ACCOUNT_ORDER.includes(k) && acc[k]?.holdings)];
  const blocks = keys.map(k => {
    const a = acc[k];
    const snap = m.runs.find(r => r.accountKey === k && r.brief?.portfolio?.holdings?.length);
    const pf = snap?.brief?.portfolio;
    const fx = snap?.brief?.fx?.usdkrw;
    const wOf = sym => pf?.holdings?.find(h => h.symbol === sym)?.weight_pct;
    const safe = a.safe_assets || {};
    const rows = a.holdings.map(h => {
      const q = m.lastQuote[h.symbol];
      const pl = q?.price && h.avg_price ? (q.price / h.avg_price - 1) * 100 : null;
      // 목표 수량 계좌(코인)는 비중 대신 목표 달성률
      const goal = a.goal?.symbol === h.symbol ? h.qty / a.goal.qty * 100 : null;
      const w = goal ?? wOf(h.symbol);
      const unit = h.market === "CRYPTO" ? h.symbol : "주";
      return `<li class="hold">
        <div class="h-top"><span class="h-name">${esc(m.names[h.symbol] || h.symbol)}${safe[h.symbol] ? `<span class="tag">안전자산</span>` : ""}${h.leverage > 1 ? `<span class="tag">${h.leverage}배</span>` : ""}</span><span class="h-w">${w != null ? nf(1).format(w) + "%" + (goal != null ? ` / 목표 ${qtyText(a.goal.qty, unit)}` : "") : "–"}</span></div>
        <div class="wbar"><span style="width:${Math.min(100, w || 0)}%"></span></div>
        <div class="h-sub muted small"><span>${esc(h.symbol)}, ${qtyText(h.qty, unit)}${h.avg_price ? `, 평단 ${money(h.avg_price, h.currency)}` : ""}</span><span>${q ? `${money(q.price, h.currency)} <span class="tone-${tone(pl)}">${pct(pl)}</span>` : "시세 없음"}</span></div>
      </li>`;
    }).join("");
    let limit = "";
    if (a.risk_asset_max_pct && pf?.holdings) {
      const cashPct = pf.total_krw ? ((pf.cash_krw || 0) + (pf.cash_usd || 0) * (fx || 0)) / pf.total_krw * 100 : 0;
      const safePct = pf.holdings.filter(h => safe[h.symbol]).reduce((s, h) => s + (h.weight_pct || 0), 0);
      const risk = Math.max(0, 100 - safePct - cashPct);
      const over = risk > a.risk_asset_max_pct;
      limit = `<div class="limit ${over ? "over" : ""}">
        <div class="limit-head"><span>위험자산 비중</span><strong>${nf(1).format(risk)}%<span class="muted"> / 한도 ${a.risk_asset_max_pct}%</span></strong></div>
        <div class="limit-bar"><span class="fill" style="width:${Math.min(100, risk)}%"></span><span class="cap" style="left:${a.risk_asset_max_pct}%"></span></div>
        <p class="small ${over ? "tone-warn" : "muted"}">${over ? `${icon("warn")}한도를 ${nf(1).format(risk - a.risk_asset_max_pct)}%p 넘었습니다. 정리 계획 대로 줄이는 중입니다.` : "한도 안입니다."}</p>
      </div>`;
    }
    const cash = [a.cash_krw ? money(a.cash_krw, "KRW") : null, a.cash_usd ? money(a.cash_usd, "USD") : null].filter(Boolean).join(", ");
    return `<section class="block account">
      <div class="block-head"><h2>${esc(a.label || k)}</h2><span class="acc-total">${pf?.total_krw ? krwShort(pf.total_krw) : ""}</span></div>
      ${a.purpose ? `<details class="purpose"><summary>${esc(a.purpose.split(/(?<=다\.)\s/)[0])}</summary><p>${esc(a.purpose)}</p></details>` : ""}
      ${limit}
      <ul class="holds">${rows}</ul>
      <p class="muted small">${cash ? `현금 ${cash}. ` : ""}${snap ? `비중은 ${dateLabel(snap.at)} 분석 시점, 시세는 종목별 최근 분석 기준.` : "이 계좌로 분석한 기록이 아직 없어 비중을 계산하지 못했습니다."}${pf?.effective_exposure_pct ? ` 레버리지 반영 실효 노출 ${nf(1).format(pf.effective_exposure_pct)}%.` : ""}</p>
    </section>`;
  }).join("");
  view.innerHTML = `
    <header class="page-head"><h1>계좌</h1><p class="muted">stock-advisor의 계좌 설정(config/accounts.json)과 최근 분석 결과를 합쳐 보여 줍니다. 보유가 바뀌면 그 파일만 고치면 됩니다.</p></header>
    ${blocks || `<p class="muted">계좌 설정 파일이 없습니다.</p>`}
  `;
}

/* ---------- ETF 감시 ---------- */
function parseRebalLog(md) {
  const sec = md.split(/^## 리밸런싱 일지.*$/m)[1] || "";
  return sec.split(/^### /m).slice(1).map(chunk => {
    const [head, ...rest] = chunk.split("\n");
    const date = head.match(/^(\d{4}-\d{2}-\d{2})/)?.[1];
    const turnover = head.match(/회전율 ([\d.]+)%/)?.[1];
    const count = head.match(/종목 수 (\d+→\d+)/)?.[1];
    const idx = head.match(/지수 노출 ([\d.]+→[\d.]+%)/)?.[1];
    const groups = rest.filter(l => l.startsWith("- **")).map(l => {
      const m = l.match(/^- \*\*([^*]+)\*\* \((\d+)\): (.*)$/);
      if (!m) return null;
      const items = m[3].split("; ").map(t => {
        const x = t.match(/^(.*) \(([^)]+?)(?: US| KS)?\) ([\d.]+)% → ([\d.]+)%$/);
        return x ? { name: x[1], tick: x[2], from: +x[3], to: +x[4] } : { name: t };
      });
      return { kind: m[1], items };
    }).filter(Boolean);
    return { date, turnover, count, idx, groups };
  });
}
let etfMore = false;
async function renderEtf() {
  view.innerHTML = `<header class="page-head"><h1>ETF 구성 감시</h1><p class="muted">불러오는 중…</p></header>`;
  const code = (state.repo.list("etfwatch/reports/").map(p => p.match(/(\w+)\.md$/)?.[1]).find(c => c && !c.includes("_"))) || "426020";
  const [md, ev] = await Promise.all([
    state.repo.text(`etfwatch/reports/${code}.md`).catch(() => null),
    state.repo.text(`etfwatch/reports/${code}_eval.md`).catch(() => null),
  ]);
  if (!md) { view.innerHTML = `<header class="page-head"><h1>ETF 구성 감시</h1><p class="muted">감시 리포트가 없습니다.</p></header>`; return; }
  const title = md.match(/^# (.*)$/m)?.[1]?.replace(/ 구성 변경 이력$/, "") || code;
  const dataLine = md.match(/^- 데이터: (.*)$/m)?.[1] || "";
  const log = parseRebalLog(md);
  const shown = etfMore ? log : log.slice(0, 6);
  const KIND = { "신규 편입": "in", "전량 편출": "out", "비중 확대": "inc", "비중 축소": "dec" };
  const evPeriods = ev ? (ev.split(/^## 기간별.*$/m)[1] || "").split(/^## /m)[0] : "";
  const evSummary = ev ? (ev.match(/^- 리밸런싱 \d+회.*$/gm) || []) : [];
  view.innerHTML = `
    <header class="page-head"><h1>${esc(title)}</h1><p class="muted">${esc(dataLine)}. 하루 회전율 4% 이상이거나 큰 종목 교체가 3건 이상이면 GitHub 이슈로 알립니다.</p></header>
    <section class="block">
      <div class="block-head"><h2>리밸런싱 일지</h2><span class="muted small">${log.length}회, 최근 순</span></div>
      <ol class="rebal">${shown.map(e => `<li>
        <div class="rb-head"><strong>${esc(e.date)}</strong><span class="muted small">회전율 ${esc(e.turnover)}%, 종목 ${esc(e.count)}, 지수 노출 ${esc(e.idx)}</span></div>
        ${e.groups.map(g => `<div class="rb-group k-${KIND[g.kind] || "x"}"><span class="rb-kind">${esc(g.kind)}</span><span class="rb-items">${g.items.map(it => it.tick
          ? `<span class="rb-item" title="${esc(it.name)}"><b>${esc(it.tick)}</b> ${nf(2).format(it.from)}→${nf(2).format(it.to)}%</span>`
          : `<span class="rb-item">${esc(it.name)}</span>`).join("")}</span></div>`).join("")}
      </li>`).join("")}</ol>
      ${log.length > 6 ? `<button class="btn ghost" id="etf-more">${etfMore ? "최근 6회만 보기" : `나머지 ${log.length - 6}회 더 보기`}</button>` : ""}
    </section>
    ${ev ? `<section class="block">
      <div class="block-head"><h2>매매 사후 평가</h2></div>
      ${evSummary.length ? `<ul class="plain small">${evSummary.map(l => `<li>${inline(l.replace(/^- /, ""))}</li>`).join("")}</ul>` : ""}
      <div class="md">${markdown(evPeriods)}</div>
      <p class="muted small">매매 효과 = 실제 보유 수익 − 첫날 보유를 그대로 둔 수익.</p>
    </section>` : ""}
  `;
  document.getElementById("etf-more")?.addEventListener("click", () => { etfMore = !etfMore; renderEtf(); });
}

/* ---------- 설정 ---------- */
function renderSetup(message) {
  const cur = settings.load();
  document.body.classList.add("setup-mode");
  view.innerHTML = `
    <section class="setup">
      <div class="setup-seal">${sealChars(["판", "단", "일", "지"], "up", "lg", "판단 일지")}</div>
      <h1>판단 일지 연결</h1>
      <p>이 페이지에는 데이터가 없습니다. 비공개 <strong>stock-advisor</strong> 저장소를 이 기기에서만 읽어 와 보여 줍니다. 토큰은 이 브라우저에만 저장되고 GitHub 말고는 어디로도 보내지 않습니다.</p>
      ${message ? `<p class="note">${icon("warn")}${esc(message)}</p>` : ""}
      <form id="setup-form" autocomplete="off">
        <label>저장소<input name="repo" value="${esc(cur ? `${cur.owner}/${cur.repo}` : DEFAULT_REPO)}" spellcheck="false" autocapitalize="off"></label>
        <label>읽기 전용 토큰<input name="token" type="password" placeholder="github_pat_…" value="${esc(cur?.token || "")}" spellcheck="false" autocapitalize="off" required></label>
        <button class="btn" type="submit">연결하기</button>
      </form>
      <details class="howto" ${cur ? "" : "open"}>
        <summary>토큰 만드는 법</summary>
        <ol>
          <li>GitHub에서 <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener noreferrer">새 fine-grained 토큰 만들기</a>를 엽니다.</li>
          <li>이름은 아무거나(예: 판단 일지), 만료는 원하는 기간으로 둡니다.</li>
          <li>Repository access에서 <strong>Only select repositories</strong>를 고르고 stock-advisor 하나만 넣습니다.</li>
          <li>Permissions의 Repository permissions에서 <strong>Contents: Read-only</strong>만 켭니다. Metadata 읽기는 자동으로 붙습니다.</li>
          <li>만든 토큰을 위 칸에 붙여 넣고 연결하기를 누릅니다.</li>
        </ol>
        <p class="muted small">읽기 전용이라 이 토큰으로는 저장소를 바꿀 수 없습니다. 기기를 잃어버리면 GitHub에서 토큰을 지우면 됩니다.</p>
      </details>
      ${cur ? `<button class="btn ghost danger" id="forget">이 기기에서 토큰 지우기</button>` : ""}
    </section>`;
  document.getElementById("setup-form").addEventListener("submit", e => {
    e.preventDefault();
    const f = new FormData(e.target);
    const [owner, repo] = String(f.get("repo")).trim().split("/");
    const token = String(f.get("token")).trim();
    if (!owner || !repo || !token) return;
    settings.save({ owner, repo, token });
    state.model = null;
    location.hash = "#/";
    boot();
  });
  document.getElementById("forget")?.addEventListener("click", () => {
    settings.clear();
    state = { repo: null, model: null, strategy: null };
    renderSetup("토큰을 지웠습니다.");
  });
}

/* ---------- 라우팅 ---------- */
function setNav(tab) {
  document.querySelectorAll(".nav a").forEach(a => a.setAttribute("aria-current", a.dataset.tab === tab ? "page" : "false"));
}
async function route() {
  const h = location.hash.replace(/^#\/?/, "");
  const [page, arg] = h.split("/");
  if (page === "settings") { setNav("settings"); renderSetup(); return; }
  if (!state.model) return;
  document.body.classList.remove("setup-mode");
  const tab = { "": "home", run: "runs", runs: "runs", score: "score", accounts: "accounts", etf: "etf" }[page] || "home";
  setNav(tab);
  try {
    if (page === "run" && arg) await renderRun(decodeURIComponent(arg));
    else if (page === "runs") renderRuns();
    else if (page === "score") renderScore();
    else if (page === "accounts") renderAccounts();
    else if (page === "etf") await renderEtf();
    else await renderHome();
  } catch (e) {
    view.innerHTML = `<p class="note">${icon("warn")}${esc(e.message || String(e))}</p>`;
  }
  if (page !== "run") window.scrollTo(0, 0);
}

function setSync(text, busy = false) {
  syncEl.innerHTML = `${busy ? '<span class="spin"></span>' : ""}${esc(text)}`;
}

async function boot() {
  state.loadedAt = Date.now();
  const cfg = settings.load();
  if (!cfg?.token) { setSync("연결 안 됨"); renderSetup(); return; }
  document.body.classList.remove("setup-mode");
  state.repo = new Repo(cfg);
  if (!state.model) view.innerHTML = `<div class="loading">${sealChars(["읽", "는", "중", "…"], "flat", "lg", "불러오는 중")}<p class="muted">저장소를 읽는 중…</p></div>`;
  setSync("불러오는 중", true);
  try {
    const [model, strategy] = await Promise.all([loadModel(state.repo), fetchStrategyStatus()]);
    state.model = model;
    state.strategy = strategy;
    const at = new Date(model.head.date);
    setSync(`${ago(at)} 갱신`);
    syncEl.title = `${model.head.message} (${at.toLocaleString("ko-KR", KST)})`;
    await route();
  } catch (e) {
    setSync("연결 실패");
    if (e instanceof ApiError && [401, 403, 404].includes(e.status)) renderSetup(e.message);
    else view.innerHTML = `<p class="note">${icon("warn")}${esc(e.message || String(e))}</p><button class="btn" id="retry">다시 시도</button>`;
    document.getElementById("retry")?.addEventListener("click", boot);
  }
}

window.addEventListener("hashchange", route);
document.getElementById("refresh").addEventListener("click", () => { if (settings.load()) boot(); });
document.getElementById("refresh").innerHTML = icon("refresh");
document.getElementById("settings-link").innerHTML = icon("gear");
document.addEventListener("visibilitychange", () => {
  // 오래 켜 두었다 다시 열면 새 커밋을 확인
  if (document.visibilityState === "visible" && state.model && Date.now() - (state.loadedAt || 0) > 10 * 60 * 1000) boot();
});
boot();
