// 평가 기록에 실제로 존재하는 날짜만 선택한다. 날짜 문자열은 ISO YYYY-MM-DD 오름차순이다.
// 두 손잡이와 선택 구간은 반드시 동일한 [0, count-1] 좌표계를 사용한다.
export function rangePercent(index, count) {
  return count > 1 ? Math.max(0, Math.min(count - 1, index)) / (count - 1) * 100 : 0;
}

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

// 거래일·수집 누락일을 건너뛰어도 '7일'은 기록 7개가 아닌 달력상 7일이다.
export function shiftDateIndexByDays(dates, index, days) {
  if (!dates.length || index < 0 || index >= dates.length) return -1;
  const [year, month, day] = dates[index].split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
  return closestDateIndex(dates, date);
}
