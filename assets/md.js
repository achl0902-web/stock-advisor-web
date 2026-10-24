// 작은 마크다운 렌더러. 리포트·ETF 문서에 쓰이는 문법만 다룬다.
// 원문은 전부 이스케이프하고, 링크는 http(s)만 허용한다.

export function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function safeUrl(u) {
  try {
    const url = new URL(u);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
  } catch { return null; }
}

// 뉴스 링크는 구글 뉴스 리다이렉트라 길다. 화면에는 출처 이름만 보인다.
export function inline(text) {
  let s = esc(text);
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, label, href) => {
    const u = safeUrl(href.replace(/&amp;/g, "&"));
    return u ? `<a href="${esc(u)}" target="_blank" rel="noopener noreferrer">${label}</a>` : label;
  });
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/`([^`]+)`/g, "<code>$1</code>");
  return s;
}

function table(lines) {
  const rows = lines.map(l => l.trim().replace(/^\||\|$/g, "").split("|").map(c => c.trim()));
  const head = rows[0];
  const body = rows.slice(2);
  const num = c => /^[+\-−]?[\d,.]+(%|%p)?$/.test(c);
  return `<div class="table-scroll"><table class="md-table"><thead><tr>${head.map(h => `<th>${inline(h)}</th>`).join("")}</tr></thead><tbody>${
    body.map(r => `<tr>${r.map((c, i) => `<td class="${i && num(c) ? "num" : ""}">${inline(c)}</td>`).join("")}</tr>`).join("")
  }</tbody></table></div>`;
}

export function markdown(src) {
  const lines = String(src || "").replace(/\r/g, "").split("\n");
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    let m;
    if ((m = line.match(/^(#{1,4})\s+(.*)$/))) {
      const lv = Math.min(m[1].length + 1, 5);
      out.push(`<h${lv}>${inline(m[2])}</h${lv}>`);
      i++; continue;
    }
    // 한 줄 전체가 굵은 글씨면 소제목으로 본다 (리포트의 **결론**, **핵심 근거** 등)
    if ((m = line.match(/^\*\*([^*]+)\*\*\s*(.*)$/)) && (!m[2] || /^[—:-]/.test(m[2]))) {
      out.push(`<h4>${inline(m[1])}</h4>`);
      if (m[2]) out.push(`<p>${inline(m[2].replace(/^[—:-]\s*/, ""))}</p>`);
      i++; continue;
    }
    if (line.trim().startsWith("|") && lines[i + 1] && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1])) {
      const block = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) block.push(lines[i++]);
      out.push(table(block));
      continue;
    }
    if (/^\s*[-*]\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*[-*]\s+/, ""));
      out.push(`<ul>${items.map(t => `<li>${inline(t)}</li>`).join("")}</ul>`);
      continue;
    }
    const para = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,4}\s|\s*[-*]\s+|\s*\|)/.test(lines[i]) && !/^\*\*[^*]+\*\*\s*$/.test(lines[i])) {
      para.push(lines[i++]);
    }
    if (!para.length) { out.push(`<p>${inline(line)}</p>`); i++; continue; }
    out.push(`<p>${para.map(inline).join("<br>")}</p>`);
  }
  return out.join("\n");
}
