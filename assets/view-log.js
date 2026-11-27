// 기록: 판단 목록, 추천 성적표, 판단 상세.
import { DEC, ACCOUNT_ORDER, state, shownRuns, moreLeft, loadMoreRuns, ensureRun, accountLabel, accountShort, scoreSummary, verdict, MORE_PAGE } from "./store.js";
import { markdown } from "./md.js";
import { view, esc, money, nf, pct, pp, tone, dateLabel, krwShort, qtyText, seal, mark, confidence, ticket, runRow, head, subtabs, chips, bindChips, note, icon, LOG_TABS as TABS } from "./ui.js";

const PREMORTEM = { skip: "생략", pass: "통과", revise: "계획 수정", block: "중단" };

/* ---------- 판단 목록 ---------- */
let acct = "all";
let query = "";

function matchedRuns() {
  const q = query.trim().toLocaleLowerCase("ko");
  return shownRuns().filter(r => {
    if (acct !== "all" && r.accountKey !== acct) return false;
    if (!q) return true;
    const decision = DEC[r.dec?.decision]?.label || "";
    const day = r.at?.toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" }) || "";
    return [r.name, r.symbol, accountLabel(r.accountKey), day,
      day.slice(5).replace("-", "/"), day.slice(5).replace("-", "."), dateLabel(r.at, false), decision]
      .join(" ").toLocaleLowerCase("ko").includes(q);
  });
}

function renderRunResults() {
  const matches = matchedRuns();
  const days = new Map();
  for (const r of matches) {
    const k = dateLabel(r.at, false);
    if (!days.has(k)) days.set(k, []);
    days.get(k).push(r);
  }
  const target = view.querySelector("#run-results");
  if (!target) return;
  target.innerHTML = [...days].map(([d, rs]) => `<section class="day"><h2>${esc(d)}</h2><div class="panel rows">${rs.map(r => runRow(r, { time: true })).join("")}</div></section>`).join("")
    || `<p class="none">${query.trim() ? "불러온 판단에서 검색 결과가 없습니다. 검색어를 바꾸거나 이전 판단을 더 불러오세요." : "불러온 판단 중에는 이 계좌의 판단이 없습니다."}</p>`;
  view.querySelector("#run-search-summary").textContent = `전체 ${state.model.doneIds.length}건 · 불러온 ${shownRuns().length}건 중 ${matches.length}건 표시${moreLeft() ? " · 이전 판단은 아래에서 추가로 불러올 수 있습니다." : ""}`;
}

export function renderRuns(initialQuery = null) {
  if (initialQuery != null) query = String(initialQuery);
  const m = state.model;
  const done = shownRuns();
  const keys = ACCOUNT_ORDER.filter(k => done.some(r => r.accountKey === k));
  if (acct !== "all" && !keys.includes(acct)) acct = "all";
  const left = moreLeft();
  view.innerHTML = `
    ${subtabs(TABS, "runs")}
    <div class="log-intro"><h1>지난 판단</h1><p class="hint">실행 계획과 결과는 날짜별 기록에서 확인합니다. 현재 확인할 주문·관심가는 오늘에 모았습니다.</p></div>
    ${chips([["all", "전체"], ...keys.map(k => [k, accountShort(k)])], acct, "계좌")}
    <div class="log-search">
      <label for="run-search">판단 검색</label>
      <input id="run-search" type="search" inputmode="search" autocomplete="off" placeholder="종목·티커·날짜 검색" aria-controls="run-results" aria-describedby="run-search-summary" />
    </div>
    <p class="hint foot" id="run-search-summary" role="status" aria-live="polite"></p>
    <div class="run-results" id="run-results"></div>
    ${left ? `<button class="btn btn-ghost" type="button" id="more-runs">이전 판단 ${Math.min(left, MORE_PAGE)}건 더 불러오기</button>` : ""}
    ${m.collectOnly || m.refCount ? `<p class="hint foot">${[
      m.refCount ? `궁금해서 돌린 참고용 판단 ${m.refCount}건` : "",
      m.collectOnly ? `데이터만 모으고 판단까지 가지 않은 실행 ${m.collectOnly}건` : "",
    ].filter(Boolean).join("과 ")}은 뺐습니다.</p>` : ""}`;
  const search = view.querySelector("#run-search");
  search.value = query;
  search.addEventListener("input", () => { query = search.value; renderRunResults(); });
  renderRunResults();
  bindChips(v => { acct = v; renderRuns(); });
  const more = document.getElementById("more-runs");
  more?.addEventListener("click", async () => {
    more.disabled = true;
    more.textContent = "불러오는 중…";
    const y = scrollY;
    try { await loadMoreRuns(); } catch (e) { more.disabled = false; more.textContent = e?.message || "다시 시도"; return; }
    if (!more.isConnected) return; // 불러오는 사이 다른 화면으로 넘어감
    renderRuns();
    scrollTo(0, y);
  });
}

/* ---------- 성적표 ---------- */
const HORIZONS = ["5", "21", "63", "126", "now"];
const hLabel = h => (h === "now" ? "오늘까지" : `${h}거래일`);
let horizon = "now";
export function renderScore() {
  const m = state.model, sc = m.scorecard;
  const avail = new Set(sc.flatMap(s => Object.keys(s.h || {})));
  if (!avail.has(horizon)) horizon = "now";
  const ss = scoreSummary(horizon);
  const rows = sc.map(s => ({ s, x: s.h?.[horizon] })).filter(r => r.x).sort((a, b) => (b.s.at || "").localeCompare(a.s.at || ""));
  const maxAbs = Math.max(0.05, ...rows.map(r => Math.abs(r.x.excess || 0)));
  const asof = sc.map(s => s.h?.now?.date).filter(Boolean).sort().pop();
  view.innerHTML = `
    ${subtabs(TABS, "score")}
    <p class="lede">지난 판단을 결정가부터 다시 채점합니다.${asof ? ` ${esc(asof)} 종가 기준.` : ""}</p>
    <div class="seg seg-fill" role="group" aria-label="채점 기간">${HORIZONS.map(h => `<button type="button" data-h="${h}" aria-pressed="${horizon === h}" ${avail.has(h) ? "" : "disabled"}>${hLabel(h)}</button>`).join("")}</div>
    <dl class="tiles tiles-wide">
      <div><dd class="fig">${ss.hitN}<small>/${ss.hitD}</small></dd><dt>방향 적중</dt></div>
      <div><dd class="fig">${ss.holdN}<small>/${ss.holdD}</small></dd><dt>관망 적중 (안 사길 잘함)</dt></div>
      <div><dd class="fig tone-${tone(ss.dirEx)}">${pp(ss.dirEx)}</dd><dt>초과수익 평균 (방향 반영)</dt></div>
      <div><dd class="fig tone-${tone(ss.splitEffect)}">${pp(ss.splitEffect)}</dd><dt>분할·지정가 효과 (${ss.plannedN}건)</dt></div>
    </dl>
    ${ss.n < 20 ? note("20건이 안 되면 우연의 영향이 커서 경향만 참고합니다.", "soft") : ""}
    <section class="panel">
      ${head("판단별 벤치마크 대비", `<span class="hint">${ss.n}건</span>`)}
      <p class="hint">막대가 가운데 선 오른쪽이면 벤치마크보다 더 올랐습니다.</p>
      <ul class="bars">${rows.map(({ s, x }) => {
        const ex = x.excess ?? 0;
        const v = verdict(s.decision, x);
        const memo = m.notes[s.run];
        return `<li>
          <a href="#/run/${encodeURIComponent(s.run)}">
            ${mark(s.decision)}
            <span class="bar-main"><b>${esc(m.names[s.symbol] || s.name)}</b><small><span>${esc(String(s.at || "").slice(5, 10).replace("-", "/"))}</span><span>${x.days}일 경과</span><span>수익 ${pct(x.ret * 100)}</span></small></span>
            <span class="bar-val"><b class="fig tone-${tone(ex)}">${pp(ex * 100)}</b><small>${esc(v?.text || "채점 대기")}</small></span>
            <span class="plot" aria-hidden="true"><i class="plot-${tone(ex)}" style="${ex >= 0 ? "left" : "right"}:50%;width:${(Math.abs(ex) / maxAbs * 50).toFixed(2)}%"></i></span>
          </a>
          ${x.planned != null || x.mae != null ? `<p class="hint">${[
            x.mae != null ? `최대 역행 ${pct(-x.mae * 100)}` : "",
            x.planned != null ? `체결 ${pct(x.fill_rate * 100, 0, false)}${x.filled?.length ? ` (${x.filled.map(esc).join(", ")})` : ""}` : "",
            x.planned != null ? `계획대로 ${pct(x.plan_ret * 100)}${x.lump_ret != null ? ` vs 일괄 ${pct(x.lump_ret * 100)}` : ""}` : "",
            x.premortem_effect ? `부검 효과 ${pp(x.premortem_effect * 100, 2)}` : "",
            ["trim", "sell"].includes(s.decision) ? "매도 판단은 덜 오르면 적중" : "",
          ].filter(Boolean).join(", ")}</p>` : ""}
          ${memo ? `<p class="memo">${esc(memo)}</p>` : ""}
        </li>`;
      }).join("") || `<li class="none">이 기간을 채운 판단이 아직 없습니다.</li>`}</ul>
    </section>`;
  view.querySelectorAll("[data-h]").forEach(b => b.addEventListener("click", () => { horizon = b.dataset.h; renderScore(); }));
}

/* ---------- 판단 상세 ---------- */
function gradePanel(r) {
  const x = state.model.byRun[r.id]?.h?.now;
  const v = verdict(r.dec?.decision, x);
  if (!x || !v) return "";
  return `<a class="panel grade" href="#/log/score">
    <span class="grade-k">${x.days}일 뒤 채점<b class="${v.ok === true ? "tone-ok" : v.ok === false ? "tone-warn" : ""}">${esc(v.text)}</b></span>
    <dl class="tiles">
      <div><dd class="fig tone-${tone(x.excess)}">${pp(x.excess * 100)}</dd><dt>벤치마크 대비</dt></div>
      <div><dd class="fig tone-${tone(x.ret)}">${pct(x.ret * 100)}</dd><dt>판단 뒤 수익</dt></div>
      <div><dd class="fig tone-${tone(x.bench)}">${pct(x.bench * 100)}</dd><dt>벤치마크</dt></div>
    </dl>
  </a>`;
}

export async function renderRun(id) {
  let r = state.model.byId.get(id);
  if (!r) {
    view.innerHTML = `<a class="back" href="#/log">${icon("back")}기록</a><p class="none">판단을 불러오는 중…</p>`;
    const want = location.hash;
    r = await ensureRun(id);
    if (location.hash !== want) return; // 불러오는 사이 다른 화면으로 넘어감
  }
  if (!r) { view.innerHTML = `<p class="none">이 판단을 찾지 못했습니다. <a href="#/log">기록으로 돌아가기</a></p>`; return; }
  const d = DEC[r.dec?.decision];
  const plan = r.plan || {};
  const pm = r.premortem;
  const facts = [
    plan.weight_after_pct != null && ["주문 뒤 비중", `${nf(2).format(plan.weight_after_pct)}%`],
    plan.qty_after != null && ["전부 체결 시 보유", qtyText(plan.qty_after, plan.qty_unit) + (plan.goal_pct_after != null ? ` (목표의 ${nf(1).format(plan.goal_pct_after)}%)` : "")],
    plan.planned_krw != null && ["계획 금액", krwShort(plan.planned_krw)],
    plan.trim_zone?.price && ["비중 축소 구간", `${money(plan.trim_zone.price, plan.currency)} 이상`],
    plan.fx_conversion_needed_usd && ["환전 필요", `$${nf(2).format(plan.fx_conversion_needed_usd)}`],
    pm && ["사전 부검", PREMORTEM[pm.verdict] || pm.verdict],
  ].filter(Boolean);
  view.innerHTML = `
    <a class="back" href="#/log">${icon("back")}기록</a>
    <div class="run">
      <div class="col">
        <section class="hero hero-${d?.tone || "flat"}">
          <div class="hero-top">
            ${seal(r.dec?.decision)}
            <span class="hero-id">
              <span class="hero-when"><span>${dateLabel(r.at)} 데이터</span><span>${esc(accountLabel(r.accountKey))}</span></span>
              <h1>${esc(r.name)}</h1>
              <span class="hero-meta"><b class="tone-${d?.tone || "flat"}">${esc(d?.label || r.dec?.decision || "")}</b><span class="fig">${money(r.price, r.currency)}</span>${confidence(r.dec?.confidence)}</span>
            </span>
          </div>
          <p class="hint">${esc(r.symbol)}${r.exchange ? `, ${esc(r.exchange)}` : ""}${r.reference ? ". 궁금해서 돌린 참고용 판단이라 판단 일지·성적표에서 빠져 있습니다." : ""}</p>
        </section>
        ${gradePanel(r)}
        <section class="panel">
          ${head("주문", plan.session ? `<span class="hint">${esc(plan.session)}</span>` : "")}
          ${ticket(plan)}
          ${facts.length ? `<dl class="facts">${facts.map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join("")}</dl>` : ""}
          ${(plan.notes || []).map(n => note(n)).join("")}
        </section>
        <div id="checks"></div>
      </div>
      <article class="panel report" id="report"><p class="none">리포트를 불러오는 중…</p></article>
    </div>`;
  const runShell = view.querySelector(".run");
  const rep = runShell.querySelector("#report");
  const checksNode = runShell.querySelector("#checks");
  const [md, checks] = await Promise.all([
    state.repo.text(`runs/${id}/report.md`).catch(() => null),
    state.repo.json(`runs/${id}/checks.json`).catch(() => null),
  ]);
  if (!runShell.isConnected || location.hash !== `#/run/${encodeURIComponent(id)}`) return; // 다른 판단으로 바뀌면 오래된 응답을 폐기
  if (Array.isArray(checks) && checks.length) {
    const bad = checks.filter(c => !c.ok);
    checksNode.innerHTML = `<details class="panel checks" ${bad.length ? "open" : ""}>
      <summary><h2>최종 점검</h2><span class="${bad.length ? "tone-warn" : "hint"}">${bad.length ? `확인 필요 ${bad.length}건` : `${checks.length}개 모두 통과`}</span></summary>
      <ul>${checks.map(c => `<li class="${c.ok ? "ok" : "bad"}">${icon(c.ok ? "ok" : "warn")}<span><b>${esc(c.item)}</b>${c.detail ? ` ${esc(c.detail)}` : ""}</span></li>`).join("")}</ul>
    </details>`;
  }
  if (!md) { rep.innerHTML = `<p class="none">리포트 파일이 없습니다.</p>`; return; }
  const lines = md.split("\n");
  const start = lines.findIndex(l => /^\*\*(결론|핵심 근거)\*\*/.test(l));
  rep.innerHTML = `<h2>판단 근거</h2>${markdown(start > 0 ? lines.slice(start).join("\n") : md)}`;
}
