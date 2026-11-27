// 평가 기록에 실제로 존재하는 날짜만 선택한다. 날짜 문자열은 ISO YYYY-MM-DD 오름차순이다.
export function closestDateIndex(dates, target) {
  if (!dates.length) return -1;
  if (!target || target <= dates[0]) return 0;
  if (target >= dates.at(-1)) return dates.length - 1;
  let lo = 0, hi = dates.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (dates[mid] < target) lo = mid + 1;
    else hi = mid;
  }
  const prev = lo - 1;
  return Date.parse(target) - Date.parse(dates[prev]) <= Date.parse(dates[lo]) - Date.parse(target) ? prev : lo;
}

// 고른 경계가 반대쪽을 넘어가면 사용자가 옮긴 경계를 우선한다.
export function normalizeDateRange(dates, from, to, changed = "to") {
  if (!dates.length) return { start: -1, end: -1, from: null, to: null };
  let start = closestDateIndex(dates, from);
  let end = closestDateIndex(dates, to || dates.at(-1));
  if (start > end) {
    if (changed === "from") end = start;
    else start = end;
  }
  return { start, end, from: dates[start], to: dates[end] };
}
