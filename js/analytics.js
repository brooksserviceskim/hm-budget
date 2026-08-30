/* ============================================================
   집계 · 진단 엔진
   ============================================================ */
(function (root) {
  'use strict';
  const C = root.Categorize;

  const won = n => Math.round(n).toLocaleString('ko-KR') + '원';
  const man = n => (n / 10000).toFixed(n >= 1000000 ? 0 : 1).replace(/\.0$/, '') + '만원';
  const pad = n => String(n).padStart(2, '0');

  /* ---------- 가계 지출 판정 ---------- */
  // 카드 결제대금 상환, 본인계좌 이체는 이중계상이므로 제외
  const EXCLUDE_SUB = new Set(['카드대금', '본인 계좌 이체', '본인계좌 이체', '카드 환불']);
  // 홍미란님이 직접 지출을 기록한 달의 집합 (app.js 에서 채워줌)
  let SPOUSE_RECORDED = new Set();
  function isHouseholdExpense(t) {
    if (t.kind !== 'expense') return false;
    if (t.is_work) return false;                       // 루트82 업무 사용분 → 환급 예정이므로 제외
    if (EXCLUDE_SUB.has(t.subcategory)) return false;
    // 배우자에게 보낸 생활비는 본인이 직접 기록한 달이면 내부이체 → 이중계상 방지
    if (t.subcategory === '배우자 생활비 이체' && SPOUSE_RECORDED.has(t.tx_date.slice(0, 7))) return false;
    return true;
  }
  const isIncome = t => t.kind === 'income';

  /* ---------- 기간 키 ---------- */
  function periodKey(dateStr, g) {
    const d = new Date(dateStr + 'T00:00:00');
    const y = d.getFullYear();
    if (g === 'year') return `${y}`;
    if (g === 'month') return `${y}-${pad(d.getMonth() + 1)}`;
    if (g === 'day') return dateStr;
    // ISO 주차
    const t = new Date(Date.UTC(y, d.getMonth(), d.getDate()));
    const dayNum = t.getUTCDay() || 7;
    t.setUTCDate(t.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
    const week = Math.ceil(((t - yearStart) / 86400000 + 1) / 7);
    return `${t.getUTCFullYear()}-W${pad(week)}`;
  }
  function periodLabel(key, g) {
    if (g === 'year') return key + '년';
    if (g === 'month') return key.slice(2).replace('-', '년 ') + '월';
    if (g === 'week') return key.replace('-W', '년 ') + '주차';
    const [, m, d] = key.split('-'); return `${+m}/${+d}`;
  }


  /** 카드/시트 데이터가 실질적으로 들어온 월만 반환 (명세서가 아직 안 나온 최신 달 제외) */
  function effectiveMonths(txs) {
    const cnt = new Map();
    for (const t of txs) {
      if (t.kind !== 'expense') continue;
      const m = t.tx_date.slice(0, 7);
      if (!cnt.has(m)) cnt.set(m, 0);
      if (t.source === 'samsung_card' || t.source === 'sheet' || t.source === 'manual')
        cnt.set(m, cnt.get(m) + 1);
    }
    const months = [...cnt.keys()].sort();
    while (months.length && cnt.get(months[months.length - 1]) < 5) months.pop();
    return months;
  }

  /* ---------- 집계 ---------- */
  function seriesByPeriod(txs, g) {
    const map = new Map();
    for (const t of txs) {
      const k = periodKey(t.tx_date, g);
      if (!map.has(k)) map.set(k, { key: k, expense: 0, income: 0, work: 0, count: 0 });
      const o = map.get(k);
      if (isIncome(t)) o.income += t.amount;
      else if (t.is_work) o.work += t.amount;
      else if (isHouseholdExpense(t)) { o.expense += t.amount; o.count++; }
    }
    return [...map.values()].sort((a, b) => a.key < b.key ? -1 : 1);
  }

  function byCategory(txs) {
    const map = new Map();
    for (const t of txs) {
      if (!isHouseholdExpense(t)) continue;
      map.set(t.category, (map.get(t.category) || 0) + t.amount);
    }
    return [...map.entries()].map(([k, v]) => ({ category: k, amount: v })).sort((a, b) => b.amount - a.amount);
  }

  function bySub(txs, category) {
    const map = new Map();
    for (const t of txs) {
      if (!isHouseholdExpense(t)) continue;
      if (category && t.category !== category) continue;
      const k = `${t.category} › ${t.subcategory || '기타'}`;
      map.set(k, (map.get(k) || 0) + t.amount);
    }
    return [...map.entries()].map(([k, v]) => ({ name: k, amount: v })).sort((a, b) => b.amount - a.amount);
  }

  function topMerchants(txs, n) {
    const map = new Map();
    for (const t of txs) {
      if (!isHouseholdExpense(t)) continue;
      const o = map.get(t.merchant) || { merchant: t.merchant, amount: 0, count: 0, category: t.category };
      o.amount += t.amount; o.count++;
      map.set(t.merchant, o);
    }
    return [...map.values()].sort((a, b) => b.amount - a.amount).slice(0, n || 15);
  }

  /** 최근 N개월 평균 (데이터가 있는 달만 계산) */
  function monthlyAverage(txs, months) {
    const all = effectiveMonths(txs);
    const use = months ? all.slice(-months) : all;
    const cat = new Map();
    const keys = new Set(use);
    let n = keys.size || 1;
    for (const t of txs) {
      if (!isHouseholdExpense(t)) continue;
      if (!keys.has(periodKey(t.tx_date, 'month'))) continue;
      cat.set(t.category, (cat.get(t.category) || 0) + t.amount);
    }
    const avg = {};
    for (const [k, v] of cat) avg[k] = v / n;
    return { months: n, monthKeys: [...keys].sort(), avgByCategory: avg,
             avgTotal: Object.values(avg).reduce((a, b) => a + b, 0) };
  }


  /* ============================================================
     집중 분석 : 쿠팡 · 마트 · 편의점 · 배달 · 카페 · 외식
     ============================================================ */
  const FOCUS = [
    { key: '쿠팡',        subs: ['쿠팡'],                    color: '#2563eb', bench: null },
    { key: '마트·장보기', subs: ['마트/장보기'],              color: '#0891b2', bench: null },
    { key: '편의점',      subs: ['편의점'],                  color: '#7dd3fc', bench: null },
    { key: '배달',        subs: ['배달'],                    color: '#dc2626', bench: '배달' },
    { key: '카페·간식',   subs: ['카페', '베이커리/간식'],    color: '#f59e0b', bench: null },
    { key: '외식',        subs: ['외식', '패스트푸드'],       color: '#ea580c', bench: null }
  ];
  const GROCERY_KEYS = ['쿠팡', '마트·장보기', '편의점'];

  /** 월별 시계열 { months:[], series:{key:[..]} } */
  function focusMonthly(txs) {
    const months = effectiveMonths(txs);
    const idx = new Map(months.map((m, i) => [m, i]));
    const series = {};
    for (const f of FOCUS) series[f.key] = new Array(months.length).fill(0);
    for (const t of txs) {
      if (!isHouseholdExpense(t)) continue;
      const i = idx.get(t.tx_date.slice(0, 7));
      if (i === undefined) continue;
      const f = FOCUS.find(x => x.subs.includes(t.subcategory));
      if (f) series[f.key][i] += t.amount;
    }
    return { months, series };
  }

  /** 최근 n개월 평균 vs 직전 n개월 평균 */
  function focusSummary(txs, n) {
    const { months, series } = focusMonthly(txs);
    const cur = months.slice(-n), prev = months.slice(-n * 2, -n);
    const avgOf = (key, list) => {
      if (!list.length) return 0;
      const idx = months.reduce((m, x, i) => (m[x] = i, m), {});
      return list.reduce((a, m) => a + (series[key][idx[m]] || 0), 0) / list.length;
    };
    return FOCUS.map(f => {
      const now = avgOf(f.key, cur), before = avgOf(f.key, prev);
      return {
        key: f.key, color: f.color, bench: f.bench,
        now, before,
        delta: now - before,
        pct: before > 0 ? (now / before - 1) * 100 : null
      };
    });
  }


  /* ============================================================
     고정비 · 변동비
     - 하위분류가 고정 성격이거나
     - 최근 6개월 중 4개월 이상 반복 결제된 가맹점이면 고정비로 본다
     ============================================================ */
  const FIXED_SUBS = new Set([
    // 금융 · 보험 · 저축
    '대출상환', '주택담보대출 상환(신한)', '신용대출 상환(토스)', '대출/이자',
    '보험', '보험비(수협)', '저축', '주택청약저축',
    // 주거 · 공과금
    '주거관리', '아파트 관리비', '가스요금', '전기요금', '수도요금', '렌탈',
    // 통신 · 구독
    '통신요금', '인터넷/TV', '통신부가', '통신/구독', '구독-콘텐츠',
    '구독-AI', '구독-업무툴', '구독-디자인', '구독-AI/디자인',
    // 차량
    '자동차 할부', '자동차(현대카드)',
    // 가족 고정 이체
    '용돈/생활비 이체', '세탁/청소'
  ]);

  // 매달 나가지만 금액이 들쭉날쭉해 고정비로 보지 않는 것
  const NOT_FIXED_SUBS = new Set(['배우자 생활비 이체', '경조사/개인 송금', '카드대금', '간편결제']);
  const NOT_FIXED_MERCHANTS = [/^Google \(제미나이/];

  /**
   * 진짜 '고정비'스러운 반복 결제만 골라낸다.
   *  · 최근 months개월 중 minM개월 이상 등장
   *  · 한 달에 평균 2건 이하 (장보기처럼 수시로 긁는 곳 제외)
   *  · 월별 금액이 안정적 (최대/최소 ≤ 1.8, 표준편차/평균 < 0.35)
   */
  function recurringMerchants(txs, months, minM) {
    const keys = effectiveMonths(txs).slice(-(months || 6));
    const set = new Set(keys);
    const agg = new Map();   // merchant → { m→{sum,cnt} }
    for (const t of txs) {
      if (!isHouseholdExpense(t)) continue;
      const m = t.tx_date.slice(0, 7);
      if (!set.has(m)) continue;
      if (!agg.has(t.merchant)) agg.set(t.merchant, new Map());
      const g = agg.get(t.merchant);
      const o = g.get(m) || { sum: 0, cnt: 0 };
      o.sum += t.amount; o.cnt++; g.set(m, o);
    }
    const out = new Set();
    for (const [mer, g] of agg) {
      if (g.size < (minM || 4)) continue;
      const sums = [...g.values()].map(o => o.sum).filter(v => v > 0);
      const cnts = [...g.values()].map(o => o.cnt);
      if (!sums.length) continue;
      const avgCnt = cnts.reduce((a, b) => a + b, 0) / cnts.length;
      if (avgCnt > 2) continue;                                   // 수시 결제처 제외
      const mean = sums.reduce((a, b) => a + b, 0) / sums.length;
      const sd = Math.sqrt(sums.reduce((a, b) => a + (b - mean) ** 2, 0) / sums.length);
      const spread = Math.max(...sums) / Math.max(1, Math.min(...sums));
      if (spread > 1.8 || sd / mean > 0.35) continue;             // 금액이 들쭉날쭉하면 제외
      out.add(mer);
    }
    return out;
  }

  function isFixed(t, recur) {
    if (!isHouseholdExpense(t)) return false;
    if (NOT_FIXED_SUBS.has(t.subcategory)) return false;
    if (NOT_FIXED_MERCHANTS.some(re => re.test(t.merchant))) return false;
    if (FIXED_SUBS.has(t.subcategory)) return true;
    return recur ? recur.has(t.merchant) : false;
  }

  /* ---------- 고정비 마스터(직접 등록한 목록) 계산 ---------- */
  const CYCLE_DIV = { '매월': 1, '격월': 2, '분기': 3, '반기': 6, '연': 12 };
  const instDone = f => f.kind === '할부' &&
        (+f.inst_total || 0) > 0 && (+f.inst_now || 0) >= (+f.inst_total || 0);

  function planSummary(list) {
    const on = (list || []).filter(f => f.active !== false);
    const monthly = on.filter(f => f.kind !== '할부');
    const inst = on.filter(f => f.kind === '할부' && !instDone(f));
    const done = (list || []).filter(instDone);
    const per = f => (+f.amount || 0) / (CYCLE_DIV[f.cycle] || 1);
    const monthlyTotal = monthly.reduce((a, f) => a + per(f), 0);
    const instTotal = inst.reduce((a, f) => a + (+f.amount || 0), 0);
    const instLeft = inst.reduce((a, f) => {
      const left = Math.max(0, (+f.inst_total || 0) - (+f.inst_now || 0));
      return a + left * (+f.amount || 0);
    }, 0);
    const maxLeftM = inst.reduce((a, f) => Math.max(a, Math.max(0, (+f.inst_total || 0) - (+f.inst_now || 0))), 0);
    const byCat = new Map();
    for (const f of on) {
      if (instDone(f)) continue;
      byCat.set(f.category, (byCat.get(f.category) || 0) + (f.kind === '할부' ? (+f.amount || 0) : per(f)));
    }
    return { monthly, inst, done, monthlyTotal, instTotal, instLeft, maxLeftM,
             doneTotal: done.reduce((a, f) => a + (+f.amount || 0), 0),
             total: monthlyTotal + instTotal, byCat: [...byCat.entries()].sort((a, b) => b[1] - a[1]) };
  }

  /** 고정비 요약 { months, fixedAvg, varAvg, ratio, items[], series } */
  function fixedSummary(txs, n) {
    const recur = recurringMerchants(txs, 6, 4);
    const all = effectiveMonths(txs);
    const use = n ? all.slice(-n) : all;
    const set = new Set(use);
    const items = new Map();
    let fixed = 0, vari = 0;
    for (const t of txs) {
      if (!isHouseholdExpense(t)) continue;
      if (!set.has(t.tx_date.slice(0, 7))) continue;
      if (isFixed(t, recur)) {
        fixed += t.amount;
        const key = t.merchant;
        const o = items.get(key) || { name: key, category: t.category, sub: t.subcategory, amount: 0, months: new Set() };
        o.amount += t.amount; o.months.add(t.tx_date.slice(0, 7));
        items.set(key, o);
      } else vari += t.amount;
    }
    const nMonths = Math.max(1, use.length);
    const list = [...items.values()]
      .map(o => ({ name: o.name, category: o.category, sub: o.sub,
                   total: o.amount, monthly: o.amount / nMonths, hits: o.months.size }))
      .sort((a, b) => b.total - a.total);

    // 월별 고정/변동 시계열
    const idx = new Map(all.map((m, i) => [m, i]));
    const fSeries = new Array(all.length).fill(0), vSeries = new Array(all.length).fill(0);
    for (const t of txs) {
      if (!isHouseholdExpense(t)) continue;
      const i = idx.get(t.tx_date.slice(0, 7));
      if (i === undefined) continue;
      (isFixed(t, recur) ? fSeries : vSeries)[i] += t.amount;
    }
    return {
      months: nMonths, monthKeys: use, allMonths: all,
      fixedAvg: fixed / nMonths, varAvg: vari / nMonths,
      ratio: fixed + vari > 0 ? fixed / (fixed + vari) * 100 : 0,
      items: list, fSeries, vSeries
    };
  }

  /* ---------- 진단 & 조언 ---------- */
  // 자산 형성(저축·대출 원금상환)과 순수 소비를 구분
  const ASSET_CATS = new Set(['저축·보험', '금융·대출']);

  function cashflow(txs, months) {
    const A = monthlyAverage(txs, months);
    const avg = A.avgByCategory;
    let consume = 0, asset = 0;
    for (const [k, v] of Object.entries(avg)) (ASSET_CATS.has(k) ? (asset += v) : (consume += v));
    const income = incomeAvg(txs, /./, months);
    return { months: A.months, avg, consume, asset, income, total: consume + asset,
             surplus: income - consume - asset };
  }

  function topDrivers(txs, category, months, n) {
    const keys = latestMonths(txs, months);
    const map = new Map();
    for (const t of txs) {
      if (!isHouseholdExpense(t) || t.category !== category) continue;
      if (!keys.has(periodKey(t.tx_date, 'month'))) continue;
      map.set(t.merchant, (map.get(t.merchant) || 0) + t.amount);
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, n || 3)
      .map(([m, v]) => `${m} ${man(v / Math.max(1, keys.size))}`);
  }

  function buildAdvice(txs, bench) {
    const CF = cashflow(txs, 6);
    const avg = CF.avg;
    const out = [];
    const get = k => avg[k] || 0;
    let subCounted = false;

    // 1) 벤치마크 초과 항목
    const overs = C.BENCH_CATEGORIES
      .map(k => ({ k, me: get(k), avg: bench.items[k] || 0 }))
      .filter(o => o.me > o.avg * 1.15 && o.me - o.avg > 50000)
      .sort((a, b) => (b.me - b.avg) - (a.me - a.avg));

    for (const o of overs.slice(0, 4)) {
      const diff = o.me - o.avg;
      const pct = Math.round((o.me / o.avg - 1) * 100);
      if (o.k === '정보통신') subCounted = true;
      out.push({
        level: pct > 80 ? 'bad' : 'warn',
        title: `${o.k} · 2인 가구 평균보다 ${pct}% 많음`,
        body: `월평균 ${won(o.me)} (평균 ${won(o.avg)}). 주된 원인 → ${topDrivers(txs, o.k, 6, 3).join(' · ')}`,
        save: diff * 0.5,
        saveLabel: `절반만 줄여도 월 ${man(diff * 0.5)} · 연 ${man(diff * 6)}`
      });
    }

    // 2) 사업 투자 (AI · 소프트웨어 구독 · 광고비) — 소비가 아니라 선투자로 본다
    const cutoff = latestMonths(txs, 3);
    const biz = new Map();
    for (const t of txs) {
      if (!isHouseholdExpense(t) || t.category !== '사업·투자') continue;
      if (!cutoff.has(periodKey(t.tx_date, 'month'))) continue;
      biz.set(t.merchant, (biz.get(t.merchant) || 0) + t.amount);
    }
    const bizTotal = [...biz.values()].reduce((a, b) => a + b, 0) / Math.max(1, cutoff.size);
    if (bizTotal > 50000) {
      const list = [...biz.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)
        .map(([m, v]) => `${m} ${man(v / Math.max(1, cutoff.size))}`).join(' · ');
      const bizIncome = incomeAvg(txs, /사업소득/, 6);
      const roi = bizIncome / bizTotal;
      out.push({
        level: bizIncome === 0 ? 'warn' : roi >= 1 ? 'ok' : 'warn',
        title: `사업 투자(AI·소프트웨어) 월 ${man(bizTotal)}` +
               (bizIncome > 0 ? ` · 사업소득 월 ${man(bizIncome)} (회수율 ${Math.round(roi * 100)}%)` : ' · 아직 회수 전'),
        body: `${list}. ` +
              (bizIncome === 0
                ? '아직 브룩스글로벌 매출이 잡히지 않았습니다. 이 금액은 소비가 아니라 <b>선투자</b>로 따로 봅니다 — 2인 가구 평균 비교에서도 빠져 있습니다. 다만 회수 시점을 정해두지 않으면 그냥 고정비가 되니, 매출이 붙는 시점을 스스로 정해두세요.'
                : roi >= 1
                  ? '투자액보다 사업소득이 큽니다. 지금 구조를 유지하세요.'
                  : '아직 투자액이 사업소득보다 큽니다. 겹치는 AI 구독은 하나로 합치고, 회수 시점을 점검하세요.') +
              ' 개인사업자로 등록하면 이 항목은 <b>필요경비</b>로 처리되고, 세금계산서를 받으면 부가세도 공제됩니다. 루트82 업무 사용분은 업무비용으로 태그해 별도 환급받으세요.',
        save: 0,
        saveLabel: '소비가 아닌 투자로 분류됨'
      });
    }

    // 3) 배달 · 카페 습관
    const deliv = subAvg(txs, ['배달'], 6), cafe = subAvg(txs, ['카페', '베이커리/간식'], 6);
    const convn = subAvg(txs, ['편의점'], 6);
    if (deliv + cafe + convn > 250000) {
      out.push({
        level: deliv + cafe + convn > 450000 ? 'bad' : 'warn',
        title: `배달·카페·편의점에 월 ${man(deliv + cafe + convn)}`,
        body: `배달 ${man(deliv)} · 카페/간식 ${man(cafe)} · 편의점 ${man(convn)}. ` +
              `배달은 주 1회, 카페는 하루 1잔으로만 정해도 티 안 나게 줄어듭니다.`,
        save: (deliv + cafe + convn) * 0.3,
        saveLabel: `월 ${man((deliv + cafe + convn) * 0.3)}`
      });
    }

    // 4) 병원비 vs 보험금 환급
    const med = get('보건');
    const refund = incomeAvg(txs, /보험금/, 6);
    if (med > 200000) {
      const net = med - refund;
      out.push({
        level: net > 300000 ? 'warn' : 'ok',
        title: `병원비 월 ${man(med)} · 실손 환급 월 ${man(refund)}`,
        body: refund > 0
          ? `${Math.round(refund / med * 100)}% 를 돌려받고 있어 실제 부담은 월 ${won(Math.max(0, net))} 입니다. 청구 누락이 없는지 분기마다 확인하세요.`
          : `보험금 환급 기록이 없습니다. 실손 청구 가능한 건이 없는지 확인해 보세요.`,
        save: refund > 0 ? 0 : med * 0.4,
        saveLabel: refund > 0 ? '지금처럼 꼬박 청구하면 OK' : `청구 시 월 ${man(med * 0.4)} 회수 가능`
      });
    }

    // 5) 배우자 생활비 이체
    const spouse = get('이체·용돈');
    if (spouse > 300000) {
      out.push({
        level: 'warn',
        title: `계좌 이체·용돈으로 월 ${man(spouse)}`,
        body: `배우자 생활비 이체와 경조사 송금입니다. 이 돈이 어디에 쓰이는지는 이 가계부에 잡히지 않으니, ` +
              `월 한도를 정해두면 전체 지출이 훨씬 잘 통제됩니다.`,
        save: 0, saveLabel: '한도 설정 권장'
      });
    }

    // 6) 업무비용 미회수
    const workPending = txs.filter(t => t.is_work).reduce((a, t) => a + t.amount, 0);
    if (workPending > 0) {
      out.push({
        level: 'warn',
        title: `루트82 업무 사용분 ${won(workPending)}`,
        body: `개인카드로 먼저 결제한 업무비용입니다. 기안이 늦어지면 그대로 가계 적자로 잡히니 매월 말 기안하는 습관을 만드세요.`,
        save: 0, saveLabel: '기안 시 전액 회수'
      });
    }

    // 6-2) 고정비 비중
    const FS = fixedSummary(txs, 6);
    const incAvg = incomeAvg(txs, /./, 6);
    if (FS.fixedAvg > 0) {
      const vsIncome = incAvg > 0 ? FS.fixedAvg / incAvg * 100 : null;
      const top = FS.items.slice(0, 4).map(i => `${i.name} ${man(i.monthly)}`).join(' · ');
      out.push({
        level: vsIncome === null ? 'warn' : vsIncome > 70 ? 'bad' : vsIncome > 50 ? 'warn' : 'ok',
        title: `고정비 월 ${man(FS.fixedAvg)} (지출의 ${FS.ratio.toFixed(0)}%` +
               (vsIncome !== null ? ` · 수입의 ${vsIncome.toFixed(0)}%` : '') + ')',
        body: `매달 자동으로 빠져나가는 돈입니다 → ${top}. ` +
              (vsIncome !== null && vsIncome > 50
                ? '고정비가 수입의 50%를 넘으면 변동비를 아무리 줄여도 여유가 안 생깁니다. 구독 정리·용돈 한도·대출 조건부터 손봐야 합니다.'
                : '고정비 비중은 관리 가능한 수준입니다. 변동비만 다듬으면 됩니다.'),
        save: 0, saveLabel: '한 번 줄이면 매달 반복 절감'
      });
    }

    // 7) 현금흐름 요약
    if (CF.income > 0) {
      const rate = (CF.asset + CF.surplus) / CF.income * 100;
      out.push({
        level: rate < 10 ? 'bad' : rate < 25 ? 'warn' : 'ok',
        title: `저축 여력 ${rate.toFixed(0)}% · 월 ${man(CF.asset + CF.surplus)}`,
        body: `월평균 수입 ${won(CF.income)} = 소비지출 ${won(CF.consume - (avg['사업·투자'] || 0))} + 사업투자 ${won(avg['사업·투자'] || 0)} + 저축·대출상환 ${won(CF.asset)} + 잔액 ${won(CF.surplus)}. ` +
              (rate < 30 ? '권장선은 30% 입니다. 위 항목부터 손대면 도달 가능합니다.' : '지금 흐름을 유지하세요.'),
        save: 0, saveLabel: ''
      });
    }

    const totalSave = out.reduce((a, o) => a + (o.save || 0), 0);
    return { advice: out, totalSave, base: CF };
  }

  function latestMonths(txs, n) {
    return new Set(effectiveMonths(txs).slice(-n));
  }
  function subAvg(txs, subs, months) {
    const keys = latestMonths(txs, months);
    let s = 0;
    for (const t of txs) {
      if (!isHouseholdExpense(t)) continue;
      if (!subs.includes(t.subcategory)) continue;
      if (!keys.has(periodKey(t.tx_date, 'month'))) continue;
      s += t.amount;
    }
    return s / Math.max(1, keys.size);
  }
  function incomeAvg(txs, re, months) {
    const keys = [...new Set(txs.filter(isIncome).map(t => periodKey(t.tx_date, 'month')))].sort().slice(-months);
    const set = new Set(keys);
    let s = 0;
    for (const t of txs) {
      if (!isIncome(t)) continue;
      if (!re.test(t.income_src || '')) continue;
      if (!set.has(periodKey(t.tx_date, 'month'))) continue;
      s += t.amount;
    }
    return s / Math.max(1, set.size);
  }

  Object.defineProperty(root, '__setSpouse', { value: v => { SPOUSE_RECORDED = v || new Set(); } });


  /* ============================================================
     정기결제(구독) 자동 탐지
     같은 가맹점·같은 금액을 '한 달 간격 사슬'로 묶어 구독을 분리한다.
     ============================================================ */
  /* 정기결제 자동 탐지 — 가맹점+금액 묶음 안에서 '한 달 간격 사슬'을 만든다 */
  const DAY = 86400000;
  const dnum = s => new Date(s + 'T00:00:00Z').getTime();
  const day = t => +t.tx_date.slice(8, 10);
  function modeDay(rows) {                       // 가장 자주 나온 결제일
    if (!rows || !rows.length) return 0;
    const c = new Map();
    for (const r of rows) c.set(day(r), (c.get(day(r)) || 0) + 1);
    return [...c.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0][0];
  }
  function detectSubs(tx, today) {
    const now = dnum(today);
    const g = new Map();
    for (const t of tx) {
      const k = `${t.merchant}|${Math.round(t.amount)}`;
      if (!g.has(k)) g.set(k, []);
      g.get(k).push(t);
    }
    const out = [];
    for (const [k, list] of g) {
      if (list.length < 2) continue;
      list.sort((a, b) => a.tx_date < b.tx_date ? -1 : 1);
      const chains = [];
      for (const t of list) {
        const d = dnum(t.tx_date);
        let best = null, bestScore = 1e9, cyc = null;
        for (const c of chains) {
          const gap = (d - dnum(c.rows[c.rows.length - 1].tx_date)) / DAY;
          let period = null;
          if (gap >= 26 && gap <= 36) period = 'month';
          else if (gap >= 350 && gap <= 380) period = 'year';
          else if (gap >= 12 && gap <= 17) period = 'half';
          if (!period) continue;
          const ideal = period === 'month' ? 30.4 : period === 'year' ? 365 : 14;
          // 결제일(며칠)이 같은 사슬을 우선, 간격은 보조 기준
          const dd = Math.abs(day(t) - c.day);
          const score = Math.min(dd, 31 - dd) + Math.abs(gap - ideal) / 20;
          if (score < bestScore) { best = c; bestScore = score; cyc = period; }
        }
        if (best) { best.rows.push(t); best.cycle = cyc; best.day = modeDay(best.rows); }
        else chains.push({ rows: [t], cycle: null, day: day(t) });
      }
      // --- 보정 : 결제일이 비슷한 사슬끼리 섞인 것을 월 단위로 다시 배정 ---
      if (chains.length > 1) {
        for (let it = 0; it < 3; it++) {
          chains.forEach(c => { c.day = modeDay(c.rows); });
          const byMonth = new Map();
          for (const c of chains) for (const r of c.rows) {
            const m = r.tx_date.slice(0, 7);
            if (!byMonth.has(m)) byMonth.set(m, []);
            byMonth.get(m).push(r);
          }
          chains.forEach(c => { c.rows = []; });
          for (const m of [...byMonth.keys()].sort()) {
            const rows = byMonth.get(m).sort((a, b) => day(a) - day(b));
            const free = chains.slice();
            for (const r of rows) {
              let pick = null, bestD = 1e9;
              for (const c of free) {
                const dd = Math.abs(day(r) - c.day);
                const v = Math.min(dd, 31 - dd);
                if (v < bestD) { bestD = v; pick = c; }
              }
              if (!pick) pick = chains[0];
              pick.rows.push(r);
              free.splice(free.indexOf(pick), 1);
            }
          }
          chains.forEach(c => c.rows.sort((a, b) => a.tx_date < b.tx_date ? -1 : 1));
          for (let i = chains.length - 1; i >= 0; i--) if (!chains[i].rows.length) chains.splice(i, 1);
        }
        chains.forEach(c => { c.day = modeDay(c.rows); });
      }

      for (const c of chains) {
        if (c.rows.length < 2) continue;
        const first = c.rows[0], last = c.rows[c.rows.length - 1];
        const amt = Math.round(last.amount);
        const gapDays = (now - dnum(last.tx_date)) / DAY;
        const cycle = c.cycle || 'month';
        const limit = cycle === 'year' ? 400 : cycle === 'half' ? 25 : 50;
        out.push({
          merchant: last.merchant, amount: amt, cycle,
          day: c.day,
          count: c.rows.length, first: first.tx_date, last: last.tx_date,
          total: c.rows.reduce((a, r) => a + Math.round(r.amount), 0),
          ids: c.rows.map(r => r.id).filter(x => x != null),
        active: gapDays <= limit,
          sinceDays: Math.round(gapDays),
          category: last.category, sub: last.subcategory
        });
      }
    }
    return out.sort((a, b) => (b.active - a.active) || (b.amount - a.amount));
  }

  root.Analytics = {
    set SPOUSE_RECORDED(v) { root.__setSpouse(v); },
    get SPOUSE_RECORDED() { return SPOUSE_RECORDED; },
    won, man, periodKey, periodLabel, seriesByPeriod, byCategory, bySub, topMerchants,
    monthlyAverage, buildAdvice, cashflow, topDrivers, effectiveMonths, FIXED_SUBS, NOT_FIXED_SUBS, planSummary, instDone, CYCLE_DIV, isFixed, recurringMerchants, fixedSummary, FOCUS, GROCERY_KEYS, focusMonthly, focusSummary, isHouseholdExpense, isIncome, latestMonths, incomeAvg, subAvg, detectSubs
  };
})(window);
