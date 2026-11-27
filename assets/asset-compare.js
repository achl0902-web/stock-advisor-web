// 여러 계좌를 한 좌표축에서 비교한다. 수익률은 입출금을 일별로 차감한 누적 시간가중 수익률(TWR).
// 계좌를 새로 추가한 날 첫 평가액은 외부 유입으로 처리한다.
import { esc } from "./md.js";
import { dayText } from "./chart.js";

export function comparisonData(worth, keys, win, live = null, mode = "accounts") {
  if (!worth?.t?.length || !keys.length) return { dates: [], series: [] };
  const dates = worth.t;
  const start = dates.findIndex(d => d >= (win?.from || dates[0]));
  const stop = dates.findLastIndex(d => d <= (win?.to || dates.at(-1)));
  if (start < 0 || stop < start) return { dates: [], series: [] };
  const creation = Object.fromEntries(keys.map(k => [k, (worth.v?.[k] || []).findIndex(v => Number.isFinite(v))]));
  const rows = dates.slice(start, stop + 1).map((date, j) => {
    const i = start + j;
    const parts = keys.map(k => {
      if (creation[k] < 0 || i < creation[k]) return { key: k, value: null, absent: true, flow: 0 };
      return { key: k, value: worth.v?.[k]?.[i] ?? null, absent: false,
        flow: i === creation[k] ? (worth.v[k][i] ?? 0) : (worth.f?.[k]?.[i] ?? 0) };
    });
    return { date, parts };
  });
  // 지금은 모든 선택 계좌의 실제 시세 평가가 완료된 경우에만 추가한다.
  const atLatest = stop === dates.length - 1;
  if (atLatest && live && keys.every(k => Number.isFinite(live[k])) && rows.at(-1)?.date !== "지금") {
    rows.push({ date: "지금", parts: keys.map(k => ({ key: k, value: live[k], absent: false, flow: 0 })) });
  }
  const sum = parts => {
    const active = parts.filter(p => !p.absent);
    return active.length && active.every(p => Number.isFinite(p.value))
      ? active.reduce((a, p) => a + p.value, 0) : null;
  };
  const values = key => rows.map(r => key === "all"
    ? sum(r.parts)
    : (r.parts.find(p => p.key === key)?.value ?? null));
  const growth = key => {
    const out = [], vals = values(key);
    let prior = null, index = 100;
    for (let j = 0; j < rows.length; j++) {
      const v = vals[j];
      if (!Number.isFinite(v)) { out.push(null); prior = null; index = 100; continue; }
      if (prior == null) { out.push(0); prior = v; continue; }
      const flow = key === "all" ? rows[j].parts.reduce((s, p) => s + p.flow, 0)
        : rows[j].parts.find(p => p.key === key)?.flow || 0;
      if (prior <= 0) { out.push(null); prior = v; continue; }
      const r = (v - flow) / prior;
      if (!Number.isFinite(r) || r < 0) { out.push(null); prior = v; continue; }
      index *= r;
      out.push((index - 100));
      prior = v;
    }
    return out;
  };
  const labels = mode === "total" ? ["all"] : keys;
  return { dates: rows.map(r => r.date), series: labels.map(k => ({ key: k,
    values: mode === "returns" ? growth(k) : values(k) })) };
}

const LINE_COLORS = ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#008300", "#9085e9"];

// SVG에 의존성이 없도록 한 번 그리고, 마우스·터치·키보드는 아래 bindComparison에서 묶는다.
export function comparisonChart(data, names, colors = {}, { mode = "accounts", fmt = String } = {}) {
  const W = 640, H = 220, l = 12, r = 12, top = 17, bottom = 28;
  if (data.dates.length < 2 || !data.series.some(s => s.values.filter(Number.isFinite).length > 1))
    return `<p class="hint">이 구간에는 비교할 평가 기록이 충분하지 않습니다.</p>`;
  const numbers = data.series.flatMap(s => s.values).filter(Number.isFinite);
  let lo = Math.min(...numbers), hi = Math.max(...numbers);
  const padding = (hi - lo || Math.abs(hi) * .02 || 1) * .13;
  lo -= padding; hi += padding;
  const X = i => l + i / (data.dates.length - 1) * (W - l - r);
  const Y = v => top + (hi - v) / (hi - lo) * (H - top - bottom);
  const paths = data.series.map((s, n) => {
    let last = false;
    const path = s.values.map((v, i) => {
      if (!Number.isFinite(v)) { last = false; return ""; }
      const command = last ? "L" : "M";
      last = true;
      return `${command}${X(i).toFixed(2)},${Y(v).toFixed(2)}`;
    }).join(" ");
    return `<path d="${path}" stroke="${colors[s.key] || LINE_COLORS[n % LINE_COLORS.length]}" class="compare-line-path"/>`;
  }).join("");
  return `<div class="compare-plot" data-compare-plot tabindex="0" role="group" aria-label="계좌 추이 그래프. 좌우 화살표로 날짜별 금액을 확인할 수 있습니다">
    <div class="compare-y"><span>${esc(fmt(hi - padding))}</span><span>${esc(fmt(lo + padding))}</span></div>
    <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">
      ${[.25,.5,.75].map(f => `<line x1="${l}" x2="${W-r}" y1="${top + f * (H - top - bottom)}" y2="${top + f * (H - top - bottom)}" class="compare-grid"/>`).join("")}
      ${paths}<line x1="0" x2="0" y1="${top}" y2="${H-bottom}" class="compare-cross"/>
    </svg><output class="compare-tip" hidden></output>
    <div class="compare-dates"><span>${esc(dayText(data.dates[0]))}</span><span>${esc(dayText(data.dates.at(-1)))}</span></div>
    <div class="compare-legend">${data.series.map((s, n) => `<span><i style="background:${colors[s.key] || LINE_COLORS[n % LINE_COLORS.length]}"></i>${esc(names[s.key] || s.key)}</span>`).join("")}</div>
  </div>`;
}

export function bindComparison(container, data, names, fmt = String) {
  const plot = container.querySelector("[data-compare-plot]");
  if (!plot) return;
  const svg = plot.querySelector("svg"), cross = plot.querySelector(".compare-cross"), tip = plot.querySelector(".compare-tip");
  let current = data.dates.length - 1;
  const show = i => {
    current = Math.max(0, Math.min(data.dates.length - 1, i));
    const x = 12 + current / (data.dates.length - 1) * 616;
    cross.setAttribute("x1", x); cross.setAttribute("x2", x);
    plot.classList.add("is-on"); tip.hidden = false;
    tip.replaceChildren();
    const heading = document.createElement("b"); heading.textContent = dayText(data.dates[current]); tip.append(heading);
    for (const s of data.series) {
      const row = document.createElement("span");
      row.textContent = `${names[s.key] || s.key}  ${Number.isFinite(s.values[current]) ? fmt(s.values[current]) : "기록 없음"}`;
      tip.append(row);
    }
    tip.style.left = `${Math.max(16, Math.min(84, x / 640 * 100))}%`;
  };
  svg.addEventListener("pointerdown", e => {
    const box = svg.getBoundingClientRect();
    show(Math.round((e.clientX - box.left) / box.width * (data.dates.length - 1)));
  });
  svg.addEventListener("pointermove", e => {
    if (e.pointerType === "mouse") {
      const box = svg.getBoundingClientRect();
      show(Math.round((e.clientX - box.left) / box.width * (data.dates.length - 1)));
    }
  });
  svg.addEventListener("pointerleave", () => { tip.hidden = true; plot.classList.remove("is-on"); });
  plot.addEventListener("keydown", e => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    show(current + (e.key === "ArrowLeft" ? -1 : 1));
  });
  plot.addEventListener("blur", () => { tip.hidden = true; plot.classList.remove("is-on"); });
}
