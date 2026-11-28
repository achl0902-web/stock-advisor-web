// 오늘: 가격 확인 전에 '지금 확인할 일'을 먼저 보여 주는 일일 점검판.
import { state, accountGroup, accountView, accountShort, levelItems, nearest, upcoming, quoteStatus, shownRuns, todayKST } from "./store.js";
import { mergedView } from "./portfolio-merge.js";
import { esc, view, head, money, krwShort, dateLabel, dday, distText, icon } from "./ui.js";
import { strategyPanel } from "./view-home.js";

const marketLevels = "#/market/levels";
const dayOnly = d => d ? d.toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }) : "알 수 없음";

function wealthSummary() {
  const keys = accountGroup(state.model.accounts, false);
  const views = keys.map(accountView);
  const rows = keys.map((key, i) => ({ key, value: views[i].total }));
  const total = views.length ? mergedView(views).total : null;
  return `<section class="panel today-wealth">
    ${head("운용 계좌", `<a class="more" href="#/assets">자산 전체 보기${icon("next")}</a>`)}
    <div class="today-total fig">${total == null ? "평가액 확인 중" : krwShort(total)}</div>
    <p class="hint">주 계좌·바이오 등 운용 계좌 합계입니다. DC·코인은 자산 화면에서 별도로 선택해 더할 수 있습니다.</p>
    <div class="today-accounts">${rows.map(r => `<span>${esc(accountShort(r.key))} <b class="fig">${r.value == null ? "–" : krwShort(r.value)}</b></span>`).join("")}</div>
  </section>`;
}

function actionSummary() {
  const m = state.model, today = todayKST();
  const levels = nearest(levelItems(), m.quotes, 200)
    .sort((a, b) => Number(b.reached) - Number(a.reached) || Math.abs(a.dist) - Math.abs(b.dist));
  const seen = new Set();
  const alerts = levels.filter(x => !seen.has(x.item.code) && seen.add(x.item.code)).slice(0, 3);
  const orders = m.openOrders.filter(o => !o.expires || o.expires >= today)
    .sort((a, b) => (a.expires || "9999-12-31").localeCompare(b.expires || "9999-12-31")).slice(0, 3);
  const dates = upcoming(levelItems(), 2);
  return `<section class="panel today-actions">
    ${head("확인할 항목", `<span class="hint">중요 상태 우선</span>`)}
    ${alerts.length ? `<h3>관심가</h3><ul class="today-list">${alerts.map(x => `<li><a href="${marketLevels}/${encodeURIComponent(x.item.code)}">
      <span><b>${esc(x.item.name)}</b><small>${esc(String(x.level.msg || "").split(":")[0])}</small></span>
      <span class="today-result ${x.reached ? "tone-warn" : ""}">${x.reached ? "조건 도달 · 확인" : distText(x.dist)}${icon("next")}</span>
    </a></li>`).join("")}</ul>` : `<p class="hint">가격이 확인된 미도달 관심가가 없습니다.</p>`}
    ${orders.length ? `<h3>체결 확인 전 주문</h3><ul class="today-list">${orders.map(o => `<li><a class="today-order-action" href="#/log/search/${encodeURIComponent(o.code)}" aria-label="${esc(o.name || m.names[o.code] || o.code)} 관련 판단 기록 찾기">
      <span><b>${esc(o.name || m.names[o.code] || o.code)}</b><small>${o.side === "sell" ? "매도" : "매수"} · ${esc(o.account || "")} · 관련 판단 보기</small></span>
      <span class="today-result"><b class="fig">${money(o.limit, o.market === "US" ? "USD" : "KRW")}${icon("next")}</b>${o.expires ? `<small>${dday(o.expires, today)} 만료</small>` : ""}</span>
    </a></li>`).join("")}</ul>` : ""}
    ${dates.length ? `<h3>관심 일정</h3><ul class="today-list">${dates.map(d => `<li class="today-order"><span><b>${esc(d.item.name)}</b><small>${esc(d.msg)}</small></span><span class="today-result">${dday(d.date, today)}</span></li>`).join("")}</ul>` : ""}
  </section>`;
}

function judgmentSummary() {
  const r = shownRuns()[0];
  if (!r) return "";
  return `<section class="panel today-judgment">
    ${head("최근 판단", `<a class="more" href="#/log">기록 보기${icon("next")}</a>`)}
    <a class="today-latest" href="#/run/${encodeURIComponent(r.id)}"><span><b>${esc(r.name)}</b><small>${dateLabel(r.at)} · ${esc(accountShort(r.accountKey))}</small></span><span>${esc(r.dec.gist || r.dec.decision || "판단 보기")}${icon("next")}</span></a>
  </section>`;
}

function eventsPanel(items) {
  const now = todayKST();
  const next = (items || []).filter(x => x.date >= now).slice(0, 4);
  if (!next.length) return `<p class="hint">예정된 주요 일정이 없습니다.</p>`;
  return `<ul class="today-list">${next.map(x => `<li class="today-order"><span><b>${esc(x.title)}</b><small>${esc(x.kind)} · ${esc(x.date)}${x.time ? ` ${esc(x.time)}` : ""}</small></span><span class="today-result">${dday(x.date, now)}</span></li>`).join("")}</ul>`;
}

export function renderToday() {
  const status = quoteStatus(state.model), stamp = status.asof ? `${dayOnly(status.asof)} 수집` : "시세 수집 이력 없음";
  view.innerHTML = `<div class="today-page">
    <div class="today-heading"><h1>오늘</h1><p>자산을 확인하고, 대응이 필요한 일부터 살펴보세요.</p></div>
    <p class="today-fresh ${status.level === "error" || status.level === "old" ? "tone-warn" : ""}" role="status">${icon(status.level === "error" ? "warn" : "refresh")} ${esc(stamp)}${status.level === "old" ? " · 최신 시세가 아닐 수 있습니다" : ""}${status.stale.length ? ` · ${status.stale.length}종목 시세 지연(${esc(status.stale.map(x => x.sym).join("·"))})` : ""}${status.errors.filter(x => !status.stale.some(s => s.sym === x)).length ? ` · 일부 수집 실패 ${status.errors.filter(x => !status.stale.some(s => s.sym === x)).length}건` : ""}</p>
    ${wealthSummary()}
    ${actionSummary()}
    ${strategyPanel()}
    ${judgmentSummary()}
    <section class="panel today-events">${head("주요 시장 일정", `<span class="hint">가까운 일정 4건</span>`)}<div data-today-events><p class="hint">일정을 불러오는 중…</p></div></section>
  </div>`;
  const target = view.querySelector("[data-today-events]");
  state.repo.raw("reports/events.json").then(doc => {
    if (target?.isConnected) target.innerHTML = eventsPanel(doc?.items);
  }).catch(() => {
    if (target?.isConnected) target.innerHTML = `<p class="hint">일정을 가져오지 못했습니다.</p>`;
  });
}
