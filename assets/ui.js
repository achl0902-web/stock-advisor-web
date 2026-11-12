// 화면 공통 조각: 숫자·날짜 표기, 도장, 판단 표시, 주문 티켓, 아이콘.
import { esc } from "./md.js";
import { DEC, state, accountLabel, verdict } from "./store.js";

export { esc };
export const view = document.getElementById("view");

/* ---------- 숫자 표기 ---------- */
export const nf = (d = 0) => new Intl.NumberFormat("ko-KR", { minimumFractionDigits: d, maximumFractionDigits: d });
export function money(v, cur) {
  if (v == null || isNaN(v)) return "–";
  if (cur === "USD") return "$" + nf(2).format(v);
  return nf(0).format(Math.round(v)) + "원";
}
// 수량: 주식은 정수 주, 코인은 소수점(최대 8자리) + 코인 기호
const nfQty = new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 8 });
export const qtyText = (q, unit) => !unit || unit === "주" ? nf(0).format(q) + "주" : `${nfQty.format(q)} ${unit}`;
export function usdShort(v) {
  if (v == null || isNaN(v)) return "–";
  const a = Math.abs(v), s = v < 0 ? "−" : "";
  if (a >= 1e6) return s + "$" + (a / 1e6).toFixed(2).replace(/\.?0+$/, "") + "M";
  if (a >= 1e4) return s + "$" + (a / 1e3).toFixed(1).replace(/\.0$/, "") + "K";
  return s + "$" + nf(0).format(Math.round(a));
}
export function krwShort(v) {
  if (v == null || isNaN(v)) return "–";
  const a = Math.abs(v);
  if (a >= 1e8) return (v / 1e8).toFixed(a >= 1e9 ? 1 : 2).replace(/\.?0+$/, "") + "억원";
  if (a >= 1e4) return nf(0).format(Math.round(v / 1e4)) + "만원";
  return nf(0).format(Math.round(v)) + "원";
}
export function pct(v, d = 1, sign = true) {
  if (v == null || isNaN(v)) return "–";
  return (v > 0 && sign ? "+" : v < 0 ? "−" : "") + nf(d).format(Math.abs(v)) + "%";
}
export function pp(v, d = 1) {
  if (v == null || isNaN(v)) return "–";
  return (v > 0 ? "+" : v < 0 ? "−" : "") + nf(d).format(Math.abs(v)) + "%p";
}
export const tone = v => (v > 0 ? "up" : v < 0 ? "down" : "flat");

const KST = { timeZone: "Asia/Seoul" };
export function dateLabel(d, withTime = true) {
  if (!d) return "–";
  const md = d.toLocaleDateString("ko-KR", { ...KST, month: "numeric", day: "numeric", weekday: "short" });
  return withTime ? `${md} ${timeLabel(d)}` : md;
}
// 목록용 짧은 날짜: "11/11 19:33"
export const shortDate = d => `${d.toLocaleDateString("ko-KR", { ...KST, month: "numeric", day: "numeric" }).replace(/\. ?/g, "/").replace(/\/$/, "")} ${timeLabel(d)}`;
export const timeLabel = d => d.toLocaleTimeString("ko-KR", { ...KST, hour: "2-digit", minute: "2-digit", hour12: false });
export function ago(d) {
  const s = (Date.now() - d.getTime()) / 1000;
  if (s < 90) return "방금";
  if (s < 3600) return `${Math.round(s / 60)}분 전`;
  if (s < 86400) return `${Math.round(s / 3600)}시간 전`;
  return `${Math.round(s / 86400)}일 전`;
}
// "2026-12-31" → 오늘부터 며칠 남았는지 (D-49, 오늘, 3일 지남)
export function dday(date, today) {
  const n = Math.round((Date.parse(date) - Date.parse(today)) / 86400000);
  return n > 0 ? `D-${n}` : n === 0 ? "오늘" : `${-n}일 지남`;
}
// 현재가에서 그 가격까지의 거리: "5.4% 아래", "10.7% 위"
export const distText = d => `${nf(1).format(Math.abs(d))}% ${d < 0 ? "아래" : "위"}`;

/* ---------- 아이콘 ---------- */
export function icon(name) {
  const p = {
    ok: '<path d="M4 10.5l4 4 8-9" />',
    warn: '<path d="M10 3.5l7.5 13h-15z" /><path d="M10 8.5v3.5M10 14.2v.3" />',
    back: '<path d="M12.5 4l-6 6 6 6" />',
    next: '<path d="M7.5 4l6 6-6 6" />',
    gear: '<circle cx="10" cy="10" r="2.6"/><path d="M10 2.5v2.2M10 15.3v2.2M2.5 10h2.2M15.3 10h2.2M4.7 4.7l1.6 1.6M13.7 13.7l1.6 1.6M4.7 15.3l1.6-1.6M13.7 6.3l1.6-1.6"/>',
    refresh: '<path d="M16 10a6 6 0 1 1-1.8-4.3" /><path d="M16.2 3.5v3.3h-3.3" />',
  }[name];
  return `<svg class="ic" viewBox="0 0 20 20" aria-hidden="true">${p}</svg>`;
}

/* ---------- 도장: 최신 판단·상세에만 크게 찍는다 ---------- */
export function seal(decision) {
  const d = DEC[decision] || { label: decision || "?", seal: [...String(decision || "?").slice(0, 2)], tone: "flat" };
  return sealChars(d.seal, d.tone, d.label);
}
export function sealChars(chars, toneName, label) {
  return `<span class="seal seal-${toneName} ${chars.length === 4 ? "four" : "two"}" role="img" aria-label="${esc(label || chars.join(""))}">${chars.map(c => `<i>${esc(c)}</i>`).join("")}</span>`;
}
// 목록용 작은 판단 표시. 도장은 작으면 뭉개져서 글자 두 자로 쓴다.
export function mark(decision) {
  const d = DEC[decision];
  return `<span class="mark mark-${d?.tone || "flat"}" title="${esc(d?.label || decision || "")}">${esc(d?.mark || "?")}</span>`;
}
export function confidence(n) {
  if (!n) return "";
  return `<span class="conf" role="img" aria-label="확신도 ${n}/5">${[1, 2, 3, 4, 5].map(i => `<b class="${i <= n ? "on" : ""}"></b>`).join("")}<span aria-hidden="true">확신도 ${n}/5</span></span>`;
}

/* ---------- 주문 티켓: 넣을 주문과 그 아래 기다리는 관심가 ---------- */
export function ticket(plan) {
  const cur = plan?.currency;
  const orders = (plan?.orders || []).map(o => {
    const sell = o.side === "sell";
    return `<li class="tk">
      <span class="mark mark-${sell ? "down" : "up"}">${sell ? "매도" : "매수"}</span>
      <span class="tk-leg">${esc(o.leg)}${o.zone?.low ? `<small>${money(o.zone.low, cur)}~${money(o.zone.high, cur)} 구간</small>` : ""}</span>
      <span class="tk-price"><b class="fig">${money(o.limit_price, cur)}</b><small>지정가</small></span>
      <span class="tk-amt"><b class="fig">${qtyText(o.qty, plan.qty_unit)}</b><small>${money(o.amount_local, cur)}${cur === "USD" ? ` (약 ${krwShort(o.amount_krw)})` : ""}</small></span>
    </li>`;
  });
  const watch = (plan?.watch || []).filter(w => (w.center ?? w.price) != null).map(w => `<li class="tk tk-watch">
      <span class="mark mark-flat">대기</span>
      <span class="tk-leg">${esc(w.leg)}${w.odds?.touch_pct != null ? `<small>${w.odds.days}거래일 안 도달 ${nf(0).format(w.odds.touch_pct)}%</small>` : ""}</span>
      <span class="tk-price"><b class="fig">${money(w.center ?? w.price, cur)}</b><small>관심가</small></span>
    </li>`);
  if (!orders.length && !watch.length) return `<p class="none">이번 판단에는 주문이 없습니다.</p>`;
  return `${orders.length ? "" : `<p class="none">지금 넣을 주문은 없습니다. 아래 가격에 닿으면 다시 봅니다.</p>`}<ul class="ticket">${orders.join("")}${watch.join("")}</ul>`;
}

/* ---------- 판단 한 줄: 왼쪽 판단, 오른쪽 채점 결과(없으면 판단 때 가격) ---------- */
export function runRow(r, { time = false } = {}) {
  const d = DEC[r.dec?.decision];
  const sc = state.model.byRun[r.id];
  const x = sc?.h?.now;
  const v = verdict(r.dec?.decision, x);
  const side = x && v
    ? `<span class="fig tone-${tone(x.excess)}">${pp(x.excess * 100)}</span><small>${esc(v.text)}</small>`
    : `<span class="fig">${money(r.price, r.currency)}</span><small>${sc ? "채점 대기" : "판단 때 가격"}</small>`;
  return `<a class="rr" href="#/run/${encodeURIComponent(r.id)}">
    ${mark(r.dec?.decision)}
    <span class="rr-main"><b>${esc(r.name)}</b><small><span>${esc(accountLabel(r.accountKey))}</span><span>${time ? timeLabel(r.at) : shortDate(r.at)}</span><span class="sr">${esc(d?.label || "")}</span></small></span>
    <span class="rr-side">${side}</span>
  </a>`;
}

/* ---------- 묶음 머리, 탭 안 갈래, 거르기 칩, 알림 줄 ---------- */
export const head = (title, right = "") => `<div class="panel-h"><h2>${esc(title)}</h2>${right}</div>`;
export const moreLink = (href, text) => `<a class="more" href="${href}">${esc(text)}${icon("next")}</a>`;

// 탭 안의 갈래 (기록: 판단·성적 / 자산: 계좌·관심가·ETF). items: [href, 이름, id]
export function subtabs(items, current) {
  return `<nav class="seg" aria-label="보기">${items.map(([href, label, id]) =>
    `<a href="${href}" ${id === current ? 'aria-current="page"' : ""}>${esc(label)}</a>`).join("")}</nav>`;
}
// 거르기 칩. items: [값, 이름]. 누르면 data-chip 값을 onPick에 넘긴다(bindChips).
export function chips(items, current, label) {
  return `<div class="chips" role="group" aria-label="${esc(label)}">${items.map(([v, t]) =>
    `<button type="button" class="chip" data-chip="${esc(v)}" aria-pressed="${v === current}">${esc(t)}</button>`).join("")}</div>`;
}
export function bindChips(onPick) {
  view.querySelectorAll("[data-chip]").forEach(b => b.addEventListener("click", () => onPick(b.dataset.chip)));
}

export const note = (text, cls = "") => `<p class="note ${cls}">${icon("warn")}<span>${esc(text)}</span></p>`;
