/* ============================================================
   업무비용 환급 입금 ↔ 기안 자동 매칭 (2026-10-11)
   루트82 가 익월 10일쯤 기업은행으로 돌려준다. 입금은 income_src '업무비용 환급'.
   · 입금액 = 기안 1건 또는 여러 건의 합 (정확히 같을 때만) → 자동 '환급완료'
   · 금액이 다르면 제안만 (다른 돈과 합쳐 들어오는 달이 있었음: 7/10 458,780 ↔ 6월 기안 251,780)
   대상 기안은 '기안완료' 만. '미기안' 은 아직 회사에 안 올린 것이라 건드리지 않는다.
   ============================================================ */
(function (root) {
  'use strict';
  const SRC = '업무비용 환급';
  const isRefund = t => t.kind === 'income' && (t.income_src === SRC || t.subcategory === SRC);
  const since = c => c.filed_date || `${c.period}-01`;
  const dayDiff = (a, b) => Math.round((new Date(a) - new Date(b)) / 86400000);

  /** 합이 target 인 부분집합 — 건수가 적은 것 우선, 같으면 오래된 기안 우선 */
  function subsetSum(items, target) {
    const n = Math.min(items.length, 12);
    let best = null;
    for (let mask = 1; mask < (1 << n); mask++) {
      let s = 0, pick = [];
      for (let i = 0; i < n; i++) if (mask & (1 << i)) { s += +items[i].amount || 0; pick.push(items[i]); }
      if (s !== target) continue;
      if (!best || pick.length < best.length) best = pick;
    }
    return best;
  }

  /**
   * @param claims   work_claims 행들
   * @param txs      거래 전체
   * @returns { auto: [{ dep, claims }], suggest: [{ dep, claim, diff }] }
   */
  function match(claims, txs) {
    const usedDates = new Set(claims.filter(c => c.status === '환급완료' && c.paid_date).map(c => c.paid_date));
    const deps = txs.filter(t => isRefund(t) && !usedDates.has(t.tx_date))
                    .sort((a, b) => a.tx_date < b.tx_date ? -1 : 1);
    let open = claims.filter(c => c.status === '기안완료' && +c.amount > 0)
                     .sort((a, b) => a.period < b.period ? -1 : 1);
    const auto = [], suggest = [];
    for (const dep of deps) {
      const ok = open.filter(c => since(c) <= dep.tx_date);
      if (!ok.length) continue;
      const hit = subsetSum(ok, Math.round(+dep.amount));
      if (hit) {
        auto.push({ dep, claims: hit });
        open = open.filter(c => !hit.includes(c));
        continue;
      }
      const c = ok[0];                                     // 가장 오래된 기안
      if (dayDiff(dep.tx_date, since(c)) <= 75)
        suggest.push({ dep, claim: c, diff: Math.round(+dep.amount) - Math.round(+c.amount) });
    }
    return { auto, suggest };
  }

  root.Refund = { match, isRefund, SRC };
})(typeof window !== 'undefined' ? window : globalThis);
