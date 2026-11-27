// 자산 화면 차트: 도넛(나눠진 몫)과 평가액 추이 선. SVG를 직접 그리고, 선은 누르거나 올리면 그날 값을 보여 준다.
import { esc } from "./md.js";

// 색은 몫의 이름을 따라간다(순위가 아니라 순서대로). 다크 패널 두 테마에서 색각 이상 구분 검사를 통과한 순서.
export const SERIES = ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#008300", "#9085e9"];
export const CASH = "var(--dim)";

/* ---------- 도넛: slices [{label, value, color}], 가운데 글자 두 줄 ---------- */
export function donut(slices, { size = 160, center = "", sub = "" } = {}) {
  const total = slices.reduce((s, x) => s + Math.max(0, x.value || 0), 0);
  const r = 50, w = 14, c = 2 * Math.PI * r;
  const gap = slices.length > 1 ? 1.2 : 0; // 조각 사이 바탕색 틈
  let at = 0;
  const arcs = total ? slices.map(x => {
    const len = Math.max(0, x.value) / total * c;
    const seg = `<circle r="${r}" cx="60" cy="60" fill="none" stroke="${x.color}" stroke-width="${w}"
      stroke-dasharray="${Math.max(0, len - gap).toFixed(2)} ${(c - Math.max(0, len - gap)).toFixed(2)}" stroke-dashoffset="${(-at).toFixed(2)}"
      ><title>${esc(x.label)}</title></circle>`;
    at += len;
    return seg;
  }).join("") : `<circle r="${r}" cx="60" cy="60" fill="none" stroke="var(--raised)" stroke-width="${w}"/>`;
  return `<figure class="donut" style="--size:${size}px" role="img" aria-label="${esc(slices.map(x => `${x.label} ${total ? Math.round(x.value / total * 100) : 0}%`).join(", "))}">
    <svg viewBox="0 0 120 120" aria-hidden="true"><g transform="rotate(-90 60 60)">${arcs}</g></svg>
    <figcaption><b class="fig">${esc(center)}</b>${sub ? `<small>${esc(sub)}</small>` : ""}</figcaption>
  </figure>`;
}

// "2026-11-02" → 올해면 "11/02", 다른 해면 "25.11.02"
const kstYear = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Seoul", year: "numeric" });
export function dayText(d) {
  if (d === "지금") return d;
  return d.slice(0, 4) === kstYear.format(new Date()) ? d.slice(5).replace("-", "/") : d.slice(2).replaceAll("-", ".");
}

/* ---------- 추이 선: points [{t: "2026-11-02", v, p?}], 비는 날은 끊는다. p(투자원금)가 있으면 점선으로 함께 ---------- */
const charts = new Map();
let seq = 0;

export function line(points, { height = 150, fmt = String, marks = [], label = "" } = {}) {
  const id = `ln${++seq}`;
  const vals = points.map(p => p.v).filter(v => v != null);
  if (vals.length < 2) return `<p class="hint">추이를 그릴 만큼 기록이 아직 없습니다.</p>`;
  const refs = points.map(p => p.p).filter(v => v != null);
  const W = 600, H = height, pad = { t: 10, r: 8, b: 22, l: 8 };
  let lo = Math.min(...vals, ...refs), hi = Math.max(...vals, ...refs);
  const span = hi - lo || hi * 0.02 || 1;
  lo -= span * 0.12; hi += span * 0.12;
  const x = i => pad.l + (points.length === 1 ? 0 : i / (points.length - 1)) * (W - pad.l - pad.r);
  const y = v => pad.t + (1 - (v - lo) / (hi - lo)) * (H - pad.t - pad.b);
  // 이어진 구간마다 선과 옅은 면
  const runs = [];
  let cur = [];
  points.forEach((p, i) => { if (p.v == null) { if (cur.length) runs.push(cur); cur = []; } else cur.push(i); });
  if (cur.length) runs.push(cur);
  const path = r => r.map((i, k) => `${k ? "L" : "M"}${x(i).toFixed(1)},${y(points[i].v).toFixed(1)}`).join("");
  const area = r => `${path(r)}L${x(r.at(-1)).toFixed(1)},${H - pad.b}L${x(r[0]).toFixed(1)},${H - pad.b}Z`;
  const grid = [0.25, 0.5, 0.75].map(f => pad.t + f * (H - pad.t - pad.b));
  // 투자원금은 입출금이 있는 날만 바뀌는 계단
  const refPath = refs.length ? points.map((p, i) => p.p == null ? "" : `${i && points[i - 1].p != null ? `L${x(i).toFixed(1)},${y(points[i - 1].p).toFixed(1)}L` : "M"}${x(i).toFixed(1)},${y(p.p).toFixed(1)}`).join("") : "";
  const last = points.length - 1 - [...points].reverse().findIndex(p => p.v != null);
  // 점은 SVG가 가로로 늘어나도 동그랗게 남도록 HTML로 얹는다
  const pos = i => `left:${(x(i) / W * 100).toFixed(2)}%;top:${(y(points[i].v) / H * 100).toFixed(2)}%`;
  charts.set(id, { points, fmt, marks, W, H, xs: points.map((_, i) => x(i)), ys: points.map(p => p.v == null ? null : y(p.v)) });
  const latest = points[last];
  return `<div class="line" data-line="${id}" role="group" aria-label="${esc(label)}. 날짜를 터치하거나 좌우 방향키로 탐색할 수 있습니다.">
    <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="${esc(label)}">
      ${grid.map(g => `<line class="ln-grid" x1="${pad.l}" x2="${W - pad.r}" y1="${g}" y2="${g}"/>`).join("")}
      ${runs.map(r => `<path class="ln-area" d="${area(r)}"/>`).join("")}
      ${refPath ? `<path class="ln-ref" d="${refPath}"/>` : ""}
      ${runs.map(r => `<path class="ln-path" d="${path(r)}"/>`).join("")}
      <line class="ln-cross" x1="0" x2="0" y1="${pad.t}" y2="${H - pad.b}"/>
    </svg>
    ${marks.map(m => { const i = points.findIndex(p => p.t === m.t); return i < 0 || points[i].v == null ? "" : `<i class="ln-pt ln-mark" style="${pos(i)}" title="${esc(m.label)}"></i>`; }).join("")}
    <i class="ln-pt ln-end" style="${pos(last)}"></i>
    <i class="ln-pt ln-dot" hidden></i>
    <span class="ln-x"><span>${dayText(points[0].t)}</span><span>${dayText(points[last].t)}</span></span>
    <span class="ln-y"><span class="fig">${esc(fmt(hi - span * 0.12))}</span><span class="fig">${esc(fmt(lo + span * 0.12))}</span></span>
    <output class="ln-tip" hidden></output>
  </div>
  <div class="ln-inspect" role="group" aria-label="차트 기록 날짜 탐색">
    <button type="button" data-line-step="-1" aria-label="이전 기록 날짜">이전</button>
    <output class="ln-selected" aria-live="polite" aria-atomic="true"><span>${esc(dayText(latest.t))}</span><b class="fig">${esc(fmt(latest.v))}</b>${latest.p != null ? `<small class="fig">원금 ${esc(fmt(latest.p))}</small>` : ""}</output>
    <button type="button" data-line-step="1" aria-label="다음 기록 날짜" disabled>다음</button>
  </div>`;
}

// 그린 뒤 한 번 부른다: 포인터·키보드로 가장 가까운 날을 짚어 값을 보여 준다
export function bindLines(root) {
  const live = new Set([...root.querySelectorAll("[data-line]")].map(el => el.dataset.line));
  for (const k of charts.keys()) if (!live.has(k)) charts.delete(k); // 사라진 화면의 차트
  root.querySelectorAll("[data-line]").forEach(el => {
    const c = charts.get(el.dataset.line);
    if (!c) return;
    const svg = el.querySelector("svg"), cross = el.querySelector(".ln-cross"), dot = el.querySelector(".ln-dot"), tip = el.querySelector(".ln-tip");
    const inspector = el.nextElementSibling;
    const output = inspector?.querySelector(".ln-selected");
    const prev = inspector?.querySelector('[data-line-step="-1"]');
    const next = inspector?.querySelector('[data-line-step="1"]');
    const valid = c.points.map((p, i) => p.v == null ? -1 : i).filter(i => i >= 0);
    if (!valid.length) return;
    let idx = valid.at(-1);
    const step = direction => {
      const nextIdx = direction < 0 ? valid.findLast(i => i < idx) : valid.find(i => i > idx);
      if (nextIdx != null) show(nextIdx);
    };
    const show = i => {
      // 비어 있는 날짜는 가까운 유효 거래일로 정렬한다. 이전/다음은 값이 있는 날만 이동한다.
      if (c.points[i]?.v == null) i = valid.reduce((best, j) => Math.abs(j - i) < Math.abs(best - i) ? j : best);
      idx = i;
      const p = c.points[i], X = c.xs[i];
      cross.setAttribute("x1", X); cross.setAttribute("x2", X);
      dot.hidden = false;
      dot.style.left = `${X / c.W * 100}%`; dot.style.top = `${c.ys[i] / c.H * 100}%`;
      el.classList.add("is-on");
      tip.hidden = false;
      tip.textContent = "";
      const b = document.createElement("b"); b.className = "fig"; b.textContent = c.fmt(p.v);
      const r = p.p != null ? Object.assign(document.createElement("small"), { textContent: `원금 ${c.fmt(p.p)}` }) : null;
      const s = document.createElement("small");
      const m = c.marks.find(x => x.t === p.t);
      s.textContent = dayText(p.t) + (m ? ` ${m.label}` : "");
      tip.append(b, ...(r ? [r] : []), s);
      const left = X / c.W * 100;
      tip.style.left = `${Math.min(82, Math.max(18, left))}%`;
      if (output) {
        output.replaceChildren();
        const date = document.createElement("span"); date.textContent = dayText(p.t);
        const value = document.createElement("b"); value.className = "fig"; value.textContent = c.fmt(p.v);
        output.append(date, value);
        if (p.p != null) { const principal = document.createElement("small"); principal.className = "fig"; principal.textContent = `원금 ${c.fmt(p.p)}`; output.append(principal); }
      }
      if (prev) prev.disabled = idx === valid[0];
      if (next) next.disabled = idx === valid.at(-1);
    };
    const hide = () => { tip.hidden = true; }; // 읽어 둔 날짜와 선택 점은 유지한다.
    const pick = e => {
      const r = svg.getBoundingClientRect();
      if (!r.width) return;
      const fraction = (e.clientX - r.left) / r.width;
      show(Math.max(0, Math.min(c.points.length - 1, Math.round(fraction * (c.points.length - 1)))));
    };
    el.addEventListener("pointermove", e => { if (e.pointerType !== "touch" || e.buttons === 1) pick(e); });
    el.addEventListener("pointerdown", pick);
    el.addEventListener("pointerleave", e => { if (e.pointerType === "mouse") hide(); });
    el.tabIndex = 0;
    el.addEventListener("keydown", e => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
      e.preventDefault();
      if (e.key === "Home") show(valid[0]);
      else if (e.key === "End") show(valid.at(-1));
      else step(e.key === "ArrowLeft" ? -1 : 1);
    });
    el.addEventListener("blur", hide);
    prev?.addEventListener("click", () => step(-1));
    next?.addEventListener("click", () => step(1));
  });
}
