// 오늘: 최신 판단과 주문, 걸어 둔 주문, 가까운 관심가, 다가오는 날짜, QLD 전략 상태, 성적 요약.
import { DEC, state, accountLabel, accountShort, levelItems, levelLabel, levelNote, nearest, upcoming, scoreSummary, todayKST } from "./store.js";
import { view, esc, money, nf, pp, tone, dateLabel, dday, distText, seal, confidence, ticket, runRow, head, moreLink, icon } from "./ui.js";

const QLD_PAGE = "https://achl0902-web.github.io/back-testing/qld/";

function hero(r) {
  if (!r) return `<section class="panel"><p class="none">아직 끝난 판단이 없습니다. Claude에게 종목 분석을 요청하면 여기에 나타납니다.</p></section>`;
  const d = DEC[r.dec.decision];
  const href = `#/run/${encodeURIComponent(r.id)}`;
  return `<section class="hero hero-${d?.tone || "flat"}">
    <a class="hero-top" href="${href}">
      ${seal(r.dec.decision)}
      <span class="hero-id">
        <span class="hero-when"><span>${dateLabel(r.at)}</span><span>${esc(accountLabel(r.accountKey))}</span></span>
        <h1>${esc(r.name)}</h1>
        <span class="hero-meta"><b class="tone-${d?.tone || "flat"}">${esc(d?.label || r.dec.decision)}</b><span class="fig">${money(r.price, r.currency)}</span>${confidence(r.dec.confidence)}</span>
      </span>
    </a>
    ${r.dec.gist ? `<p class="gist">${esc(r.dec.gist)}</p>` : ""}
    ${ticket(r.plan)}
    ${moreLink(href, "근거와 점검 보기")}
  </section>`;
}

// 넣었지만 체결을 확인하기 전인 주문 (config/open_orders.json)
function ordersPanel() {
  const m = state.model;
  if (!m.openOrders.length) return "";
  const today = todayKST();
  return `<section class="panel panel-accent">
    ${head("걸어 둔 주문", `<span class="hint">체결 확인 전 ${m.openOrders.length}건</span>`)}
    <ul class="ticket">${m.openOrders.map(o => {
      const cur = o.market === "US" ? "USD" : "KRW";
      const sell = o.side === "sell";
      return `<li class="tk">
        <span class="mark mark-${sell ? "down" : "up"}">${sell ? "매도" : "매수"}</span>
        <span class="tk-leg">${esc(m.names[o.code] || o.name || o.code)}<small>${esc(o.account || "")}${o.expires ? `, ${dday(o.expires, today)} 만료` : ""}</small></span>
        <span class="tk-price"><b class="fig">${money(o.limit, cur)}</b><small>지정가</small></span>
        <span class="tk-amt"><b class="fig">${nf(0).format(o.qty)}주</b></span>
      </li>`;
    }).join("")}</ul>
  </section>`;
}

// 현재가에서 가장 가까운 관심가. 막대는 20% 밖이면 비고 닿을수록 찬다.
function nearPanel(items) {
  // 종목마다 가장 가까운 선 하나만
  const seen = new Set();
  const rows = nearest(items, state.model.quotes, 99).filter(r => !seen.has(r.item) && seen.add(r.item)).slice(0, 5);
  if (!rows.length) return "";
  return `<section class="panel">
    ${head("가까운 관심가", moreLink("#/assets/levels", "전체"))}
    <ul class="near">${rows.map(({ item, level, quote, dist, reached }) => `<li>
      <a href="#/assets/levels">
        <span class="near-main"><b>${esc(item.name)}</b><small><span>${esc(levelLabel(level.msg))}</span><span>${esc(accountShort(item.account))}</span></small></span>
        <span class="near-side"><b class="fig">${money(level.price, item.currency)}</b><small class="${reached ? "tone-warn" : ""}">${reached ? "닿음, 확인 필요" : `지금 ${money(quote.price, item.currency)}에서 ${distText(dist)}`}</small></span>
        <span class="meter ${level.op === "<=" ? "meter-down" : "meter-up"}" aria-hidden="true"><i style="width:${reached ? 100 : Math.max(4, 100 - Math.abs(dist) * 5).toFixed(0)}%"></i></span>
      </a>
    </li>`).join("")}</ul>
  </section>`;
}

function datesPanel(items) {
  const rows = upcoming(items, 3);
  if (!rows.length) return "";
  const today = todayKST();
  return `<section class="panel">
    ${head("다가오는 날짜")}
    <ul class="dates">${rows.map(d => `<li class="${d.date <= today ? "due" : ""}">
      <span class="dday fig">${dday(d.date, today)}</span>
      <span class="dates-main"><b>${esc(d.item.name)}</b><small>${esc(d.date.slice(5).replace("-", "/"))} ${esc(levelLabel(d.msg))}</small><p>${esc(levelNote(d.msg))}</p></span>
    </li>`).join("")}</ul>
  </section>`;
}

function strategyPanel() {
  const s = state.strategy;
  if (!s) return "";
  const out = s.regime === "out";
  const leaving = s.regime === "in" && s.next === "out";
  const returning = out && s.next === "in";
  const title = leaving ? "다음 거래일 이탈 예정" : returning ? "다음 거래일 복귀 예정" : out ? "이탈 중 (SGOV 대기)" : "QLD 보유 유지";
  const axes = ["변동성", "급락", "주봉 추세", "급팽창"];
  return `<section class="panel strategy ${out || leaving ? "is-out" : ""}">
    ${head("QLD 챔피언 전략", `<a class="more" href="${QLD_PAGE}" target="_blank" rel="noopener noreferrer">백테스터${icon("next")}</a>`)}
    <p class="st-state">${title}</p>
    <ul class="axes" aria-label="기술 축 ${s.votes ?? 0}/4 켜짐">${axes.map((a, i) => `<li class="${s.axes?.[i] ? "on" : ""}"><i></i>${a}<span class="sr">${s.axes?.[i] ? " 켜짐" : " 꺼짐"}</span></li>`).join("")}</ul>
    <p class="hint">${esc(s.date || "")} 미국 종가 기준. 기술 축 ${s.votes ?? 0}/4 켜짐, 매크로 경보 ${s.macro != null ? Math.round(s.macro * 100) : "–"}%.</p>
  </section>`;
}

function scorePanel() {
  const ss = scoreSummary();
  if (!ss.n) return "";
  return `<section class="panel">
    ${head("추천 성적", moreLink("#/log/score", "자세히"))}
    <dl class="tiles">
      <div><dd class="fig">${ss.hitN}<small>/${ss.hitD}</small></dd><dt>방향 적중</dt></div>
      <div><dd class="fig tone-${tone(ss.dirEx)}">${pp(ss.dirEx)}</dd><dt>평균 초과수익</dt></div>
      <div><dd class="fig tone-${tone(ss.splitEffect)}">${pp(ss.splitEffect)}</dd><dt>분할·지정가 효과</dt></div>
    </dl>
  </section>`;
}

export function renderHome() {
  const done = state.model.runs.filter(r => r.done);
  const items = levelItems();
  view.innerHTML = `<div class="home">
    <div class="col">
      ${hero(done[0])}
      ${ordersPanel()}
      <section class="panel">
        ${head("최근 판단", moreLink("#/log", `전체 ${done.length}건`))}
        <div class="rows">${done.slice(1, 6).map(r => runRow(r)).join("") || `<p class="none">이전 판단이 없습니다.</p>`}</div>
      </section>
    </div>
    <div class="col">
      ${nearPanel(items)}
      ${datesPanel(items)}
      ${strategyPanel()}
      ${scorePanel()}
    </div>
  </div>`;
}
