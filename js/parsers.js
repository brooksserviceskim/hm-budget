/* ============================================================
   명세서 파일 파서
   - 삼성카드 월 명세서 (.xlsx)  : 일시불 / 할부 / 결제 취소내역
   - 기업은행 입출금 내역 (.xls) : 출금 · 입금
   ============================================================ */
(function (root) {
  'use strict';
  const C = root.Categorize;

  const num = v => {
    if (v === null || v === undefined) return 0;
    if (typeof v === 'number') return v;
    const s = String(v).replace(/,/g, '').replace(/[^\d.\-]/g, '').trim();
    const n = parseFloat(s);
    return isNaN(n) ? 0 : n;
  };
  const yyyymmdd = v => {
    const s = String(v).replace(/\D/g, '');
    if (s.length < 8) return null;
    return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  };
  const S = v => String(v ?? '').replace(/\s+/g, ' ').trim();

  // 동일 (일자·가맹점·금액) 이 반복될 때를 위한 일련번호 부여
  function fpFactory() {
    const cnt = new Map();
    return (parts) => {
      const base = parts.join('|');
      const n = (cnt.get(base) || 0) + 1;
      cnt.set(base, n);
      return `${base}|${n}`;
    };
  }


  /* ============================================================
     기업은행 거래 분류 (계좌번호 · 적요 기반)
     kind: expense | income | transfer(내부이체 → 집계 제외)
     ============================================================ */
  const IBK_ACCT = {
    '100079250649': ['금융·대출', '신용대출 상환(토스)'],
    '110466704948': ['금융·대출', '주택담보대출 상환(신한)'],
    '202038691351': ['저축·보험', '보험비(수협)'],
    '223047006770': ['저축·보험', '주택청약저축']
  };

  // 적요가 사람 이름뿐이라 무엇인지 알 수 없는 은행 거래의 표시 이름
  const BANK_LABEL = {
    '신용대출 상환(토스)': '신용대출 상환 (토스)',
    '주택담보대출 상환(신한)': '주택담보대출 상환 (신한)',
    '보험비(수협)': '보험비 (수협)',
    '주택청약저축': '주택청약저축',
    '배우자 생활비 이체': '배우자 생활비 이체',
    '카드대금': '카드 결제대금',
    '세금': '세금·공과금 납부'
  };

  function classifyBank(row) {
    const desc = S(row.desc), cp = S(row.cp), acct = S(row.acct).replace(/\D/g, '');
    const t = `${desc} ${cp}`;
    const inAmt = row.in || 0, outAmt = row.out || 0;

    /* ---------- 입금 ---------- */
    if (inAmt > 0) {
      if (inAmt < 100) return null;                                   // 1원 인증 등
      if (/삼성카드|현대카드|신한카드|국민카드|롯데카드/.test(t))         // 카드사 환불
        return { kind: 'transfer', category: '이체·용돈', subcategory: '카드 환불' };
      if (/^토뱅|토스뱅크|카카오뱅크|신한은행|국민은행|하나은행/.test(cp) && /김현우/.test(desc))
        return { kind: 'transfer', category: '이체·용돈', subcategory: '본인 계좌 이체' };
      if (/^김현우\s*$/.test(desc) && /김현우/.test(cp))
        return { kind: 'transfer', category: '이체·용돈', subcategory: '본인 계좌 이체' };

      let src = '기타 수입';
      if (/월급여|급여/.test(t)) src = '급여소득';
      else if (/루트\s*8\s*2|루트８２/.test(t)) src = '업무비용 환급';
      else if (/플래니어|에스시홀딩|SC ?홀딩/.test(t)) src = '급여소득';
      else if (/브룩스|brooks/i.test(t)) src = '사업소득';
      else if (/DB손보|디비손해|손해보험|한화손|삼성화재/.test(t)) src = '보험금 환급';
      else if (/결산|이자/.test(t)) src = '이자 · 배당';
      return { kind: 'income', category: '수입', subcategory: src, income_src: src };
    }

    /* ---------- 출금 ---------- */
    if (outAmt <= 0) return null;
    if (IBK_ACCT[acct]) return { kind: 'expense', category: IBK_ACCT[acct][0], subcategory: IBK_ACCT[acct][1],
                                 label: BANK_LABEL[IBK_ACCT[acct][1]] };
    // 삼성카드 대금은 카드 명세서와 중복 → 집계 제외
    if (/삼성카드/.test(t)) return { kind: 'expense', category: '금융·대출', subcategory: '카드대금', memo: '카드 명세서와 중복(집계 제외)' };
    // 현대카드는 별도 명세서가 없으므로 차량 관련 비용으로 계상 (자동차 보험 · 할부)
    if (/현대카드|코스트코현대/.test(t)) return { kind: 'expense', category: '교통·운송', subcategory: '자동차(현대카드)' };
    if (/홍미란/.test(desc))
      return { kind: 'expense', category: '이체·용돈', subcategory: '배우자 생활비 이체' };
    if (/김현우/.test(desc) && (!acct || /토뱅|토스뱅크|카카오뱅크/.test(t)))
      return { kind: 'transfer', category: '이체·용돈', subcategory: '본인 계좌 이체' };
    if (/국세|지방세|인천[가-힣]*구|시청|구청|세무서/.test(t)) return { kind: 'expense', category: '세금·공과금', subcategory: '세금' };
    if (/손보|손해보험|화재|생명|한화손|삼성화\d|DB손/.test(t)) return { kind: 'expense', category: '저축·보험', subcategory: '보험' };
    if (/수수료|SMS통지/.test(t)) return { kind: 'expense', category: '기타상품·서비스', subcategory: '공공/수수료' };
    if (/적금|청약|예금|저축/.test(t)) return { kind: 'expense', category: '저축·보험', subcategory: '저축' };
    if (/카카오페이|네이버페이|토스페이/.test(t)) return { kind: 'expense', category: '기타상품·서비스', subcategory: '간편결제' };
    // 개인 이름으로 보내는 소액 = 경조사 · 용돈
    if (/^[가-힣]{2,4}$/.test(desc)) return { kind: 'expense', category: '이체·용돈', subcategory: '경조사/개인 송금' };
    return { kind: 'expense', category: '기타상품·서비스', subcategory: '기타' };
  }

  function rowFrom(o) {
    const cat = o.category ? { category: o.category, sub: o.subcategory || '', workHint: false }
                           : C.categorize(o.merchant);
    return {
      kind: o.kind || 'expense',
      source: o.source,
      tx_date: o.tx_date,
      merchant: (o.kind === 'income' ? o.merchant : C.normalizeMerchant(o.merchant)),
      amount: Math.round(o.amount),
      raw_amount: Math.round(o.raw_amount ?? o.amount),
      benefit: Math.round(o.benefit || 0),
      category: cat.category,
      subcategory: cat.sub,
      income_src: o.income_src || null,
      is_work: !!o.is_work,
      installment: o.installment || '',
      bill_month: o.bill_month ?? null,
      memo: o.memo || '',
      fingerprint: o.fingerprint,
      _workHint: !!cat.workHint
    };
  }

  /** 삼성카드 명세서 파싱 */
  function parseSamsung(wb, fileName) {
    const out = [];
    const fp = fpFactory();
    const mm = (fileName.match(/(\d{1,2})\s*월/) || [])[1];
    const billMonth = mm ? parseInt(mm, 10) : null;

    for (const name of wb.SheetNames) {
      const isCancel = name.includes('취소');
      const isCard = name.includes('일시불') || name.includes('할부');
      if (!isCard && !isCancel) continue;               // 해외이용 시트는 일시불에 이미 포함 → 제외
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: '' });

      for (let i = 3; i < rows.length; i++) {
        const r = rows[i];
        const date = yyyymmdd(r[0]);
        if (!date) continue;
        const merchant = S(r[2]);
        if (!merchant || merchant.startsWith('미리입금') || merchant.includes('합계')) continue;

        if (isCancel) {
          const amt = num(r[4]);
          if (!amt) continue;
          out.push(rowFrom({
            source: 'samsung_card', tx_date: date, merchant, amount: amt, raw_amount: amt,
            bill_month: billMonth, memo: '결제 취소',
            fingerprint: fp(['sc', 'cancel', date, merchant, amt])
          }));
        } else {
          const amt = num(r[9]);                        // 원금 = 할인 반영 후 실제 청구액
          if (!amt) continue;
          const inst = S(r[7]) && S(r[8]) ? `${S(r[8])}/${S(r[7])}` : '';
          out.push(rowFrom({
            source: 'samsung_card', tx_date: date, merchant,
            amount: amt, raw_amount: num(r[3]) || amt, benefit: Math.abs(num(r[6])),
            installment: inst, bill_month: billMonth,
            fingerprint: fp(['sc', date, merchant, amt])
          }));
        }
      }
    }
    return out;
  }

  /** 기업은행 입출금 내역 파싱 */
  function parseIbk(wb) {
    const out = [];
    const fp = fpFactory();
    const sh = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sh, { header: 1, defval: '' });

    for (const r of rows) {
      const raw = String(r[0] ?? '');
      const d = raw.match(/(\d{4})[-.\/](\d{2})[-.\/](\d{2})/);
      if (!d) continue;
      const rec = {
        d: `${d[1]}-${d[2]}-${d[3]}`, out: num(r[1]), in: num(r[2]),
        desc: S(r[4]), acct: S(r[6]), cp: S(r[11])
      };
      const row = bankRow(rec, fp);
      if (row) out.push(row);
    }
    return out;
  }

  /** 은행 원본 1건 → 저장 레코드 (업로드 · 시드 공통) */
  function bankRow(rec, fp) {
    const c = classifyBank(rec);
    if (!c) return null;
    const amt = c.kind === 'income' ? rec.in : (rec.out || rec.in);
    return rowFrom({
      kind: c.kind, source: 'bank', tx_date: rec.d,
      merchant: (c.kind === 'income' ? (rec.desc || rec.cp) : (c.label || BANK_LABEL[c.subcategory] || rec.desc || rec.cp)),
      amount: amt, raw_amount: amt, category: c.category, subcategory: c.subcategory,
      income_src: c.income_src || null, memo: c.memo || '',
      fingerprint: fp(['ibk', c.kind === 'income' ? 'in' : 'out', rec.d, rec.desc, amt])
    });
  }

  /** 쿠팡 주문내역 CSV (주문일,주문번호,상품명,수량,금액) */
  function parseCoupang(wb) {
    const sh = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sh, { header: 1, defval: '' });
    if (!rows.length) return [];
    const head = rows[0].map(h => S(h));
    const ix = n => head.findIndex(h => h.includes(n));
    const cD = ix('주문일'), cO = ix('주문번호'), cN = ix('상품명'), cQ = ix('수량'), cP = ix('금액');
    if (cD < 0 || cN < 0) return [];
    const fp = fpFactory();
    const out = [];
    for (const r of rows.slice(1)) {
      const d = S(r[cD]).replace(/[.\/]/g, '-').slice(0, 10);
      const name = S(r[cN]);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || !name) continue;
      const qty = Math.max(1, Math.round(num(r[cQ])) || 1);
      const price = Math.round(num(r[cP]));
      const orderNo = cO >= 0 ? S(r[cO]) : '';
      out.push({
        order_date: d, order_no: orderNo, name, qty, price,
        category: C.coupangCategory(name), memo: '',
        fingerprint: fp(['cp', d, name, price, qty, orderNo])
      });
    }
    return out;
  }

  /** 확장자/시트 이름으로 자동 판별 */
  function parseWorkbook(wb, fileName) {
    const names = wb.SheetNames.join(',');
    // 쿠팡 CSV 먼저 확인
    try {
      const first = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' })[0] || [];
      const h = first.map(x => S(x)).join(',');
      if (h.includes('상품명') && h.includes('주문일'))
        return { type: '쿠팡 주문내역', kind: 'coupang', rows: parseCoupang(wb) };
    } catch (e) { /* 무시 */ }
    if (/일시불|할부/.test(names)) return { type: '삼성카드 명세서', rows: parseSamsung(wb, fileName) };
    if (/거래내역|입출식/.test(names)) return { type: '기업은행 입출금 내역', rows: parseIbk(wb) };
    // 시트 이름을 못 믿을 때는 첫 셀 모양으로 추정
    return { type: '기업은행 입출금 내역(추정)', rows: parseIbk(wb) };
  }

  root.Parsers = { parseWorkbook, parseSamsung, parseIbk, parseCoupang, rowFrom, fpFactory, classifyBank, bankRow, BANK_LABEL };
})(window);
