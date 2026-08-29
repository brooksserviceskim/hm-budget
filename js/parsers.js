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

  /** 기업은행 입출금 내역 파싱
   *  - "거래용" : 헤더 없는 BIFF 파일 (열 위치 고정)
   *  - "출력용" : 헤더가 있는 HTML 표 (열 이름으로 매핑, 날짜가 엑셀 일련번호)
   */
  const pad2s = n => String(n).padStart(2, '0');
  function serialToYmd(n) {
    const d = new Date(Math.round((n - 25569) * 86400000));
    return `${d.getUTCFullYear()}-${pad2s(d.getUTCMonth() + 1)}-${pad2s(d.getUTCDate())}`;
  }
  function anyDate(v) {
    if (typeof v === 'number' && v > 20000 && v < 80000) return serialToYmd(v);
    const m = String(v ?? '').match(/(\d{4})[-.\/](\d{2})[-.\/](\d{2})/);
    return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
  }

  function parseIbk(wb) {
    const out = [];
    const fp = fpFactory();

    for (const name of wb.SheetNames) {
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: '' });
      if (!rows.length) continue;

      // 헤더 행 찾기 (출력용)
      let hi = -1;
      for (let i = 0; i < Math.min(8, rows.length); i++) {
        const line = rows[i].map(x => S(x)).join('|');
        if (/거래일시|거래일자/.test(line) && /출금/.test(line) && /입금/.test(line)) { hi = i; break; }
      }

      if (hi >= 0) {
        const head = rows[hi].map(x => S(x));
        const col = (...names) => {
          for (const n of names) {
            const i = head.findIndex(h => h.replace(/\s/g, '') === n);
            if (i >= 0) return i;
          }
          for (const n of names) {
            const i = head.findIndex(h => h.replace(/\s/g, '').includes(n));
            if (i >= 0) return i;
          }
          return -1;
        };
        const cD = col('거래일시', '거래일자'), cOut = col('출금'), cIn = col('입금');
        const cDesc = col('거래내용', '적요'), cAcct = col('상대계좌번호', '계좌번호'),
              cCp = col('상대계좌예금주명', '상대예금주', '예금주');
        for (const r of rows.slice(hi + 1)) {
          const d = anyDate(r[cD]);
          if (!d) continue;
          const rec = { d, out: num(r[cOut]), in: num(r[cIn]),
                        desc: S(r[cDesc]), acct: S(r[cAcct]), cp: S(r[cCp]) };
          const row = bankRow(rec, fp);
          if (row) out.push(row);
        }
      } else {
        // 헤더 없는 구형 포맷
        for (const r of rows) {
          const d = anyDate(r[0]);
          if (!d) continue;
          const rec = { d, out: num(r[1]), in: num(r[2]),
                        desc: S(r[4]), acct: S(r[6]), cp: S(r[11]) };
          const row = bankRow(rec, fp);
          if (row) out.push(row);
        }
      }
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


  /* ============================================================
     현대카드 이용대금 명세서 (PDF)
     - 이메일로 오는 HTML 명세서를 PDF로 인쇄한 파일
     - 줄 단위로 재구성한 뒤 "MM.DD" 로 시작하는 블록을 거래 1건으로 본다
     ============================================================ */
  const HY_SKIP = /일부결제금액|소\s*계|총\s*합계|이용일|가맹점|결제 상세|회원 정보|이용한도|본 메일|문의사항/;
  // 줄바꿈으로 쪼개진 카드 표기 토큰들 ("현대카" + "드" 등)
  const HY_STOP = new Set(['본인','가족','현대카드','현대카','현대','카드','드','하이패스',
                           '코현대카드','코현대카','코스트코현대카드','코스트코현대카','코스트코',
                           '코','체크','M포인트','포인트']);
  const isCardTok = t => HY_STOP.has(t) || /^Ed\d*$/i.test(t);

  /** 줄 배열 → 거래 배열 (테스트 가능한 순수 함수) */
  function parseHyundaiLines(lines, year, month) {
    const fp = fpFactory();
    const out = [];
    let buf = null;

    const flush = () => {
      if (!buf) return;
      const txt = clean2(buf);
      buf = null;
      const md = txt.match(/^(\d{2})[.\-\/](\d{2})\s+(.*)$/);
      if (!md) return;
      const mm = +md[1], dd = +md[2];
      // "0002건" 같은 건수 표기는 금액 판정 전에 제거
      let rest = md[3].replace(/\d{1,5}\s*건/g, ' ');

      // 금액 : 첫 번째 유효 금액 (0으로 시작하는 "0004" 같은 건수 코드는 제외)
      const am = rest.match(/([1-9][0-9,]{2,})/);
      if (!am) return;
      const amount = Number(am[1].replace(/,/g, ''));
      if (!amount) return;

      // 가맹점 : 금액 앞부분에서 카드 표기 토큰을 걷어낸 나머지
      let head = rest.slice(0, am.index)
        .split(/\s+/).filter(t => t && !isCardTok(t) && !/^\d+$/.test(t)).join(' ');
      head = clean2(head);
      if (!head || HY_SKIP.test(head)) return;

      // 연도 : 명세서 기준월보다 뒤면 전년도
      let y = year;
      if (month && mm > month) y = year - 1;
      const d = `${y}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;

      const r = rowFrom({
        source: 'hyundai_card', tx_date: d, merchant: head,
        amount, raw_amount: amount,
        memo: '현대카드 명세서',
        fingerprint: fp(['hd', d, head, amount])
      });
      delete r._workHint;
      out.push(r);
    };

    for (const raw of lines) {
      const ln = clean2(raw);
      if (!ln) continue;
      if (/^\d{2}[.\-\/]\d{2}\s/.test(ln)) { flush(); buf = ln; continue; }
      if (buf) {
        if (HY_SKIP.test(ln)) { flush(); continue; }
        buf += ' ' + ln;
      }
    }
    flush();
    return out;
  }
  const clean2 = t => String(t || '').replace(/\s+/g, ' ').trim();

  /** PDF 파일 → 거래 배열 (pdf.js 로 텍스트를 좌표 기준 줄로 재구성) */
  async function parsePdf(buf) {
    const lib = window.pdfjsLib;
    if (!lib) throw new Error('PDF 라이브러리를 불러오지 못했습니다');
    lib.GlobalWorkerOptions.workerSrc =
      'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';

    const doc = await lib.getDocument({ data: buf }).promise;
    const lines = [];
    let year = new Date().getFullYear(), month = 0;

    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const tc = await page.getTextContent();
      // y 좌표로 줄 묶기 → x 순서로 정렬
      const rows = new Map();
      for (const it of tc.items) {
        if (!it.str || !it.str.trim()) continue;
        const y = Math.round(it.transform[5]);
        const key = Math.round(y / 3);           // 3pt 오차 허용
        if (!rows.has(key)) rows.set(key, []);
        rows.get(key).push({ x: it.transform[4], s: it.str });
      }
      [...rows.entries()].sort((a, b) => b[0] - a[0]).forEach(([, arr]) => {
        lines.push(arr.sort((a, b) => a.x - b.x).map(o => o.s).join(' '));
      });
    }

    const head = lines.join(' ');
    const ym = head.match(/(20\d{2})\s*년\s*(\d{1,2})\s*월/);
    if (ym) { year = +ym[1]; month = +ym[2]; }

    return parseHyundaiLines(lines, year, month);
  }

  /** 확장자/시트 이름으로 자동 판별 */

  /* ============================================================
     삼성카드 홈페이지 "이용내역" 다운로드 (국내 / 해외)
       국내 : 승인일자 · 가맹점명 · 승인금액(원) · 할부 · 승인번호 · 취소여부
       해외 : 승인일자 · 가맹점명 · 승인금액(USD) · 현지이용금액 · 현지거래통화
     ============================================================ */
  function parseSamsungUsage(wb) {
    const out = []; const fp = fpFactory();

    for (const sn of wb.SheetNames) {
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1, defval: '' });
      if (rows.length < 2) continue;
      const head = rows[0].map(x => S(x));
      const col = re => head.findIndex(h => h && re.test(h));

      const cLocal = col(/현지거래통화/);
      const cDate  = col(/승인일자/);
      const cMer   = col(/가맹점명/);
      if (cDate < 0 || cMer < 0) continue;

      /* ---------- 해외 ---------- */
      if (cLocal >= 0) {
        const cAmt = col(/현지이용금액/), cUsd = col(/승인금액/), cCx = col(/취소구분/);
        for (const r of rows.slice(1)) {
          const d = anyDate(r[cDate]); if (!d) continue;
          if (cCx >= 0 && /취소/.test(S(r[cCx]))) continue;
          const merchant = S(r[cMer]); if (!merchant) continue;
          const cur = S(r[cLocal]).toUpperCase();
          const fxAmt = num(r[cAmt]);
          if (!cur || !fxAmt) continue;
          const usd = num(r[cUsd]);
          out.push(rowFrom({
            source: 'samsung_card', tx_date: d, merchant,
            amount: 0, raw_amount: 0,            // 원화는 앱이 결제일 환율로 채운다
            memo: `삼성카드 해외 · FX:${cur}:${fxAmt.toFixed(2)}` + (usd ? ` (USD ${usd})` : ''),
            fingerprint: fp(['sscu-fx', d, merchant, cur, fxAmt.toFixed(2)])
          }));
        }
        continue;
      }

      /* ---------- 국내 ---------- */
      const cAmt  = col(/승인금액/), cInst = col(/할부개월/),
            cType = col(/일시불할부구분/), cNo = col(/승인번호/), cCx = col(/취소여부/);
      if (cAmt < 0) continue;

      // 승인취소된 건은 원승인 건까지 같이 뺀다 (승인번호 + 금액으로 짝짓기)
      const cancelled = new Set();
      for (const r of rows.slice(1)) {
        const cx = cCx >= 0 ? S(r[cCx]) : '';
        const amt = num(r[cAmt]);
        if (/취소/.test(cx) || amt < 0) cancelled.add(`${S(r[cNo])}|${Math.abs(Math.round(amt))}`);
      }

      for (const r of rows.slice(1)) {
        const d = anyDate(r[cDate]); if (!d) continue;
        const merchant = S(r[cMer]); if (!merchant) continue;
        const amt = num(r[cAmt]); if (!amt) continue;
        if (cancelled.has(`${S(r[cNo])}|${Math.abs(Math.round(amt))}`)) continue;
        let installment = '';
        if (cType >= 0 && /할부/.test(S(r[cType])) && !/일시불/.test(S(r[cType]))) {
          const m = cInst >= 0 ? num(r[cInst]) : 0;
          installment = m ? `${m}개월` : '할부';
        }
        out.push(rowFrom({
          source: 'samsung_card', tx_date: d, merchant, amount: amt, installment,
          memo: '삼성카드 이용내역',
          fingerprint: fp(['sscu', d, merchant, Math.round(amt), S(r[cNo])])
        }));
      }
    }
    return out;
  }

  /* ============================================================
     카드사 홈페이지 "이용내역" 다운로드 파일 (범용)
     삼성카드 / KB국민카드 / 현대카드 …  헤더 이름으로 열을 찾는다.
     ============================================================ */
  const CU_DATE = /(이용일|승인일|거래일|매출일|사용일|이용일자|승인일자|거래일자)/;
  const CU_AMT  = /(이용금액|승인금액|거래금액|사용금액|이용액|결제금액|금액)/;
  const CU_MER  = /(가맹점|이용하신곳|이용가맹점|상호|사용처|가맹점명|이용내용)/;
  const CU_INST = /(할부|이용구분|결제구분|할부개월)/;
  const CU_STAT = /(상태|승인구분|취소|매입구분)/;

  /** 헤더 행을 찾아 열 위치를 돌려준다. 못 찾으면 null */
  function cuHeader(rows) {
    for (let i = 0; i < Math.min(15, rows.length); i++) {
      const head = rows[i].map(x => S(x));
      const find = re => head.findIndex(h => h && re.test(h));
      const d = find(CU_DATE), m = find(CU_MER);
      if (d < 0 || m < 0) continue;
      // 금액은 '이용금액' 처럼 구체적인 것을 먼저, 없으면 '금액'
      let a = head.findIndex(h => h && /(이용금액|승인금액|거래금액|사용금액|이용액)/.test(h));
      if (a < 0) a = find(CU_AMT);
      if (a < 0) continue;
      return { i, d, a, m, inst: find(CU_INST), stat: find(CU_STAT), head };
    }
    return null;
  }

  function cuIssuer(fileName, wb) {
    const hay = fileName + ' ' + wb.SheetNames.join(' ');
    if (/삼성/.test(hay)) return ['samsung_card', '삼성카드'];
    if (/국민|KB|kb|쿠팡/.test(hay)) return ['kb_card', 'KB국민카드'];
    if (/현대/.test(hay)) return ['hyundai_card', '현대카드'];
    return ['kb_card', '카드 이용내역'];
  }

  function parseCardUsage(wb, fileName) {
    const [source, label] = cuIssuer(fileName || '', wb);
    const out = []; const fp = fpFactory();
    for (const sn of wb.SheetNames) {
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1, defval: '' });
      const H = cuHeader(rows); if (!H) continue;
      for (const r of rows.slice(H.i + 1)) {
        const date = anyDate(r[H.d]); if (!date) continue;
        const merchant = S(r[H.m]); if (!merchant) continue;
        const amount = num(r[H.a]); if (!amount) continue;
        const stat = H.stat >= 0 ? S(r[H.stat]) : '';
        if (/취소|거절|무효/.test(stat)) continue;                 // 취소건 제외
        if (/취소/.test(merchant)) continue;
        let installment = '';
        if (H.inst >= 0) {
          const v = S(r[H.inst]);
          if (v && !/일시불|일시/.test(v)) installment = v;
        }
        out.push(rowFrom({
          source, tx_date: date, merchant, amount, installment,
          memo: label,
          fingerprint: fp([source, date, merchant, Math.round(amount)])
        }));
      }
    }
    return { rows: out, label };
  }

  function parseWorkbook(wb, fileName) {
    const names = wb.SheetNames.join(',');
    // 쿠팡 CSV 먼저 확인
    try {
      const first = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' })[0] || [];
      const h = first.map(x => S(x)).join(',');
      if (h.includes('상품명') && h.includes('주문일'))
        return { type: '쿠팡 주문내역', kind: 'coupang', rows: parseCoupang(wb) };
    } catch (e) { /* 무시 */ }
    if (/국내이용내역|해외이용내역/.test(names)) {
      const rows = parseSamsungUsage(wb);
      const fx = /해외이용내역/.test(names);
      if (rows.length) return { type: `삼성카드 이용내역${fx ? '(해외)' : '(국내)'}`, rows };
    }
    if (/일시불|할부/.test(names)) return { type: '삼성카드 명세서', rows: parseSamsung(wb, fileName) };
    if (/거래내역|입출식/.test(names)) return { type: '기업은행 입출금 내역', rows: parseIbk(wb) };
    // 시트 이름이 Sheet1/Sheet2 인 '출력용' HTML 파일 → 헤더로 판별
    for (const sn of wb.SheetNames) {
      const head = (XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1, defval: '' })[0] || [])
        .map(x => S(x)).join('|');
      if (/거래일시|거래일자/.test(head) && /출금/.test(head))
        return { type: '기업은행 입출금 내역', rows: parseIbk(wb) };
    }
    // 카드사 홈페이지에서 받은 '이용내역' 파일
    for (const sn of wb.SheetNames) {
      const rs = XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1, defval: '' });
      if (cuHeader(rs)) {
        const r = parseCardUsage(wb, fileName || '');
        if (r.rows.length) return { type: `${r.label} 이용내역`, rows: r.rows };
      }
    }
    // 시트 이름을 못 믿을 때는 첫 셀 모양으로 추정
    return { type: '기업은행 입출금 내역(추정)', rows: parseIbk(wb) };
  }

  root.Parsers = { parseWorkbook, parseSamsung, parseIbk, parseCardUsage, parseSamsungUsage, cuHeader, parseCoupang, parsePdf, parseHyundaiLines, rowFrom, fpFactory, classifyBank, bankRow, BANK_LABEL };
})(window);
