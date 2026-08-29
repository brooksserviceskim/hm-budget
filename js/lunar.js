/* ============================================================
   음력 ↔ 양력 변환 (2020~2060)
   data/lunar.js 의 미리 계산된 표를 사용합니다.
   ============================================================ */
(function (root) {
  'use strict';
  const T = root.__LUNAR__ || {};
  const pad = n => String(n).padStart(2, '0');
  const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parse = s => new Date(s + 'T00:00:00');
  const addDays = (d, n) => new Date(d.getTime() + n * 86400000);

  const MIN_Y = 2020, MAX_Y = 2060;

  /** 음력 → 양력. leap=true 면 윤달. 없으면 null */
  function toSolar(year, month, day, leap) {
    const y = T[year];
    if (!y) return null;
    let base;
    if (leap) {
      if (y.lm !== month || !y.ld) return null;
      base = y.ld;
    } else {
      base = y.m[month - 1];
    }
    if (!base) return null;
    return ymd(addDays(parse(base), day - 1));
  }

  /** 양력 → 음력 { year, month, day, leap } */
  function toLunar(solarStr) {
    const target = parse(solarStr).getTime();
    for (let year = MAX_Y; year >= MIN_Y; year--) {
      const y = T[year];
      if (!y) continue;
      // 그 해 음력 월들을 (시작일, 월, 윤달여부) 로 모아 정렬
      const list = [];
      for (let m = 1; m <= 12; m++) if (y.m[m - 1]) list.push({ s: parse(y.m[m - 1]).getTime(), m, leap: false });
      if (y.ld) list.push({ s: parse(y.ld).getTime(), m: y.lm, leap: true });
      list.sort((a, b) => a.s - b.s);
      if (!list.length || target < list[0].s) continue;
      for (let i = list.length - 1; i >= 0; i--) {
        if (target >= list[i].s) {
          const day = Math.round((target - list[i].s) / 86400000) + 1;
          if (day <= 31) return { year, month: list[i].m, day, leap: list[i].leap };
        }
      }
    }
    return null;
  }

  /** 음력 기념일의 '올해 또는 내년' 양력 날짜 (오늘 지난 건 내년으로) */
  function nextSolar(month, day, leap, fromDate) {
    const today = fromDate ? parse(fromDate) : new Date();
    today.setHours(0, 0, 0, 0);
    for (let k = 0; k <= 2; k++) {
      const y = today.getFullYear() + k;
      let s = toSolar(y, month, day, leap);
      if (!s && leap) s = toSolar(y, month, day, false);   // 그 해에 윤달이 없으면 평달로
      if (!s) continue;
      if (parse(s) >= today) return s;
    }
    return null;
  }

  const label = (month, day, leap) => `음력 ${leap ? '윤' : ''}${month}월 ${day}일`;

  root.LunarKit = { toSolar, toLunar, nextSolar, label, MIN_Y, MAX_Y };
})(window);
