/* ============================================================
   거래 태그 — memo 에 섞어 쓰던 태그를 칼럼으로 (2026-10-11)
     budget_flag    true=[생활비] / false=[생활비제외] / null=자동 판정
     claim_period   [기안:YYYY-MM]
     fx_cur · fx_amt · fx_rate · fx_provisional   FX:USD:20.00 @1374.55?
     doc_kind       'usage' = 카드사 이용내역 (memo 의 '이용내역' 문구)
   DB 트리거 tx_tags_from_memo 와 같은 규칙. 저장 직전 · 불러온 직후에 한 번씩 거친다
   (문자 파서 · 파일 파서 · 옛 데이터가 memo 에 태그를 써도 같은 결과).
   ============================================================ */
(function (root) {
  'use strict';
  const HAS_TAG = /\[생활비|\[기안:|FX:|@[0-9]|이용내역/;

  /** memo 의 태그를 칼럼으로 옮기고 memo 에서 지운 사본을 돌려준다 (원본은 그대로) */
  function fromMemo(row) {
    const m0 = row.memo || '';
    if (!HAS_TAG.test(m0)) return row;
    const r = Object.assign({}, row);
    // 칼럼에 이미 값이 있으면 칼럼이 이긴다 (앱이 칼럼으로 고친 뒤에도 옛 memo 가 남아 있을 수 있음)
    const unset = k => row[k] === null || row[k] === undefined;
    if (unset('budget_flag')) {
      if (/\[생활비제외\]/.test(m0)) r.budget_flag = false;
      else if (/\[생활비\]/.test(m0)) r.budget_flag = true;
    }
    const cl = /\[기안:(\d{4}-\d{2})\]/.exec(m0);
    if (cl && unset('claim_period')) r.claim_period = cl[1];
    const fx = /FX:([A-Z]{3}):([0-9.]+)/.exec(m0);
    if (fx && unset('fx_cur')) { r.fx_cur = fx[1]; r.fx_amt = +fx[2]; }
    const rt = /@([0-9]+(?:\.[0-9]+)?)(\?)?/.exec(m0);
    if (rt && unset('fx_rate') && (r.fx_cur || /FX:/.test(m0))) { r.fx_rate = +rt[1]; r.fx_provisional = !!rt[2]; }
    if (/이용내역/.test(m0)) r.doc_kind = 'usage';
    r.memo = m0.replace(/\[(생활비제외|생활비|기안:\d{4}-\d{2})\]/g, '')
               .replace(/FX:[A-Z]{3}:[0-9.]+/g, '')
               .replace(/@[0-9]+(?:\.[0-9]+)?\??/g, '')
               .replace(/\s+/g, ' ').replace(/^[\s·]+|[\s·]+$/g, '');
    return r;
  }

  const fxOf = t => t.fx_cur ? { cur: t.fx_cur, amt: +t.fx_amt || 0 } : null;
  const isUsage = t => t.doc_kind === 'usage';

  /* 여러 행을 한 번에 저장할 때 빠진 칼럼이 NULL 로 채워지지 않게 (fx_provisional 은 NOT NULL) */
  const withDefaults = r => Object.assign({ budget_flag: null, claim_period: null, fx_cur: null, fx_amt: null,
                                            fx_rate: null, doc_kind: null }, r, { fx_provisional: !!r.fx_provisional });

  root.Tags = { fromMemo, withDefaults, fxOf, isUsage };
})(typeof window !== 'undefined' ? window : globalThis);
