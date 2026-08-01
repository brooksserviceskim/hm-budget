/* ============================================================
   현우 미란 가계부 · 앱 로직 (모바일 우선)
   ============================================================ */
(function () {
  'use strict';
  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];
  const A = window.Analytics, C = window.Categorize, P = window.Parsers, S = window.Store;
  const CFG = window.APP_CONFIG;

  let USER = null, TX = [], VTX = [], CLAIMS = [], FIXED = [], CP = [], BENCH = null;
  let person = '';   // '' = 2인 합계, 아니면 사람 이름
  let BUDGET = { amount: 1000000, startDay: 1 };
  let bgLimit = 40;
  // 생활비로 볼 하위분류
  const BUDGET_SUBS = new Set(['쿠팡', '마트/장보기', '편의점', '기타식품',
                               '배달', '카페', '베이커리/간식', '외식', '패스트푸드',
                               '온라인/백화점', '간편결제']);
  const BUDGET_CATS = new Set(['식료품·비주류음료', '음식·숙박']);
  function isBudgetTx(t) {
    if (!A.isHouseholdExpense(t)) return false;
    const m = t.memo || '';
    if (m.includes('[생활비제외]')) return false;
    if (m.includes('[생활비]')) return true;
    return BUDGET_SUBS.has(t.subcategory) || BUDGET_CATS.has(t.category) || t.source === 'sms';
  }
  let charts = {}, seeding = false;
  let months = [], curMonth = null;
  let view = 'home', anRange = 3, gran = 'month';
  let ledgerKind = 'expense', ledgerCat = '', ledgerLimit = 60, ledgerQ = '';

  const fmt = A.won, man = A.man;
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const canWrite = () => !!USER;                              // 둘 다 자기 것은 쓸 수 있음
  const isAdmin  = () => USER && USER.role === 'owner';       // 김현우 : 전체 관리
  const ownerOf  = r => r.owner || '김현우';
  const canEdit  = r => !!USER;                              // 거래는 부부 공용
  const canEditFixed = r => USER && (isAdmin() || ownerOf(r) === USER.name);
  const PEOPLE   = ['김현우', '홍미란'];
  const toast = m => {
    $$('.toast').forEach(t => t.remove());
    const d = document.createElement('div'); d.className = 'toast'; d.textContent = m;
    document.body.appendChild(d); setTimeout(() => d.remove(), 2300);
  };
  let cpRange = 'cur', cpTopMode = 'amount', cpCat = '', cpQ = '', cpLimit = 60;
  const BOOKMARKLET = `javascript:(function()%7Bvar%20APP%3D'https%3A%2F%2Fbrooksserviceskim.github.io%2Fhm-budget%2F'%3Bvar%20clean%3Dfunction(s)%7Breturn%20String(s%7C%7C'').replace(%2F%5Cs%2B%2Fg%2C'%20').trim()%7D%3Bvar%20pad%3Dfunction(n)%7Breturn%20String(n).padStart(2%2C'0')%7D%3Bvar%20isPrice%3Dfunction(t)%7Breturn%20%2F%5E%5B%5Cd%2C%5D%7B3%2C%7D%5Cs*%EC%9B%90%24%2F.test(t)%7D%3Bvar%20isQty%3Dfunction(t)%7Breturn%20%2F%5E%5Cd%2B%5Cs*%EA%B0%9C%24%2F.test(t)%7D%3Bvar%20isDate%3Dfunction(t)%7Breturn%20%2F%5E(20%5Cd%7B2%7D)%5Cs*%5B.%5C-%5C%2F%5D%5Cs*(%5Cd%7B1%2C2%7D)%5Cs*%5B.%5C-%5C%2F%5D%5Cs*(%5Cd%7B1%2C2%7D)%2F.test(t)%7D%3Bvar%20BAD%3D%2F%EC%9E%A5%EB%B0%94%EA%B5%AC%EB%8B%88%7C%EB%B0%B0%EC%86%A1%EC%A1%B0%ED%9A%8C%7C%EB%A6%AC%EB%B7%B0%7C%EA%B5%90%ED%99%98%7C%EB%B0%98%ED%92%88%7C%EC%9E%AC%EA%B5%AC%EB%A7%A4%7C%EC%A3%BC%EB%AC%B8%20%EC%83%81%EC%84%B8%7C%EB%8D%94%EB%B3%B4%EA%B8%B0%7C%EC%B7%A8%EC%86%8C%7C%EC%98%81%EC%88%98%EC%A6%9D%7C%EB%AC%B8%EC%9D%98%2F%3Bvar%20rows%3D%5B%5D%2Cseen%3D%7B%7D%2CcurDate%3D''%3Bvar%20w%3Ddocument.createTreeWalker(document.body%2CNodeFilter.SHOW_ELEMENT%2Cnull%2Cfalse)%3Bvar%20nodes%3D%5B%5D%3Bwhile(w.nextNode())%7Bnodes.push(w.currentNode)%7Dfor(var%20i%3D0%3Bi%3Cnodes.length%3Bi%2B%2B)%7Bvar%20el%3Dnodes%5Bi%5D%3Bif(el.children.length%3D%3D%3D0)%7Bvar%20t%3Dclean(el.textContent)%3Bif(isDate(t))%7Bvar%20m%3Dt.match(%2F%5E(20%5Cd%7B2%7D)%5Cs*%5B.%5C-%5C%2F%5D%5Cs*(%5Cd%7B1%2C2%7D)%5Cs*%5B.%5C-%5C%2F%5D%5Cs*(%5Cd%7B1%2C2%7D)%2F)%3BcurDate%3Dm%5B1%5D%2B'-'%2Bpad(m%5B2%5D)%2B'-'%2Bpad(m%5B3%5D)%3Bcontinue%7Dif(isPrice(t))%7Bvar%20price%3DNumber(t.replace(%2F%5B%5E%5Cd%5D%2Fg%2C''))%3Bif(!price)%7Bcontinue%7Dvar%20box%3Del%2Clv%3D0%3Bwhile(box.parentElement%26%26lv%3C5)%7Bbox%3Dbox.parentElement%3Blv%2B%2B%3Bvar%20leaves%3Dbox.querySelectorAll('*')%2Ccand%3D%5B%5D%2Cqty%3D1%3Bfor(var%20j%3D0%3Bj%3Cleaves.length%3Bj%2B%2B)%7Bvar%20e2%3Dleaves%5Bj%5D%3Bif(e2.children.length)continue%3Bvar%20s2%3Dclean(e2.textContent)%3Bif(!s2)continue%3Bif(isQty(s2))%7Bqty%3DNumber(s2.replace(%2F%5B%5E%5Cd%5D%2Fg%2C''))%7C%7C1%3Bcontinue%7Dif(isPrice(s2)%7C%7CisDate(s2))continue%3Bif(BAD.test(s2))continue%3Bif(s2.length%3E%3D5)cand.push(s2)%3B%7Dcand.sort(function(a%2Cb)%7Breturn%20b.length-a.length%7D)%3Bif(cand.length)%7Bvar%20name%3Dcand%5B0%5D.replace(%2F%5Cs*%5B%5Cd%2C%5D%7B3%2C%7D%5Cs*%EC%9B%90%5Cs*%24%2F%2C'').trim()%3Bif(name.length%3E%3D5)%7Bvar%20key%3DcurDate%2B'%7C'%2Bname%2B'%7C'%2Bprice%2B'%7C'%2Bqty%3Bif(!seen%5Bkey%5D)%7Bseen%5Bkey%5D%3D1%3Brows.push(%7Bd%3AcurDate%2Cn%3Aname.slice(0%2C120)%2Cq%3Aqty%2Cp%3Aprice%7D)%7Dbreak%3B%7D%7D%7D%7D%7D%7Dif(!rows.length)%7Balert('%EC%A3%BC%EB%AC%B8%EC%9D%84%20%EC%B0%BE%EC%A7%80%20%EB%AA%BB%ED%96%88%EC%8A%B5%EB%8B%88%EB%8B%A4.%5Cn%EC%BF%A0%ED%8C%A1%20%EC%A3%BC%EB%AC%B8%EB%AA%A9%EB%A1%9D%20%ED%99%94%EB%A9%B4%EC%97%90%EC%84%9C%20%EB%88%8C%EB%9F%AC%EC%A3%BC%EC%84%B8%EC%9A%94.')%3Breturn%7Dif(rows.length%3E250)%7Brows%3Drows.slice(0%2C250)%7Dvar%20payload%3DencodeURIComponent(JSON.stringify(rows))%3Bvar%20url%3DAPP%2B'%23cpimport%3D'%2Bpayload%3Bif(url.length%3E60000)%7Balert('%EC%A3%BC%EB%AC%B8%EC%9D%B4%20%EB%84%88%EB%AC%B4%20%EB%A7%8E%EC%8A%B5%EB%8B%88%EB%8B%A4.%20%ED%8E%98%EC%9D%B4%EC%A7%80%EB%A5%BC%20%EB%82%98%EB%88%A0%EC%84%9C%20%EB%88%8C%EB%9F%AC%EC%A3%BC%EC%84%B8%EC%9A%94.')%3Breturn%7Dvar%20win%3Dnull%3Btry%7Bwin%3Dwindow.open(url%2C'_blank')%7Dcatch(e)%7B%7Dif(!win)%7Blocation.href%3Durl%7D%7D)()%3B`;
  const VIEW_TITLE = { home: '대시보드', ledger: '가계부', coupang: '쿠팡', fixed: '고정비', analysis: '분석',
                       cpimport: '쿠팡 가져오기', expense: '지출 입력', budget: '생활비', add: '입력',
                       more: '더보기', upload: '명세서 업로드', income: '수입 입력',
                       work: '업무비용 환급', info: '데이터 정보' };
  const MONTH_VIEWS = new Set(['home', 'ledger']);

  /* ---------- 아이폰 설치 안내 배너 ---------- */
  function iosInstallHint() {
    const ua = navigator.userAgent;
    const isIOS = /iPad|iPhone|iPod/.test(ua);
    const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
    if (!isIOS || standalone) return;
    if (sessionStorage.getItem('ios_hint_closed')) return;
    const d = document.createElement('div');
    d.style.cssText = 'position:fixed;left:12px;right:12px;bottom:calc(var(--tabh) + 12px);z-index:150;' +
      'background:#191f28;color:#fff;border-radius:16px;padding:14px 16px;font-size:13.5px;line-height:1.55;' +
      'box-shadow:0 10px 30px rgba(0,0,0,.35);display:flex;gap:10px;align-items:flex-start';
    d.innerHTML = '<div style="flex:1">📱 <b>홈 화면에 추가</b>하면 앱처럼 쓸 수 있어요.<br>' +
      '<span style="color:#93a4b8">아래 공유 버튼 → 홈 화면에 추가</span></div>' +
      '<button style="border:0;background:#334155;color:#fff;border-radius:9px;padding:6px 10px;font-size:12px;font-weight:700">닫기</button>';
    d.querySelector('button').onclick = () => { sessionStorage.setItem('ios_hint_closed', '1'); d.remove(); };
    document.body.appendChild(d);
    setTimeout(() => d.remove(), 15000);
  }

  /* ================= 부팅 ================= */
  (async function boot() {
    BENCH = window.__BENCH__;
    $('#benchSrc').href = BENCH.sourceUrl;
    if (!S.ONLINE) {
      $('#offlineNote').textContent =
        '⚠ 오프라인 모드 · js/config.js 에 Supabase 정보를 넣으면 두 기기가 같은 데이터를 봅니다. 지금은 아이디에 "김현우" 또는 "홍미란" 을 넣으면 들어갈 수 있습니다.';
      $('#password').required = false;
      $('#email').type = 'text';
    }
    stashHashPayload();
    // 저장된 아이디 복원
    const savedId = localStorage.getItem('bb_saved_id');
    const auto = localStorage.getItem('bb_auto_login') === '1';
    if (savedId) { $('#email').value = savedId; $('#saveId').checked = true; }
    $('#autoLogin').checked = auto;

    const u = await S.currentUser().catch(() => null);
    if (u) {
      if (auto) enter(u);
      else { await S.signOut(); }        // 자동 로그인 꺼져 있으면 매번 다시 로그인
    }
    setTimeout(iosInstallHint, 1500);
  })();

  $('#loginForm').addEventListener('submit', async e => {
    e.preventDefault(); $('#loginErr').textContent = ''; $('#loginBtn').disabled = true;
    try {
      const id = $('#email').value.trim();
      const u = await S.signIn(id, $('#password').value);
      if (!u) throw new Error('로그인 실패');
      if ($('#saveId').checked) localStorage.setItem('bb_saved_id', id);
      else localStorage.removeItem('bb_saved_id');
      localStorage.setItem('bb_auto_login', $('#autoLogin').checked ? '1' : '0');
      enter(u);
    } catch (err) { $('#loginErr').textContent = err.message || '로그인에 실패했습니다.'; }
    finally { $('#loginBtn').disabled = false; }
  });
  $('#logoutBtn').addEventListener('click', async () => {
    if (!confirm('로그아웃할까요?')) return;
    localStorage.setItem('bb_auto_login', '0');
    await S.signOut(); location.reload();
  });

  async function enter(u) {
    USER = u;
    $('#login').classList.add('hide');
    $('#app').classList.remove('hide');
    $('#userRole').textContent = u.name;
    $('#userRole').className = 'badge' + (isAdmin() ? '' : ' view');
    $$('[data-admin]').forEach(el => el.classList.toggle('hide', !isAdmin()));
    await reload();
  }

  async function reload() {
    TX = await S.listTx();
    if (!TX.length && isAdmin() && !seeding && window.__SEED__) {
      seeding = true; await loadSeed(null); seeding = false; return;
    }
    CLAIMS = await S.listClaims().catch(() => []);
    FIXED = await S.listFixed().catch(() => []);
    if (!FIXED.length && isAdmin() && window.__SEED__?.fixed) {
      await S.insertFixed(window.__SEED__.fixed);
      FIXED = await S.listFixed();
    }
    BUDGET = await S.getSetting('budget', { amount: 1000000, startDay: 1 }).catch(() => BUDGET);
    CP = await S.listCoupang().catch(() => []);
    if (!CP.length && isAdmin() && window.__COUPANG__?.length) {
      await S.insertCoupang(window.__COUPANG__);
      CP = await S.listCoupang();
    }
    await consumePending();
    await migrate();
    months = A.effectiveMonths(TX);
    if (!curMonth || !months.includes(curMonth)) curMonth = months[months.length - 1] || null;
    renderAll();
  }

  /* ---------- 데이터 정리 마이그레이션 ---------- */
  async function migrate() {
    if (!isAdmin()) return;
    let n = 0;
    const L = P.BANK_LABEL || {};
    for (const t of TX) {
      const patch = {};
      if (t.source === 'sms' && t.category === '미분류') {
        const g = C.categorize(t.merchant);
        if (g.matched) { patch.category = g.category; patch.subcategory = g.sub; }
      }
      if (t.category !== '사업·투자' && C.BIZ_SUBS.includes(t.subcategory || '')) patch.category = '사업·투자';
      if (t.source === 'bank' && t.kind === 'expense' && L[t.subcategory] && t.merchant !== L[t.subcategory])
        patch.merchant = L[t.subcategory];
      if (t.kind !== 'income') {
        const nm = C.normalizeMerchant(patch.merchant || t.merchant);
        if (nm !== (patch.merchant || t.merchant)) patch.merchant = nm;
      }
      if (Object.keys(patch).length) { await S.updateTx(t.id, patch); Object.assign(t, patch); n++; }
    }
    if (n) toast(`데이터 ${n}건 정리 완료`);
  }

  /* ---------- 북마클릿으로 넘어온 쿠팡 주문 받기 ---------- */
  function stashHashPayload() {
    const h = location.hash || '';
    const m = h.match(/^#cpimport=(.+)$/);
    if (!m) return;
    try { sessionStorage.setItem('cp_pending', decodeURIComponent(m[1])); } catch (e) {}
    history.replaceState(null, '', location.pathname + location.search);
  }
  window.addEventListener('hashchange', async () => {
    stashHashPayload();
    if (USER) await consumePending();
  });

  async function consumePending() {
    let raw;
    try { raw = sessionStorage.getItem('cp_pending'); } catch (e) { return; }
    if (!raw) return;
    sessionStorage.removeItem('cp_pending');
    if (!canWrite()) { toast('쓰기 권한이 있는 계정으로 로그인해 주세요'); return; }
    let arr;
    try { arr = JSON.parse(raw); } catch (e) { toast('가져오기 데이터를 읽지 못했습니다'); return; }
    if (!Array.isArray(arr) || !arr.length) return;
    const rows = arr.filter(o => o && o.n && o.p).map(o => {
      const d = String(o.d || '').slice(0, 10);
      const qty = Math.max(1, +o.q || 1), price = Math.round(+o.p || 0);
      return { order_date: /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : new Date().toISOString().slice(0, 10),
               order_no: '', name: String(o.n).slice(0, 200), qty, price,
               category: C.coupangCategory(o.n), memo: '북마클릿',
               fingerprint: `cp|${d}|${o.n}|${price}|${qty}` };
    });
    if (!rows.length) return;
    const res = await S.insertCoupang(rows);
    CP = await S.listCoupang();
    toast(res.inserted ? `쿠팡 새 주문 ${res.inserted}건 추가 (중복 ${res.skipped}건)` : `새 주문 없음 (중복 ${res.skipped}건)`);
    go('coupang');
  }

  /* ================= 네비게이션 ================= */
  $('#tabbar').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return; go(b.dataset.v);
  });
  document.addEventListener('click', e => {
    const g = e.target.closest('[data-go]'); if (!g) return; go(g.dataset.go);
  });
  function go(v) {
    view = v;
    $$('main > section').forEach(s => s.classList.add('hide'));
    $('#v-' + v)?.classList.remove('hide');
    $$('#tabbar button').forEach(b => b.classList.toggle('on', b.dataset.v === v));
    if (v === 'cpimport') { $('#bmCode').value = BOOKMARKLET; }
    if (!['home', 'ledger', 'budget', 'fixed', 'analysis', 'more'].includes(v))
      $$('#tabbar button').forEach(b => b.classList.toggle('on', b.dataset.v === 'more'));
    $('#viewTitle').textContent = VIEW_TITLE[v] || '가계부';
    $('#mnav').classList.toggle('hide', !MONTH_VIEWS.has(v));
    $('#personBar')?.classList.toggle('hide', v === 'budget' || !['home', 'ledger', 'fixed', 'analysis'].includes(v));
    $('#fab')?.classList.toggle('hide', !['home', 'ledger', 'budget'].includes(v));
    window.scrollTo(0, 0);
    renderAll();
  }

  $('#mPrev').addEventListener('click', () => { const i = months.indexOf(curMonth); if (i > 0) { curMonth = months[i - 1]; renderAll(); } });
  $('#mNext').addEventListener('click', () => { const i = months.indexOf(curMonth); if (i < months.length - 1) { curMonth = months[i + 1]; renderAll(); } });

  /* ================= 렌더 ================= */
  function monthTx(m) { return VTX.filter(t => t.tx_date.slice(0, 7) === m); }

  function applyPerson() {
    VTX = person ? TX.filter(t => ownerOf(t) === person) : TX;
    // 미란님이 직접 기록한 달에는 '배우자 생활비 이체'를 내부이체로 처리 (이중계상 방지)
    const cnt = new Map();
    for (const t of TX) {
      if (t.kind !== 'expense' || ownerOf(t) !== '홍미란') continue;
      const m = t.tx_date.slice(0, 7);
      cnt.set(m, (cnt.get(m) || 0) + 1);
    }
    A.SPOUSE_RECORDED = new Set([...cnt.entries()].filter(([, v]) => v >= 3).map(([m]) => m));
  }

  $('#personSeg')?.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    $$('#personSeg button').forEach(x => x.classList.toggle('on', x === b));
    person = b.dataset.p; renderAll();
  });

  function renderAll() {
    $('#viewTitle').textContent = VIEW_TITLE[view] || '대시보드';
    if (!TX.length) return;
    applyPerson();
    renderMonthNav();
    if (view === 'home') renderHome();
    if (view === 'ledger') renderLedger();
    if (view === 'add') renderAdd();
    if (view === 'budget') renderBudget();
    if (view === 'coupang') renderCoupang();
    if (view === 'fixed') renderFixedTab();
    if (view === 'analysis') renderAnalysis();
    if (view === 'income') renderIncome();
    if (view === 'expense') renderExpense();
    if (view === 'work') renderWork();
    if (view === 'info') renderInfo();
  }

  function renderMonthNav() {
    if (!curMonth) return;
    const i = months.indexOf(curMonth);
    $('#mPrev').disabled = i <= 0;
    $('#mNext').disabled = i >= months.length - 1;
    const [y, m] = curMonth.split('-');
    $('#mLabel').textContent = `${+m}월`;
    const sub = monthTx(curMonth);
    $('#mExp').textContent = fmt(sub.filter(A.isHouseholdExpense).reduce((a, t) => a + t.amount, 0));
    $('#mInc').textContent = fmt(sub.filter(A.isIncome).reduce((a, t) => a + t.amount, 0));
  }

  /* ---------- 홈 ---------- */
  function renderHome() {
    const sub = monthTx(curMonth);
    const exp = sub.filter(A.isHouseholdExpense).reduce((a, t) => a + t.amount, 0);
    const inc = sub.filter(A.isIncome).reduce((a, t) => a + t.amount, 0);
    const work = sub.filter(t => t.is_work).reduce((a, t) => a + t.amount, 0);
    const net = inc - exp;
    const prevM = months[months.indexOf(curMonth) - 1];
    const prevExp = prevM ? monthTx(prevM).filter(A.isHouseholdExpense).reduce((a, t) => a + t.amount, 0) : 0;

    $('#heroNet').textContent = fmt(net);
    $('#heroNet').style.color = net < 0 ? 'var(--expense)' : 'var(--ink)';
    $('#heroSub').innerHTML = inc > 0
      ? `수입의 <b>${Math.max(0, Math.round(net / inc * 100))}%</b> 가 남았습니다`
      : '이 달은 수입 기록이 없습니다';
    $('#heroBar').style.width = Math.min(100, inc > 0 ? exp / inc * 100 : 100) + '%';
    $('#heroBar').style.background = (inc > 0 && exp / inc > 0.9) ? 'var(--expense)' : 'var(--accent)';
    $('#heroL').textContent = '지출 ' + fmt(exp);
    $('#heroR').textContent = '수입 ' + fmt(inc);

    const PL = A.planSummary(FIXED);

    /* 이번 달 남은 생활비 — 화면에서 어느 달을 보든 항상 '오늘' 기준, 가구 공동 */
    const nowD = new Date();
    const curYM = `${nowD.getFullYear()}-${pad2(nowD.getMonth() + 1)}`;
    const dim = new Date(nowD.getFullYear(), nowD.getMonth() + 1, 0).getDate();
    const dnow = nowD.getDate();
    const bgUsed = TX.filter(t => t.tx_date.slice(0, 7) === curYM && isBudgetTx(t))
                     .reduce((a, t) => a + t.amount, 0);
    const bgAmt = +BUDGET.amount || 0;
    const bgLeft = bgAmt - bgUsed;
    const bgPace = bgAmt ? (bgUsed / bgAmt * 100) - (dnow / dim * 100) : 0;

    const stat = (n, v, d, color) => `<div class="stat">
      <div class="n"><i style="background:${color}"></i>${n}</div>
      <div class="v num">${v}</div>${d ? `<div class="d ${d.cls || ''}">${d.txt}</div>` : ''}</div>`;
    const diff = prevExp ? exp - prevExp : null;
    $('#homeStats').innerHTML =
      `<div class="stat" style="cursor:pointer" data-go="budget">
         <div class="n"><i style="background:var(--accent)"></i>남은 생활비 (${nowD.getMonth() + 1}월)</div>
         <div class="v num" style="color:${bgLeft < 0 ? 'var(--expense)' : 'var(--ink)'}">${fmt(bgLeft)}</div>
         <div class="d ${bgPace > 5 ? 'up' : bgPace < -5 ? 'down' : 'flat'}">
           ${dnow}일차 · 사용 ${man(bgUsed)} / ${man(bgAmt)}${bgLeft >= 0 ? ` · 하루 ${man(bgLeft / Math.max(1, dim - dnow + 1))}` : ' · 초과'}
         </div></div>` +
      stat('이번 달 지출', fmt(exp), diff === null ? { txt: '비교할 지난달 없음', cls: 'flat' } :
        { txt: `지난달보다 ${diff > 0 ? '▲' : '▼'} ${man(Math.abs(diff))}`, cls: diff > 0 ? 'up' : 'down' }, 'var(--ink)') +
      stat('고정비', fmt(PL.total), { txt: `매월 ${man(PL.monthlyTotal)}${PL.instTotal ? ` + 할부 ${man(PL.instTotal)}` : ''}`, cls: 'flat' }, 'var(--purple)') +
      stat('업무비용', fmt(work), { txt: '가계 지출에서 제외', cls: 'flat' }, 'var(--warn)') +
      stat('사업 투자', fmt(sub.filter(t => A.isHouseholdExpense(t) && t.category === '사업·투자').reduce((a, t) => a + t.amount, 0)),
        { txt: '평균 비교 제외', cls: 'flat' }, '#7c3aed');

    // 도넛 + 범례
    const cats = A.byCategory(sub);
    $('#homeCatDesc').textContent = `${cats.length}개 분류 · 합계 ${fmt(exp)}`;
    drawChart('chDonut', {
      type: 'doughnut',
      data: { labels: cats.map(c => c.category),
              datasets: [{ data: cats.map(c => c.amount),
                           backgroundColor: cats.map(c => C.CAT_COLORS[c.category] || '#94a3b8'),
                           borderWidth: 3, borderColor: '#fff' }] },
      options: { maintainAspectRatio: false, cutout: '66%',
        plugins: { legend: { display: false },
          tooltip: { callbacks: { label: c => `${c.label} ${fmt(c.parsed)} (${(c.parsed / exp * 100).toFixed(0)}%)` } } } }
    });
    $('#homeLegend').innerHTML = cats.slice(0, 8).map(c => `
      <div class="lg"><span class="dot" style="background:${C.CAT_COLORS[c.category] || '#94a3b8'}"></span>
        <span class="nm">${c.category}</span>
        <span class="pc">${(c.amount / exp * 100).toFixed(0)}%</span>
        <span class="vl num">${fmt(c.amount)}</span></div>`).join('');

    // 2인 가구 비교 (최근 6개월 평균)
    const M = A.monthlyAverage(VTX, 6);
    const myTotal = C.BENCH_CATEGORIES.reduce((a, k) => a + (M.avgByCategory[k] || 0), 0);
    const pct = Math.round((myTotal / BENCH.totalConsumption - 1) * 100);
    $('#benchDesc').innerHTML =
      `최근 ${M.months}개월 월평균 <b>${fmt(myTotal)}</b> · 2인 가구 평균 <b>${fmt(BENCH.totalConsumption)}</b> ` +
      `<span class="${pct > 0 ? 'up' : 'down'}">(${pct > 0 ? '+' : ''}${pct}%)</span>`;
    const maxV = Math.max(1, ...C.BENCH_CATEGORIES.map(k => Math.max(M.avgByCategory[k] || 0, BENCH.items[k])));
    $('#benchBars').innerHTML = C.BENCH_CATEGORIES.map(k => {
      const me = M.avgByCategory[k] || 0, av = BENCH.items[k], d = me - av;
      const cls = d > av * .15 ? 'up' : d < -av * .15 ? 'down' : 'flat';
      return `<div class="bench">
        <div class="hd"><span class="nm">${k}</span>
          <span class="vl num">${fmt(me)}</span>
          <span class="dl ${cls}">${d >= 0 ? '+' : ''}${man(d)}</span></div>
        <div class="track">
          <div class="me" style="width:${Math.min(100, me / maxV * 100)}%;background:${C.CAT_COLORS[k]}"></div>
          <div class="avg" style="left:${av / maxV * 100}%"></div></div></div>`;
    }).join('');

    // 진단
    const { advice, totalSave } = A.buildAdvice(VTX, BENCH);
    $('#adviceHead').innerHTML = totalSave > 0
      ? `제안을 다 실행하면 <b style="color:var(--income)">월 ${man(totalSave)} · 연 ${man(totalSave * 12)}</b> 절약할 수 있습니다.`
      : '최근 6개월 기준 진단입니다.';
    $('#adviceList').innerHTML = advice.map(a => `
      <div class="diag ${a.level}"><h4>${a.title}</h4>
        <p>${a.body}${a.saveLabel ? ` <span class="save">→ ${a.saveLabel}</span>` : ''}</p></div>`).join('');

    // 많이 쓴 곳
    $('#topList').innerHTML = A.topMerchants(sub, 10).map(m => `
      <div class="row"><div class="ic">${C.iconOf(m.category, '')}</div>
        <div class="tx"><div class="t1">${esc(m.merchant)}</div>
          <div class="t2">${m.category} · ${m.count}건</div></div>
        <div class="amt num">${fmt(m.amount)}</div></div>`).join('')
      || '<p class="desc" style="margin:0">이 달 지출 기록이 없습니다.</p>';
  }

  /* ---------- 가계부(거래 내역) ---------- */
  $('#ledgerKind').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    $$('#ledgerKind button').forEach(x => x.classList.toggle('on', x === b));
    ledgerKind = b.dataset.k; ledgerLimit = 60; renderLedger();
  });
  $('#ledgerSearchBtn').addEventListener('click', () => {
    const w = $('#ledgerSearchWrap'); w.classList.toggle('hide');
    if (!w.classList.contains('hide')) $('#fSearch').focus();
  });
  $('#fSearch').addEventListener('input', e => { ledgerQ = e.target.value.trim(); ledgerLimit = 60; renderLedger(); });
  $('#ledgerCats').addEventListener('click', e => {
    const c = e.target.closest('.chip'); if (!c) return;
    ledgerCat = c.dataset.c; ledgerLimit = 60; renderLedger();
  });
  $('#ledgerMore').addEventListener('click', () => { ledgerLimit += 100; renderLedger(); });

  function renderLedger() {
    const base = monthTx(curMonth);
    const cats = [...new Set(base.filter(t => t.kind === 'expense').map(t => t.category))]
      .map(c => ({ c, v: base.filter(t => t.category === c && A.isHouseholdExpense(t)).reduce((a, t) => a + t.amount, 0) }))
      .sort((a, b) => b.v - a.v);
    $('#ledgerCats').innerHTML = `<button class="chip ${ledgerCat === '' ? 'on' : ''}" data-c="">전체</button>` +
      cats.map(o => `<button class="chip ${ledgerCat === o.c ? 'on' : ''}" data-c="${o.c}">${o.c}</button>`).join('');

    let rows = base.filter(t => {
      if (ledgerKind && t.kind !== ledgerKind) return false;
      if (ledgerCat && t.category !== ledgerCat) return false;
      if (ledgerQ && !t.merchant.includes(ledgerQ)) return false;
      return true;
    }).sort((a, b) => a.tx_date < b.tx_date ? 1 : (a.tx_date > b.tx_date ? -1 : (b.amount - a.amount)));

    const total = rows.length;
    rows = rows.slice(0, ledgerLimit);
    $('#ledgerMore').classList.toggle('hide', total <= ledgerLimit);

    const W = ['일', '월', '화', '수', '목', '금', '토'];
    let html = '', lastDay = '';
    for (const t of rows) {
      if (t.tx_date !== lastDay) {
        lastDay = t.tx_date;
        const d = new Date(t.tx_date + 'T00:00:00');
        const dayTot = rows.filter(x => x.tx_date === t.tx_date && A.isHouseholdExpense(x)).reduce((a, x) => a + x.amount, 0);
        html += `<div class="day-sep"><span>${d.getDate()}일 ${W[d.getDay()]}요일</span><span class="ln"></span>
          <span class="num">${dayTot ? '-' + fmt(dayTot) : ''}</span></div>`;
      }
      const income = t.kind === 'income';
      html += `<div class="row ${t.is_work ? 'work' : ''}" data-id="${t.id}">
        <div class="ic">${income ? '💰' : C.iconOf(t.category, t.subcategory)}</div>
        <div class="tx"><div class="t1">${esc(t.merchant)}${t.installment ? ` <span class="tag">할부 ${t.installment}</span>` : ''}${t.is_work ? ' <span class="tag w">업무</span>' : ''}</div>
          <div class="t2">${income ? (t.income_src || '수입') : catSelect(t) + ' ' + budgetChip(t)} · ${srcLabel(t.source)}</div></div>
        <div class="amt num ${income ? 'in' : ''}">${income ? '+' : '-'}${fmt(t.amount)}</div></div>`;
    }
    $('#ledgerList').innerHTML = html || '<p class="desc" style="margin:0;padding:12px 0">내역이 없습니다.</p>';
  }
  const srcLabel = s => ({ samsung_card: '삼성카드', bank: '기업은행', sheet: '가계부 시트',
                           manual: '직접 입력', sms: '문자 자동' }[s] || s);

  /** 생활비 포함/제외 칩 */
  function budgetChip(t) {
    if (t.kind !== 'expense' || !canEdit(t)) return '';
    const on = isBudgetTx(t);
    return `<button class="bchip ${on ? 'on' : ''}" data-bid="${t.id}" title="생활비 예산 포함 여부">${on ? '생활비 ✓' : '생활비 제외'}</button>`;
  }

  // 칩 클릭 → 생활비 포함/제외 전환
  document.addEventListener('click', async e => {
    const b = e.target.closest('.bchip'); if (!b) return;
    e.stopPropagation();
    const id = +b.dataset.bid, t = TX.find(x => x.id === id); if (!t) return;
    const on = isBudgetTx(t);
    let memo = (t.memo || '').replace(/\[생활비\]|\[생활비제외\]/g, '').trim();
    memo = (on ? '[생활비제외] ' : '[생활비] ') + memo;
    await S.updateTx(id, { memo: memo.trim() });
    t.memo = memo.trim();
    applyPerson(); renderAll();
    toast(on ? '생활비에서 제외했습니다' : '생활비에 포함했습니다');
  });

  /** 분류 드롭다운 (언제든 몇 번이든 변경 가능) */
  function catSelect(t) {
    if (!canEdit(t)) return esc(t.subcategory || t.category);
    const opts = C.CATEGORIES.filter(c => c !== '미분류')
      .map(c => `<option value="${c}" ${c === t.category ? 'selected' : ''}>${C.CAT_ICON[c] || ''} ${c}</option>`).join('');
    return `<select class="catsel" data-id="${t.id}">
      <option value="미분류" ${t.category === '미분류' ? 'selected' : ''}>❓ 미분류</option>${opts}</select>` +
      (t.subcategory ? ` <span style="color:var(--muted)">${esc(t.subcategory)}</span>` : '');
  }

  // 드롭다운 변경 → 즉시 저장
  document.addEventListener('change', async e => {
    const sel = e.target.closest('.catsel'); if (!sel) return;
    e.stopPropagation();
    const id = +sel.dataset.id, t = TX.find(x => x.id === id);
    if (!t) return;
    const cat = sel.value;
    const sub = C.CATEGORIES.includes(cat) && cat === t.category ? t.subcategory : '';
    await S.updateTx(id, { category: cat, subcategory: sub });
    t.category = cat; t.subcategory = sub;
    applyPerson(); renderAll(); toast(`${t.merchant} → ${cat}`);
  });

  // 거래 상세 (탭하면 카테고리/업무 변경)
  $('#ledgerList').addEventListener('click', async e => {
    const r = e.target.closest('.row'); if (!r) return;
    if (e.target.closest('.catsel')) return;
    const t = TX.find(x => x.id === +r.dataset.id);
    if (!t || t.kind === 'income' || !canEdit(t)) return;
    if (!confirm(`${t.merchant} ${fmt(t.amount)}\n\n업무비용으로 ${t.is_work ? '해제' : '표시'}할까요?\n(분류는 아래 드롭다운에서 바꾸세요)`)) return;
    await S.updateTx(t.id, { is_work: !t.is_work }); t.is_work = !t.is_work;
    applyPerson(); renderLedger(); toast(t.is_work ? '업무비용으로 제외' : '가계 지출로 복귀');
  });

  /* ---------- 날짜 유틸 ---------- */
  const pad2 = n => String(n).padStart(2, '0');
  const ymShift = (ym, k) => { const [y, m] = ym.split('-').map(Number);
    const d = new Date(y, m - 1 + k, 1); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`; };
  const todayYM = () => { const d = new Date(); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`; };

  /* ================= 통합 입력 (지출 · 수입) ================= */
  $('#fab')?.addEventListener('click', () => go('add'));
  $('#addKind')?.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    $$('#addKind button').forEach(x => x.classList.toggle('on', x === b));
    const inc = b.dataset.k === 'income';
    $('#addExpCard').classList.toggle('hide', inc);
    $('#addIncCard').classList.toggle('hide', !inc);
  });

  function renderAdd() {
    const today = new Date().toISOString().slice(0, 10);
    $('#addWho').textContent = USER ? USER.name : '';
    $('#addWho2').textContent = USER ? USER.name : '';
    if (!$('#axC').options.length)
      $('#axC').innerHTML = C.CATEGORIES.filter(c => c !== '미분류' && c !== '업무비용')
        .map(c => `<option>${C.CAT_ICON[c] || ''} ${c}</option>`).join('');
    if (!$('#aiS').options.length)
      $('#aiS').innerHTML = CFG.INCOME_SOURCES.map(x => `<option>${x}</option>`).join('');
    if (!$('#axD').value) $('#axD').value = today;
    if (!$('#aiD').value) $('#aiD').value = today;

    const mine = TX.filter(t => t.source === 'manual')
      .sort((a, b) => a.tx_date < b.tx_date ? 1 : -1).slice(0, 40);
    $('#addList').innerHTML = mine.map(t => {
      const inc = t.kind === 'income';
      return `<div class="row" data-id="${t.id}">
        <div class="ic">${inc ? '💰' : C.iconOf(t.category, t.subcategory)}</div>
        <div class="tx"><div class="t1">${esc(inc ? (t.income_src || t.merchant) : t.merchant)}
          ${(!inc && isBudgetTx(t)) ? '<span class="tag g">생활비</span>' : ''}</div>
          <div class="t2">${t.tx_date} · ${inc ? '수입' : t.category} · ${ownerOf(t)}</div></div>
        <div class="amt num ${inc ? 'in' : ''}">${inc ? '+' : ''}${fmt(t.amount)}</div>
        ${canEdit(t) ? '<button class="btn ghost sm add-del" style="margin-left:8px">삭제</button>' : ''}</div>`;
    }).join('') || '<p class="desc" style="margin:0;padding:10px 0">직접 입력한 내역이 없습니다.</p>';
  }

  const stripIcon = v => v.replace(/^[^\p{L}\p{N}]+/u, '').trim();

  // 사용처를 치면 분류를 자동으로 골라준다 (직접 바꿔도 됨)
  $('#axN')?.addEventListener('input', e => {
    const g = C.categorize(e.target.value.trim());
    if (!g.matched) return;
    const opt = [...$('#axC').options].find(o => stripIcon(o.value) === g.category);
    if (opt) $('#axC').value = opt.value;
    // 생활비 성격이면 체크, 아니면 해제
    const budgetish = BUDGET_SUBS.has(g.sub) || BUDGET_CATS.has(g.category);
    $('#axBudget').checked = budgetish;
  });

  $('#addExpForm')?.addEventListener('submit', async e => {
    e.preventDefault(); $('#axErr').textContent = '';
    try {
      const d = $('#axD').value, amt = +$('#axA').value, nm = $('#axN').value.trim();
      if (!d || !amt || !nm) throw new Error('날짜 · 금액 · 사용처를 입력하세요.');
      const cat = stripIcon($('#axC').value);
      const g = C.categorize(nm);
      const tag = $('#axBudget').checked ? '[생활비]' : '[생활비제외]';
      const memo = [tag, $('#axM').value.trim()].filter(Boolean).join(' ');
      await S.insertTx([{
        kind: 'expense', source: 'manual', tx_date: d, merchant: C.normalizeMerchant(nm),
        amount: amt, raw_amount: amt, benefit: 0,
        category: cat, subcategory: (g.matched && g.category === cat) ? g.sub : '',
        income_src: null, is_work: false, installment: '', bill_month: null,
        memo, owner: USER.name,
        fingerprint: `manual|out|${d}|${nm}|${amt}|${Date.now()}`
      }]);
      $('#axA').value = ''; $('#axN').value = ''; $('#axM').value = '';
      await reload(); go('add'); toast($('#axBudget').checked ? '생활비에 반영되었습니다' : '지출이 저장되었습니다');
    } catch (err) { $('#axErr').textContent = err.message; }
  });

  $('#addIncForm')?.addEventListener('submit', async e => {
    e.preventDefault(); $('#aiErr').textContent = '';
    try {
      const src = $('#aiS').value, d = $('#aiD').value, amt = +$('#aiA').value;
      if (!d || !amt) throw new Error('날짜와 금액을 입력하세요.');
      await S.insertTx([{
        kind: 'income', source: 'manual', tx_date: d, merchant: src, amount: amt, raw_amount: amt,
        benefit: 0, category: '수입', subcategory: src, income_src: src, is_work: false,
        installment: '', bill_month: null, memo: $('#aiM').value.trim(), owner: USER.name,
        fingerprint: `manual|in|${d}|${src}|${amt}|${Date.now()}`
      }]);
      $('#aiA').value = ''; $('#aiM').value = '';
      await reload(); go('add'); toast('수입이 저장되었습니다');
    } catch (err) { $('#aiErr').textContent = err.message; }
  });

  $('#addList')?.addEventListener('click', async e => {
    if (!e.target.classList.contains('add-del')) return;
    const id = +e.target.closest('.row').dataset.id;
    if (!confirm('삭제할까요?')) return;
    await S.deleteTx(id); TX = TX.filter(t => t.id !== id);
    applyPerson(); renderAdd(); toast('삭제됨');
  });

  /* ================= 생활비 예산 ================= */
  $('#bgForm')?.addEventListener('submit', async e => {
    e.preventDefault();
    const v = Math.max(0, +$('#bgAmt').value || 0);
    if (!v) return;
    BUDGET = Object.assign({}, BUDGET, { amount: v });
    await S.setSetting('budget', BUDGET);
    renderBudget(); toast(`생활비 예산 ${fmt(v)} 저장`);
  });
  $('#bgMore')?.addEventListener('click', () => { bgLimit += 60; renderBudget(); });

  function renderBudget() {
    const now = new Date();
    const ym = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}`;
    const dim = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const today = now.getDate();

    const rows = TX.filter(t => t.tx_date.slice(0, 7) === ym && isBudgetTx(t));   // 가구 공동 예산
    const used = rows.reduce((a, t) => a + t.amount, 0);
    const amount = +BUDGET.amount || 0;
    const left = amount - used;
    const pacePct = today / dim * 100;
    const usedPct = amount ? used / amount * 100 : 0;

    $('#bgAmt').value = amount || '';
    $('#bgTitle').textContent = `${now.getMonth() + 1}월 생활비 · ${today}일차 / ${dim}일`;
    $('#bgLeft').textContent = fmt(left);
    $('#bgLeft').style.color = left < 0 ? 'var(--expense)' : 'var(--ink)';
    $('#bgSub').innerHTML = left >= 0
      ? `남은 ${dim - today + 1}일 동안 하루 <b>${fmt(left / Math.max(1, dim - today + 1))}</b> 까지 가능`
      : `예산을 <b class="up">${fmt(-left)}</b> 넘겼습니다`;
    $('#bgBar').style.width = Math.min(100, usedPct) + '%';
    $('#bgBar').style.background = usedPct > pacePct + 8 ? 'var(--expense)' : 'var(--accent)';
    $('#bgPace').style.left = Math.min(100, pacePct) + '%';
    $('#bgUsed').textContent = `사용 ${fmt(used)} (${usedPct.toFixed(0)}%)`;
    $('#bgBudget').textContent = `예산 ${fmt(amount)}`;
    const gap = usedPct - pacePct;
    $('#bgPaceMsg').innerHTML = Math.abs(gap) < 5
      ? '지금 페이스는 예산과 비슷합니다.'
      : (gap > 0
          ? `날짜 기준(${pacePct.toFixed(0)}%)보다 <b class="up">${gap.toFixed(0)}%p 빠르게</b> 쓰고 있습니다. 이대로면 월말 ${fmt(used / Math.max(1, today) * dim)} 예상.`
          : `날짜 기준(${pacePct.toFixed(0)}%)보다 <b class="down">${(-gap).toFixed(0)}%p 여유</b> 있습니다. 이대로면 월말 ${fmt(used / Math.max(1, today) * dim)} 예상.`);

    // 지난달 같은 날까지 비교
    const prevYm = ymShift(ym, -1);
    const prevSame = TX.filter(t => t.tx_date.slice(0, 7) === prevYm &&
      +t.tx_date.slice(8, 10) <= today && isBudgetTx(t)).reduce((a, t) => a + t.amount, 0);
    const stat = (n, v, d, color) => `<div class="stat"><div class="n"><i style="background:${color}"></i>${n}</div>
      <div class="v num">${v}</div><div class="d flat">${d}</div></div>`;
    $('#bgStats').innerHTML =
      stat('오늘까지 사용', fmt(used), `${rows.length}건`, 'var(--ink)') +
      stat('하루 평균', fmt(used / Math.max(1, today)), `월말 예상 ${man(used / Math.max(1, today) * dim)}`, 'var(--accent)') +
      stat('지난달 같은 날', fmt(prevSame), prevSame ? `${used > prevSame ? '+' : ''}${man(used - prevSame)}` : '비교 없음', 'var(--purple)') +
      stat('남은 예산', fmt(left), `${Math.max(0, dim - today + 1)}일 남음`, left < 0 ? 'var(--expense)' : 'var(--income)');

    // 어디에 썼나 (가맹점 그룹)
    const byMer = new Map();
    for (const t of rows) {
      const key = t.merchant;
      const o = byMer.get(key) || { name: key, amount: 0, count: 0, cat: t.category, sub: t.subcategory };
      o.amount += t.amount; o.count++; byMer.set(key, o);
    }
    const list = [...byMer.values()].sort((a, b) => b.amount - a.amount);
    $('#bgWhereDesc').textContent = list.length ? `${list.length}곳 · 합계 ${fmt(used)}` : '이번 달 생활비 지출이 아직 없습니다.';
    $('#bgWhere').innerHTML = list.slice(0, 20).map(m => `
      <div class="row"><div class="ic">${C.iconOf(m.cat, m.sub)}</div>
        <div class="tx"><div class="t1">${esc(m.name)}</div>
          <div class="t2">${m.sub || m.cat} · ${m.count}건</div></div>
        <div class="amt num">${fmt(m.amount)}</div></div>`).join('');

    // 날짜별
    const days = Array.from({ length: dim }, (_, i) => i + 1);
    const daily = days.map(dd => rows.filter(t => +t.tx_date.slice(8, 10) === dd).reduce((a, t) => a + t.amount, 0));
    let cum = 0; const cumArr = daily.map(v => (cum += v));
    drawChart('chBgDaily', {
      data: { labels: days,
        datasets: [
          { type: 'bar', label: '일별', data: daily, backgroundColor: '#93c5fd', borderRadius: 3, order: 2 },
          { type: 'line', label: '누적', data: cumArr.map((v, i) => i < today ? v : null),
            borderColor: '#14b8a6', tension: .3, pointRadius: 0, borderWidth: 2, order: 1 },
          { type: 'line', label: '예산 페이스', borderDash: [5, 4], borderColor: '#cbd5e1', pointRadius: 0,
            borderWidth: 2, data: days.map(dd => amount / dim * dd), order: 0 }
        ] },
      options: { maintainAspectRatio: false,
        plugins: { legend: { labels: { boxWidth: 9, font: { size: 10.5 } } },
                   tooltip: { callbacks: { label: c => `${c.dataset.label} ${fmt(c.parsed.y)}` } } },
        scales: { x: { grid: { display: false } }, y: { ticks: { callback: v => man(v) } } } }
    });

    // 내역
    const sorted = rows.sort((a, b) => a.tx_date < b.tx_date ? 1 : -1);
    const show = sorted.slice(0, bgLimit);
    $('#bgMore').classList.toggle('hide', sorted.length <= bgLimit);
    let html = '', last = '';
    for (const t of show) {
      if (t.tx_date !== last) {
        last = t.tx_date;
        const day = rows.filter(x => x.tx_date === t.tx_date).reduce((a, x) => a + x.amount, 0);
        html += `<div class="day-sep"><span>${t.tx_date}</span><span class="ln"></span><span class="num">${fmt(day)}</span></div>`;
      }
      html += `<div class="row" data-id="${t.id}"><div class="ic">${C.iconOf(t.category, t.subcategory)}</div>
        <div class="tx"><div class="t1">${esc(t.merchant)}${t.source === 'sms' ? ' <span class="tag g">문자</span>' : ''}</div>
          <div class="t2">${catSelect(t)} ${budgetChip(t)} · ${ownerOf(t)}</div></div>
        <div class="amt num">${fmt(t.amount)}</div>
        ${canEdit(t) ? '<button class="btn ghost sm bg-del" style="margin-left:8px">삭제</button>' : ''}</div>`;
    }
    $('#bgList').innerHTML = html || '<p class="desc" style="margin:0;padding:10px 0">아직 사용 내역이 없습니다.</p>';
  }

  $('#bgList')?.addEventListener('click', async e => {
    if (!e.target.classList.contains('bg-del')) return;
    const id = +e.target.closest('.row').dataset.id;
    if (!confirm('이 내역을 삭제할까요?')) return;
    await S.deleteTx(id); TX = TX.filter(t => t.id !== id);
    applyPerson(); renderBudget(); toast('삭제됨');
  });

  /* ================= 쿠팡 ================= */
  const cpMonths = () => [...new Set(CP.map(r => r.order_date.slice(0, 7)))].sort();

  function cpScoped() {
    if (cpRange === 'cur')  return CP.filter(r => r.order_date.slice(0, 7) === todayYM());
    if (cpRange === 'prev') return CP.filter(r => r.order_date.slice(0, 7) === ymShift(todayYM(), -1));
    if (cpRange === 'custom') {
      const f = $('#cpFrom').value, t = $('#cpTo').value;
      return CP.filter(r => (!f || r.order_date >= f) && (!t || r.order_date <= t));
    }
    if (!cpRange) return CP;
    const keys = new Set(cpMonths().slice(-cpRange));
    return CP.filter(r => keys.has(r.order_date.slice(0, 7)));
  }

  $('#cpRange').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    $$('#cpRange button').forEach(x => x.classList.toggle('on', x === b));
    cpRange = /^\d+$/.test(b.dataset.r) ? +b.dataset.r : b.dataset.r;
    $('#cpCustom').classList.toggle('hide', cpRange !== 'custom');
    if (cpRange === 'custom' && !$('#cpFrom').value) {
      const ms = cpMonths();
      $('#cpFrom').value = (ms[0] || todayYM()) + '-01';
      $('#cpTo').value = new Date().toISOString().slice(0, 10);
    }
    cpLimit = 60; renderCoupang();
  });
  ['#cpFrom', '#cpTo'].forEach(sel => $(sel).addEventListener('change', () => { cpLimit = 60; renderCoupang(); }));
  $('#cpTopMode').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    $$('#cpTopMode button').forEach(x => x.classList.toggle('on', x === b));
    cpTopMode = b.dataset.m; renderCoupang();
  });
  $('#cpSearch').addEventListener('input', e => { cpQ = e.target.value.trim(); cpLimit = 60; renderCpList(); });
  $('#cpCats').addEventListener('click', e => {
    const c = e.target.closest('.chip'); if (!c) return;
    cpCat = c.dataset.c; cpLimit = 60; renderCoupang();
  });
  $('#cpMore').addEventListener('click', () => { cpLimit += 100; renderCpList(); });

  function renderCoupang() {
    if (!CP.length) {
      $('#cpTotal').textContent = '—';
      $('#cpSub').textContent = '쿠팡 주문 데이터가 없습니다. 더보기 → 명세서 업로드에서 CSV를 올려주세요.';
      return;
    }
    const rows = cpScoped();
    const ms = [...new Set(rows.map(r => r.order_date.slice(0, 7)))].sort();
    const total = rows.reduce((a, r) => a + (+r.price || 0), 0);
    const nMon = Math.max(1, ms.length);
    const cmp = $('#cpCompare');

    /* ---- 헤더 ---- */
    if (cpRange === 'cur' || cpRange === 'prev') {
      const ym = cpRange === 'cur' ? todayYM() : ymShift(todayYM(), -1);
      const [yy, mm] = ym.split('-');
      $('#cpPeriod').textContent = `${yy}년 ${+mm}월 쿠팡 주문`;
      $('#cpTotal').textContent = fmt(total);
      if (cpRange === 'cur') {
        const today = new Date().getDate();
        const prevYm = ymShift(ym, -1);
        const prevAll = CP.filter(r => r.order_date.slice(0, 7) === prevYm);
        const prevSame = prevAll.filter(r => +r.order_date.slice(8, 10) <= today).reduce((a, r) => a + (+r.price || 0), 0);
        const prevTot = prevAll.reduce((a, r) => a + (+r.price || 0), 0);
        const diff = total - prevSame;
        $('#cpSub').innerHTML = rows.length ? `${rows.length}건 · ${today}일까지 누적` : '아직 이번 달 주문이 없습니다';
        cmp.classList.remove('hide');
        const max = Math.max(total, prevTot, 1);
        $('#cpBar').style.width = Math.min(100, total / max * 100) + '%';
        $('#cpBar').style.background = diff > 0 ? 'var(--expense)' : 'var(--accent)';
        $('#cpAvgMark').style.left = (prevTot / max * 100) + '%';
        $('#cpCmpL').innerHTML = prevAll.length
          ? `지난달 ${today}일까지 ${fmt(prevSame)} · <b class="${diff > 0 ? 'up' : 'down'}">${diff >= 0 ? '+' : ''}${man(diff)}</b>`
          : '지난달 비교 데이터 없음';
        $('#cpCmpR').textContent = prevTot ? `지난달 전체 ${fmt(prevTot)}` : '';
      } else {
        const dd = new Date(+yy, +mm, 0).getDate();
        $('#cpSub').innerHTML = `${rows.length}건 · 하루 평균 ${fmt(total / dd)}`;
        cmp.classList.add('hide');
      }
    } else {
      cmp.classList.add('hide');
      if (cpRange === 'custom') {
        const f = $('#cpFrom').value || (ms[0] || ''), t = $('#cpTo').value || (ms[ms.length - 1] || '');
        const days = Math.max(1, Math.round((new Date(t) - new Date(f)) / 86400000) + 1);
        $('#cpPeriod').textContent = `${f} ~ ${t}`;
        $('#cpTotal').textContent = fmt(total);
        $('#cpSub').innerHTML = `${rows.length.toLocaleString()}건 · ${days}일 · 하루 평균 <b>${fmt(total / days)}</b>`;
      } else {
        $('#cpPeriod').textContent = `${ms[0] || ''} ~ ${ms[ms.length - 1] || ''} 쿠팡 주문`;
        $('#cpTotal').textContent = fmt(total);
        $('#cpSub').innerHTML = `${rows.length.toLocaleString()}건 · 월평균 <b>${fmt(total / nMon)}</b>`;
      }
    }

    renderCpMonthChart();
    renderCpMatch();

    /* ---- 데이터 없음 ---- */
    if (!rows.length) {
      $('#cpStats').innerHTML = '';
      $('#cpCatDesc').textContent = '이 기간에 주문이 없습니다.';
      $('#cpLegend').innerHTML = ''; $('#cpTop').innerHTML = ''; $('#cpCats').innerHTML = '';
      drawChart('chCpDonut', { type: 'doughnut', data: { labels: [], datasets: [{ data: [] }] },
        options: { maintainAspectRatio: false, plugins: { legend: { display: false } } } });
      renderCpList();
      return;
    }

    /* ---- 통계 ---- */
    const qtyTot = rows.reduce((a, r) => a + (+r.qty || 1), 0);
    const byCat = new Map();
    for (const r of rows) byCat.set(r.category, (byCat.get(r.category) || 0) + (+r.price || 0));
    const cats = [...byCat.entries()].sort((a, b) => b[1] - a[1]);
    const stat = (n, v, d, color) => `<div class="stat"><div class="n"><i style="background:${color}"></i>${n}</div>
      <div class="v num">${v}</div><div class="d flat">${d}</div></div>`;
    $('#cpStats').innerHTML =
      stat('월평균', fmt(total / nMon), `${(rows.length / nMon).toFixed(0)}건/월`, 'var(--ink)') +
      stat('건당 평균', fmt(total / rows.length), `총 ${qtyTot.toLocaleString()}개 구매`, 'var(--accent)') +
      stat('가장 많이 쓴 곳', cats[0][0], fmt(cats[0][1]), C.COUPANG_COLORS[cats[0][0]] || '#94a3b8') +
      stat('최고가 상품', fmt(Math.max(0, ...rows.map(r => +r.price || 0))), '단일 주문 기준', 'var(--warn)');

    /* ---- 도넛 ---- */
    $('#cpCatDesc').textContent = `${cats.length}개 분류 · 합계 ${fmt(total)}`;
    drawChart('chCpDonut', {
      type: 'doughnut',
      data: { labels: cats.map(c => c[0]),
              datasets: [{ data: cats.map(c => c[1]),
                           backgroundColor: cats.map(c => C.COUPANG_COLORS[c[0]] || '#94a3b8'),
                           borderWidth: 3, borderColor: '#fff' }] },
      options: { maintainAspectRatio: false, cutout: '66%',
        plugins: { legend: { display: false },
          tooltip: { callbacks: { label: c => `${c.label} ${fmt(c.parsed)} (${(c.parsed / total * 100).toFixed(0)}%)` } } } }
    });
    $('#cpLegend').innerHTML = cats.map(c => {
      const cnt = rows.filter(r => r.category === c[0]).length;
      return `<div class="lg"><span class="dot" style="background:${C.COUPANG_COLORS[c[0]] || '#94a3b8'}"></span>
        <span class="nm">${C.COUPANG_ICON[c[0]] || '📦'} ${c[0]}</span>
        <span class="pc">${(c[1] / total * 100).toFixed(0)}% · ${cnt}건</span>
        <span class="vl num">${fmt(c[1])}</span></div>`;
    }).join('');

    /* ---- 많이 산 상품 ---- */
    const agg = new Map();
    for (const r of rows) {
      const key = r.name.replace(/,\s*\d+개$|,\s*\d+세트$/, '').slice(0, 60);
      const o = agg.get(key) || { name: key, category: r.category, amount: 0, qty: 0, count: 0 };
      o.amount += +r.price || 0; o.qty += +r.qty || 1; o.count++;
      agg.set(key, o);
    }
    const sorted = [...agg.values()].sort((a, b) => b[cpTopMode] - a[cpTopMode]).slice(0, 15);
    const unit = { amount: '', qty: '개', count: '회' }[cpTopMode];
    $('#cpTop').innerHTML = sorted.map((m, i) => `
      <div class="row"><div class="ic">${C.COUPANG_ICON[m.category] || '📦'}</div>
        <div class="tx"><div class="t1">${i + 1}. ${esc(m.name)}</div>
          <div class="t2">${m.category} · ${m.count}회 · ${m.qty}개</div></div>
        <div class="amt num">${cpTopMode === 'amount' ? fmt(m.amount) : m[cpTopMode] + unit}</div></div>`).join('');

    /* ---- 분류 칩 ---- */
    $('#cpCats').innerHTML = `<button class="chip ${cpCat === '' ? 'on' : ''}" data-c="">전체</button>` +
      cats.map(c => `<button class="chip ${cpCat === c[0] ? 'on' : ''}" data-c="${c[0]}">${C.COUPANG_ICON[c[0]] || ''} ${c[0]}</button>`).join('');
    renderCpList();
  }

  function renderCpMonthChart() {
    const all = cpMonths(), keep = all.slice(-18);
    const inScope = new Set(cpScoped().map(r => r.order_date.slice(0, 7)));
    drawChart('chCpMonth', {
      type: 'bar',
      data: { labels: keep.map(m => m.slice(2)),
        datasets: [{ label: '쿠팡 지출', borderRadius: 5,
          backgroundColor: keep.map(m => inScope.has(m) ? '#2563eb' : '#cbd5e1'),
          data: keep.map(m => CP.filter(r => r.order_date.slice(0, 7) === m).reduce((a, r) => a + (+r.price || 0), 0)) }] },
      options: { maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => fmt(c.parsed.y) } } },
        scales: { x: { grid: { display: false } }, y: { ticks: { callback: v => man(v) } } } }
    });
  }

  function renderCpMatch() {
    const cardByM = new Map();
    for (const t of VTX) {
      if (t.kind !== 'expense' || t.source !== 'samsung_card') continue;
      if (!/쿠팡/.test(t.merchant) || /와우|이츠/.test(t.merchant)) continue;
      const m = t.tx_date.slice(0, 7);
      cardByM.set(m, (cardByM.get(m) || 0) + t.amount);
    }
    const mset = [...new Set([...cpMonths(), ...cardByM.keys()])].sort().reverse().slice(0, 14);
    $('#tblCpMatch tbody').innerHTML = mset.map(m => {
      const o = CP.filter(r => r.order_date.slice(0, 7) === m).reduce((a, r) => a + (+r.price || 0), 0);
      const c = cardByM.get(m) || 0, d = o - c;
      return `<tr><td>${m}</td><td class="num">${o ? fmt(o) : '—'}</td>
        <td class="num">${c ? fmt(c) : '—'}</td>
        <td class="num ${Math.abs(d) < 20000 ? 'flat' : (d > 0 ? 'up' : 'down')}">${(o && c) ? (d >= 0 ? '+' : '') + man(d) : '—'}</td></tr>`;
    }).join('');
  }

  function renderCpList() {
    let rows = cpScoped().filter(r => {
      if (cpCat && r.category !== cpCat) return false;
      if (cpQ && !r.name.includes(cpQ)) return false;
      return true;
    }).sort((a, b) => a.order_date < b.order_date ? 1 : -1);
    const total = rows.length;
    rows = rows.slice(0, cpLimit);
    $('#cpMore').classList.toggle('hide', total <= cpLimit);

    let html = '', last = '';
    for (const r of rows) {
      if (r.order_date !== last) {
        last = r.order_date;
        const day = cpScoped().filter(x => x.order_date === r.order_date).reduce((a, x) => a + (+x.price || 0), 0);
        html += `<div class="day-sep"><span>${r.order_date}</span><span class="ln"></span><span class="num">${fmt(day)}</span></div>`;
      }
      html += `<div class="row"><div class="ic">${C.COUPANG_ICON[r.category] || '📦'}</div>
        <div class="tx"><div class="t1">${esc(r.name)}</div>
          <div class="t2">${r.category}${(+r.qty > 1) ? ` · ${r.qty}개` : ''}</div></div>
        <div class="amt num">${fmt(+r.price || 0)}</div></div>`;
    }
    $('#cpList').innerHTML = html || '<p class="desc" style="margin:0;padding:10px 0">해당하는 주문이 없습니다.</p>';
  }

  /* ---------- 고정비 ---------- */
  const FX_CYCLES = ['매월', '격월', '분기', '반기', '연'];
  const fixedScoped = () => person ? FIXED.filter(f => ownerOf(f) === person) : FIXED;

  function renderFixedTab() {
    const LIST = fixedScoped();
    const PL = A.planSummary(LIST), ed = canWrite();
    const inc = A.incomeAvg(VTX, /./, 6);
    const vsInc = inc > 0 ? PL.total / inc * 100 : null;

    $('#fxTotal').textContent = fmt(PL.total);
    $('#fxSub').innerHTML = `매월 ${fmt(PL.monthlyTotal)}` +
      (PL.instTotal ? ` + 일시 할부 ${fmt(PL.instTotal)}` : '') +
      (vsInc !== null ? ` · 수입의 <b>${vsInc.toFixed(0)}%</b>` : '');

    const stat = (n, v, d, color) => `<div class="stat"><div class="n"><i style="background:${color}"></i>${n}</div>
      <div class="v num">${v}</div><div class="d flat">${d}</div></div>`;
    $('#fxStats').innerHTML =
      stat('매월 고정비', fmt(PL.monthlyTotal), `${PL.monthly.length}개 항목`, 'var(--ink)') +
      stat('일시 할부', fmt(PL.instTotal), PL.maxLeftM ? `최대 ${PL.maxLeftM}개월 · 잔액 ${man(PL.instLeft)}` : '진행 중 없음', 'var(--warn)') +
      stat('할부 종료 후', fmt(PL.monthlyTotal), PL.instTotal ? `월 ${man(PL.instTotal)} 줄어듭니다` : '변동 없음', 'var(--income)') +
      (PL.done.length ? stat('완납', fmt(PL.doneTotal), `${PL.done.length}건 종료됨`, 'var(--accent)') : '');

    drawChart('chFxCat', {
      type: 'doughnut',
      data: { labels: PL.byCat.map(c => c[0]),
              datasets: [{ data: PL.byCat.map(c => c[1]),
                           backgroundColor: PL.byCat.map(c => C.CAT_COLORS[c[0]] || '#94a3b8'),
                           borderWidth: 3, borderColor: '#fff' }] },
      options: { maintainAspectRatio: false, cutout: '66%',
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => `${c.label} ${fmt(c.parsed)}` } } } }
    });
    const tot = PL.byCat.reduce((a, c) => a + c[1], 0) || 1;
    $('#fxLegend').innerHTML = PL.byCat.map(c => `
      <div class="lg"><span class="dot" style="background:${C.CAT_COLORS[c[0]] || '#94a3b8'}"></span>
        <span class="nm">${c[0]}</span><span class="pc">${(c[1] / tot * 100).toFixed(0)}%</span>
        <span class="vl num">${fmt(c[1])}</span></div>`).join('');

    const cats = C.CATEGORIES.filter(c => c !== '미분류');
    $('#fxCat').innerHTML = cats.map(c => `<option>${c}</option>`).join('');

    const sorted = [...LIST].sort((a, b) => {
      const off = x => (x.active === false || A.instDone(x)) ? 1 : 0;
      return off(a) - off(b) || (a.sort || 0) - (b.sort || 0);
    });
    $('#tblFx tbody').innerHTML = sorted.map(f => {
      const per = (+f.amount || 0) / (A.CYCLE_DIV[f.cycle] || 1);
      const done = A.instDone(f);
      const inp = (cls, val, type, w) => `<input class="pill ${cls}" type="${type}" value="${esc(val ?? '')}" style="padding:5px 8px;font-size:12.5px;width:${w};border-radius:9px">`;
      const sel = (cls, opts, val) => `<select class="pill ${cls}" style="padding:5px 22px 5px 8px;font-size:12.5px;border-radius:9px">${opts.map(o => `<option ${o === val ? 'selected' : ''}>${o}</option>`).join('')}</select>`;
      const mine = canEditFixed(f);
      if (!mine) return `<tr class="${done ? 'off' : ''}"><td>${f.active === false ? '중지' : '사용'}</td><td>${esc(f.name)} <span class="tag">${ownerOf(f)}</span></td>
        <td class="num">${fmt(+f.amount || 0)}</td><td>${f.cycle}</td><td>${f.kind}</td>
        <td>${f.kind === '할부' ? `${f.inst_now || 0}/${f.inst_total || 0}` : '—'}</td>
        <td><span class="tag">${f.category}</span></td><td>${esc(f.method || '')}</td>
        <td>${esc(f.memo || '')}</td><td class="num"><b>${fmt(per)}</b></td><td></td></tr>`;
      return `<tr data-id="${f.id}" class="${(f.active === false || done) ? 'off' : ''}">
        <td><input type="checkbox" class="fx-active" ${f.active === false ? '' : 'checked'}></td>
        <td>${inp('fx-name', f.name, 'text', '140px')} <span class="tag">${ownerOf(f)}</span></td>
        <td class="num">${inp('fx-amt', +f.amount || 0, 'number', '100px')}</td>
        <td>${sel('fx-cycle', FX_CYCLES, f.cycle)}</td>
        <td>${sel('fx-kind', ['고정', '할부'], f.kind)}</td>
        <td>${f.kind === '할부'
              ? `${inp('fx-in', f.inst_now ?? '', 'number', '42px')}/${inp('fx-it', f.inst_total ?? '', 'number', '42px')}` +
                (done ? ' <span class="tag g">완납</span>' : ' <button class="btn ghost sm fx-plus" style="padding:3px 7px">+1</button>')
              : '<span style="color:#cbd5e1">—</span>'}</td>
        <td>${sel('fx-cat', cats, f.category)}</td>
        <td>${inp('fx-method', f.method, 'text', '105px')}</td>
        <td>${inp('fx-memo', f.memo, 'text', '160px')}</td>
        <td class="num"><b>${fmt(per)}</b></td>
        <td style="white-space:nowrap">
          ${f.kind === '할부' && !done
            ? '<button class="btn ghost sm fx-done" style="margin-right:4px">납부완료</button>'
            : (f.active !== false ? '<button class="btn ghost sm fx-stop" style="margin-right:4px">종료</button>' : '<button class="btn ghost sm fx-on" style="margin-right:4px">재개</button>')}
          <button class="btn ghost sm fx-del">삭제</button></td></tr>`;
    }).join('') || '<tr><td colspan="11" style="color:var(--muted)">등록된 고정비가 없습니다.</td></tr>';

    // 자동 감지
    const recur = A.recurringMerchants(VTX, 6, 4);
    const keys = new Set(A.effectiveMonths(VTX).slice(-6));
    const agg = new Map();
    for (const t of VTX) {
      if (!A.isHouseholdExpense(t) || !recur.has(t.merchant)) continue;
      if (!keys.has(t.tx_date.slice(0, 7))) continue;
      const o = agg.get(t.merchant) || { merchant: t.merchant, category: t.category, sub: t.subcategory, amount: 0, ms: new Set() };
      o.amount += t.amount; o.ms.add(t.tx_date.slice(0, 7)); agg.set(t.merchant, o);
    }
    const known = LIST.map(f => (f.match || f.name));
    $('#tblFxDetect tbody').innerHTML = [...agg.values()]
      .filter(o => !known.some(k => k && (o.merchant.includes(k) || k.includes(o.merchant))))
      .sort((a, b) => b.amount - a.amount)
      .map(o => `<tr data-m="${esc(o.merchant)}" data-c="${esc(o.category)}" data-a="${Math.round(o.amount / Math.max(1, keys.size))}">
        <td>${esc(o.merchant)}</td><td><span class="tag">${o.category}</span></td>
        <td class="num">${fmt(o.amount / Math.max(1, keys.size))}</td><td>${o.ms.size}/${keys.size}개월</td>
        <td>${ed ? '<button class="btn ghost sm fx-add">추가</button>' : ''}</td></tr>`).join('')
      || '<tr><td colspan="5" style="color:var(--muted)">새로 감지된 반복 결제가 없습니다.</td></tr>';
  }

  $('#tblFx').addEventListener('change', async e => {
    const tr = e.target.closest('tr'); if (!tr?.dataset.id) return;
    const id = +tr.dataset.id, g = c => tr.querySelector('.' + c);
    await S.updateFixed(id, {
      name: g('fx-name').value, amount: +g('fx-amt').value || 0,
      cycle: g('fx-cycle').value, kind: g('fx-kind').value,
      category: g('fx-cat').value, method: g('fx-method').value,
      memo: g('fx-memo').value, active: g('fx-active').checked,
      inst_now: g('fx-in') ? (+g('fx-in').value || null) : null,
      inst_total: g('fx-it') ? (+g('fx-it').value || null) : null
    });
    FIXED = await S.listFixed(); renderFixedTab(); toast('저장됨');
  });
  $('#tblFx').addEventListener('click', async e => {
    const tr = e.target.closest('tr'); if (!tr?.dataset.id) return;
    const id = +tr.dataset.id;
    if (e.target.classList.contains('fx-done')) {
      const f = FIXED.find(x => x.id === id);
      if (!confirm(`${f.name} 을(를) 납부 완료 처리할까요?\n고정비 합계에서 빠집니다.`)) return;
      await S.updateFixed(id, { inst_now: (+f.inst_total || 1) });
      FIXED = await S.listFixed(); renderFixedTab(); renderHome();
      toast(`${f.name} 완납! 월 ${man(+f.amount)} 절감`);
      return;
    }
    if (e.target.classList.contains('fx-stop')) {
      const f = FIXED.find(x => x.id === id);
      if (!confirm(`${f.name} 을(를) 종료할까요?\n고정비 합계에서 빠지고, 나중에 재개할 수 있습니다.`)) return;
      await S.updateFixed(id, { active: false });
      FIXED = await S.listFixed(); renderFixedTab(); renderHome(); toast('종료되었습니다');
      return;
    }
    if (e.target.classList.contains('fx-on')) {
      await S.updateFixed(id, { active: true });
      FIXED = await S.listFixed(); renderFixedTab(); renderHome(); toast('다시 시작합니다');
      return;
    }
    if (e.target.classList.contains('fx-plus')) {
      const f = FIXED.find(x => x.id === id);
      await S.updateFixed(id, { inst_now: (+f.inst_now || 0) + 1 });
      FIXED = await S.listFixed(); renderFixedTab();
      const nf = FIXED.find(x => x.id === id);
      toast(A.instDone(nf) ? `${nf.name} 완납! 월 ${man(+nf.amount)} 절감` : `${nf.name} ${nf.inst_now}/${nf.inst_total}회차`);
    } else if (e.target.classList.contains('fx-del')) {
      if (!confirm('삭제할까요?')) return;
      await S.deleteFixed(id); FIXED = await S.listFixed(); renderFixedTab(); toast('삭제됨');
    }
  });
  $('#fxKind')?.addEventListener('change', () => {
    const inst = $('#fxKind').value === '할부';
    $('#fxInstTotal').classList.toggle('hide', !inst);
    $('#fxInstNow').classList.toggle('hide', !inst);
  });

  $('#fxForm').addEventListener('submit', async e => {
    e.preventDefault();
    const isInst = $('#fxKind').value === '할부';
    const total = +$('#fxInstTotal').value || null;
    if (isInst && !total) { toast('할부 총 개월 수를 입력하세요'); return; }
    await S.insertFixed([{ name: $('#fxName').value, amount: +$('#fxAmt').value || 0,
      cycle: $('#fxCycle').value, kind: $('#fxKind').value, category: $('#fxCat').value,
      method: $('#fxMethod').value, match: $('#fxName').value, memo: '', active: true,
      inst_total: isInst ? total : null,
      inst_now: isInst ? (+$('#fxInstNow').value || 0) : null,
      owner: USER.name, sort: FIXED.length }]);
    $('#fxName').value = ''; $('#fxAmt').value = ''; $('#fxMethod').value = '';
    $('#fxInstTotal').value = ''; $('#fxInstNow').value = '';
    FIXED = await S.listFixed(); renderFixedTab(); toast('추가되었습니다');
  });
  $('#tblFxDetect').addEventListener('click', async e => {
    if (!e.target.classList.contains('fx-add')) return;
    const tr = e.target.closest('tr');
    await S.insertFixed([{ name: tr.dataset.m, amount: +tr.dataset.a, cycle: '매월', kind: '고정',
      category: tr.dataset.c, method: '', match: tr.dataset.m, memo: '자동 감지', active: true,
      owner: USER.name, sort: FIXED.length }]);
    FIXED = await S.listFixed(); renderFixedTab(); toast('고정비에 추가했습니다');
  });

  /* ---------- 분석 ---------- */
  $('#anRange').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    $$('#anRange button').forEach(x => x.classList.toggle('on', x === b));
    anRange = +b.dataset.r; renderAnalysis();
  });
  $('#granSeg').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    $$('#granSeg button').forEach(x => x.classList.toggle('on', x === b));
    gran = b.dataset.g; renderAnalysis();
  });
  $('#trendCat').addEventListener('change', renderAnalysis);

  function renderAnalysis() {
    const n = anRange || months.length;

    /* 고정비 vs 변동비 */
    const F = A.fixedSummary(VTX, n);
    $('#fixDesc').innerHTML = `최근 <b>${F.months}개월</b> 실제 지출 기준 월평균입니다.`;
    const t2 = (n2, v, d, color) => `<div class="stat"><div class="n"><i style="background:${color}"></i>${n2}</div>
      <div class="v num">${v}</div><div class="d flat">${d}</div></div>`;
    $('#fixTiles').innerHTML =
      t2('고정비', fmt(F.fixedAvg), `지출의 ${F.ratio.toFixed(0)}%`, 'var(--ink)') +
      t2('변동비', fmt(F.varAvg), `지출의 ${(100 - F.ratio).toFixed(0)}% · 줄일 수 있는 돈`, 'var(--warn)') +
      t2('고정비 항목', F.items.length + '개', '반복 결제 기준', 'var(--purple)');
    const keep = F.allMonths.slice(-18), off = F.allMonths.length - keep.length;
    drawChart('chFixed', {
      type: 'bar',
      data: { labels: keep.map(m => m.slice(2)),
        datasets: [
          { label: '고정비', data: F.fSeries.slice(off), backgroundColor: '#191f28', borderRadius: 5 },
          { label: '변동비', data: F.vSeries.slice(off), backgroundColor: '#f59e0b', borderRadius: 5 }] },
      options: { maintainAspectRatio: false,
        plugins: { legend: { labels: { boxWidth: 9, font: { size: 11 } } },
                   tooltip: { callbacks: { label: c => `${c.dataset.label} ${fmt(c.parsed.y)}` } } },
        scales: { x: { stacked: true, grid: { display: false } }, y: { stacked: true, ticks: { callback: v => man(v) } } } }
    });

    /* 쿠팡 · 마트 · 배달 */
    const sum = A.focusSummary(VTX, n);
    $('#focusDesc').innerHTML = `최근 <b>${n}개월</b> 월평균 · 직전 ${n}개월과 비교`;
    $('#focusTiles').innerHTML = sum.map(r => {
      const up = r.delta > 0;
      const d = r.pct === null ? '비교 기간 없음'
        : `<span class="${up ? 'up' : 'down'}">${up ? '▲' : '▼'} ${Math.abs(r.pct).toFixed(0)}% (${up ? '+' : ''}${man(r.delta)})</span>`;
      const b = r.bench ? `<div class="d flat">평균 ${man(BENCH.focus[r.bench])} · <b class="${r.now > BENCH.focus[r.bench] ? 'up' : 'down'}">${r.now > BENCH.focus[r.bench] ? '+' : ''}${Math.round((r.now / BENCH.focus[r.bench] - 1) * 100)}%</b></div>` : '';
      return `<div class="stat"><div class="n"><i style="background:${r.color}"></i>${r.key}</div>
        <div class="v num">${fmt(r.now)}</div><div class="d">${d}</div>${b}</div>`;
    }).join('');
    const gNow = sum.filter(r => A.GROCERY_KEYS.includes(r.key)).reduce((a, r) => a + r.now, 0);
    const gB = BENCH.focus['장보기(쿠팡·마트·편의점)'], dNow = sum.find(r => r.key === '배달').now, dB = BENCH.focus['배달'];
    const bar = (label, me, av) => {
      const max = Math.max(me, av) * 1.2 || 1, over = me > av;
      return `<div class="bench"><div class="hd"><span class="nm">${label}</span>
        <span class="vl num">${fmt(me)}</span><span class="dl ${over ? 'up' : 'down'}">${over ? '+' : ''}${man(me - av)}</span></div>
        <div class="track"><div class="me" style="width:${Math.min(100, me / max * 100)}%;background:${over ? 'var(--expense)' : 'var(--income)'}"></div>
        <div class="avg" style="left:${av / max * 100}%"></div></div></div>`;
    };
    $('#focusBench').innerHTML = bar('장보기 합계', gNow, gB) + bar('배달', dNow, dB);
    const fm = A.focusMonthly(VTX);
    const fk = fm.months.slice(-18), fo = fm.months.length - fk.length;
    drawChart('chFocus', {
      type: 'line',
      data: { labels: fk.map(m => m.slice(2)),
        datasets: A.FOCUS.map(f => ({ label: f.key, borderColor: f.color, backgroundColor: f.color + '18',
          data: fm.series[f.key].slice(fo), tension: .35, pointRadius: 0, borderWidth: 2 })) },
      options: { maintainAspectRatio: false,
        plugins: { legend: { labels: { boxWidth: 9, font: { size: 11 } } },
                   tooltip: { mode: 'index', intersect: false, callbacks: { label: c => `${c.dataset.label} ${fmt(c.parsed.y)}` } } },
        scales: { x: { grid: { display: false } }, y: { ticks: { callback: v => man(v) } } } }
    });

    /* 추이 */
    const cats = C.CATEGORIES.filter(c => c !== '미분류');
    if ($('#trendCat').options.length <= 1)
      $('#trendCat').innerHTML = '<option value="">전체 카테고리</option>' + cats.map(c => `<option>${c}</option>`).join('');
    const cat = $('#trendCat').value;
    const src = cat ? VTX.filter(t => t.category === cat || t.kind === 'income') : VTX;
    const lim = gran === 'day' ? 60 : gran === 'week' ? 40 : gran === 'month' ? 24 : 10;
    const s = A.seriesByPeriod(src, gran).slice(-lim);
    drawChart('chTrend', {
      data: { labels: s.map(x => A.periodLabel(x.key, gran)),
        datasets: [
          { type: 'bar', label: '지출', data: s.map(x => x.expense), backgroundColor: '#f0445290', borderRadius: 5, order: 2 },
          { type: 'line', label: '수입', data: s.map(x => x.income), borderColor: '#00b25d', backgroundColor: '#00b25d18',
            tension: .35, fill: true, order: 1, pointRadius: 2, borderWidth: 2 }] },
      options: { maintainAspectRatio: false,
        plugins: { legend: { labels: { boxWidth: 9, font: { size: 11 } } },
                   tooltip: { callbacks: { label: c => `${c.dataset.label} ${fmt(c.parsed.y)}` } } },
        scales: { x: { grid: { display: false } }, y: { ticks: { callback: v => man(v) } } } }
    });

    const top8 = A.byCategory(VTX).slice(0, 8).map(c => c.category);
    const keys2 = [...new Set(VTX.filter(t => t.kind === 'expense').map(t => A.periodKey(t.tx_date, gran)))].sort().slice(-lim);
    drawChart('chStack', {
      type: 'bar',
      data: { labels: keys2.map(k => A.periodLabel(k, gran)),
        datasets: top8.map(c => ({ label: c, backgroundColor: C.CAT_COLORS[c],
          data: keys2.map(k => VTX.filter(t => A.isHouseholdExpense(t) && t.category === c && A.periodKey(t.tx_date, gran) === k)
            .reduce((a, t) => a + t.amount, 0)) })) },
      options: { maintainAspectRatio: false,
        plugins: { legend: { labels: { boxWidth: 9, font: { size: 10.5 } } },
                   tooltip: { callbacks: { label: c => `${c.dataset.label} ${fmt(c.parsed.y)}` } } },
        scales: { x: { stacked: true, grid: { display: false } }, y: { stacked: true, ticks: { callback: v => man(v) } } } }
    });

    $('#tblPeriod tbody').innerHTML = [...s].reverse().map(x => `
      <tr><td>${A.periodLabel(x.key, gran)}</td><td class="num">${fmt(x.expense)}</td>
      <td class="num">${fmt(x.income)}</td>
      <td class="num ${x.income - x.expense < 0 ? 'up' : 'down'}">${fmt(x.income - x.expense)}</td></tr>`).join('');
  }

  /* ---------- 업로드 ---------- */
  const drop = $('#drop');
  drop.addEventListener('click', () => $('#fileInput').click());
  drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('over'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('over'));
  drop.addEventListener('drop', e => { e.preventDefault(); drop.classList.remove('over'); handleFiles(e.dataTransfer.files); });
  $('#fileInput').addEventListener('change', e => handleFiles(e.target.files));

  async function handleFiles(files) {
    const log = $('#uploadLog'); log.classList.remove('hide'); log.textContent = '';
    const say = m => { log.innerHTML += m + '\n'; log.scrollTop = log.scrollHeight; };
    for (const f of files) {
      try {
        say(`${f.name} 읽는 중...`);
        const wb = XLSX.read(await f.arrayBuffer(), { type: 'array' });
        const parsed = P.parseWorkbook(wb, f.name);
        const { type, rows } = parsed;
        if (parsed.kind === 'coupang') {
          const res = await S.insertCoupang(rows);
          say(`  → ${type} · ${rows.length}건 인식 / 신규 ${res.inserted} 저장 / 중복 ${res.skipped} 건너뜀`);
        } else {
          const clean = rows.map(r => { const { _workHint, ...rest } = r; return Object.assign(rest, { owner: USER.name }); });
          const res = await S.insertTx(clean);
          say(`  → ${type} · ${rows.length}건 인식 / 신규 ${res.inserted} 저장 / 중복 ${res.skipped} 건너뜀`);
        }
      } catch (err) { say(`  ✕ 실패: ${err.message}`); }
    }
    await reload(); toast('업로드 완료');
  }

  $('#seedBtn').addEventListener('click', () => loadSeed($('#seedLog')));
  async function loadSeed(logEl) {
    const say = m => { if (logEl) { logEl.classList.remove('hide'); logEl.innerHTML += m + '\n'; } };
    say('초기 데이터 불러오는 중...');
    try {
      const seed = window.__SEED__; if (!seed) return say('✕ seed 없음');
      const fp = P.fpFactory(), rows = [];
      for (const it of (seed.sheet || [])) {
        const c = C.categorizeSheetItem(it.name);
        const r = P.rowFrom({ source: 'sheet', tx_date: `${it.ym}-15`,
          merchant: it.name + (it.inst ? ` (${it.inst})` : ''), amount: it.amount, raw_amount: it.amount,
          category: c.category, subcategory: c.sub,
          memo: [it.user, it.fin].filter(Boolean).join(' · ') || '가계부 시트',
          fingerprint: fp(['sheet', it.ym, it.name, it.amount]) });
        delete r._workHint; rows.push(r);
      }
      for (const c of (seed.cards || [])) {
        if (c.d < '2026-01-01') continue;
        const r = P.rowFrom({ source: 'samsung_card', tx_date: c.d, merchant: c.m, amount: c.a,
          raw_amount: c.u || c.a, benefit: Math.abs(c.b || 0),
          installment: c.seq && c.inst ? `${c.seq}/${c.inst}` : '', bill_month: c.bm,
          memo: c.t === '취소' ? '결제 취소' : '', fingerprint: fp(['sc', c.d, c.m, c.a]) });
        delete r._workHint; rows.push(r);
      }
      for (const b of (seed.bank || [])) {
        const r = P.bankRow(b, fp); if (!r) continue; delete r._workHint; rows.push(r);
      }
      const res = await S.insertTx(rows);
      say(`총 ${rows.length}건 중 신규 ${res.inserted} 저장 · 중복 ${res.skipped} 건너뜀`);
      for (const wc of (seed.work_claims || []))
        await S.upsertClaim({ period: wc.period, amount: wc.amount, status: wc.status,
                              filed_date: wc.filed, paid_date: wc.paid, memo: '' });
      say('완료!');
      await reload(); toast(`초기 데이터 ${res.inserted.toLocaleString()}건 적재`);
    } catch (err) { say('✕ ' + err.message); }
  }

  /* ---------- 수입 ---------- */
  $('#incomeForm').addEventListener('submit', async e => {
    e.preventDefault(); $('#incErr').textContent = '';
    try {
      const src = $('#incSrc').value, d = $('#incDate').value, amt = +$('#incAmt').value;
      if (!d || !amt) throw new Error('날짜와 금액을 입력하세요.');
      await S.insertTx([{ kind: 'income', source: 'manual', tx_date: d, merchant: src, amount: amt,
        raw_amount: amt, benefit: 0, category: '수입', subcategory: src, income_src: src, is_work: false,
        installment: '', bill_month: null, memo: $('#incMemo').value, owner: USER.name,
        fingerprint: `manual|in|${d}|${src}|${amt}|${Date.now()}` }]);
      $('#incAmt').value = ''; $('#incMemo').value = '';
      await reload(); go('income'); toast('수입 저장 완료');
    } catch (err) { $('#incErr').textContent = err.message; }
  });

  function renderIncome() {
    if (!$('#incSrc').options.length) $('#incSrc').innerHTML = CFG.INCOME_SOURCES.map(s => `<option>${s}</option>`).join('');
    if (!$('#incDate').value) $('#incDate').value = new Date().toISOString().slice(0, 10);
    const inc = VTX.filter(A.isIncome).sort((a, b) => a.tx_date < b.tx_date ? 1 : -1);
    $('#incomeList').innerHTML = inc.slice(0, 40).map(t => `
      <div class="row" data-id="${t.id}"><div class="ic">💰</div>
        <div class="tx"><div class="t1">${esc(t.income_src || t.merchant)}</div>
          <div class="t2">${t.tx_date} · ${ownerOf(t)}</div></div>
        <div class="amt num in">+${fmt(t.amount)}</div>
        ${canEdit(t) ? '<button class="btn ghost sm inc-del" style="margin-left:8px">삭제</button>' : ''}</div>`).join('')
      || '<p class="desc" style="margin:0;padding:10px 0">기록된 수입이 없습니다.</p>';

    const keys = [...new Set(inc.map(t => t.tx_date.slice(0, 7)))].sort();
    const srcs = [...new Set(inc.map(t => t.income_src || '기타 수입'))];
    const pal = ['#14b8a6', '#00b25d', '#f59e0b', '#7c3aed', '#ec4899', '#0ea5e9'];
    drawChart('chIncome', {
      type: 'bar',
      data: { labels: keys.map(k => k.slice(2)),
        datasets: srcs.map((s, i) => ({ label: s, backgroundColor: pal[i % pal.length], borderRadius: 4,
          data: keys.map(k => inc.filter(t => (t.income_src || '기타 수입') === s && t.tx_date.slice(0, 7) === k)
            .reduce((a, t) => a + t.amount, 0)) })) },
      options: { maintainAspectRatio: false,
        plugins: { legend: { labels: { boxWidth: 9, font: { size: 10.5 } } },
                   tooltip: { callbacks: { label: c => `${c.dataset.label} ${fmt(c.parsed.y)}` } } },
        scales: { x: { stacked: true, grid: { display: false } }, y: { stacked: true, ticks: { callback: v => man(v) } } } }
    });
  }
  $('#incomeList').addEventListener('click', async e => {
    if (!e.target.classList.contains('inc-del')) return;
    const id = +e.target.closest('.row').dataset.id;
    if (!confirm('삭제할까요?')) return;
    await S.deleteTx(id); TX = TX.filter(t => t.id !== id); renderIncome(); toast('삭제됨');
  });

  /* ---------- 지출 직접 입력 ---------- */
  function renderExpense() {
    $('#expWho').textContent = USER ? USER.name : '';
    if (!$('#expCat').options.length)
      $('#expCat').innerHTML = C.CATEGORIES.filter(c => c !== '미분류' && c !== '업무비용')
        .map(c => `<option>${c}</option>`).join('');
    if (!$('#expDate').value) $('#expDate').value = new Date().toISOString().slice(0, 10);

    const mine = TX.filter(t => t.kind === 'expense' && t.source === 'manual' && canEdit(t))
      .sort((a, b) => a.tx_date < b.tx_date ? 1 : -1).slice(0, 60);
    $('#expenseList').innerHTML = mine.map(t => `
      <div class="row" data-id="${t.id}"><div class="ic">${C.iconOf(t.category, t.subcategory)}</div>
        <div class="tx"><div class="t1">${esc(t.merchant)}</div>
          <div class="t2">${t.tx_date} · ${t.category}${t.subcategory ? ' › ' + esc(t.subcategory) : ''} · ${ownerOf(t)}</div></div>
        <div class="amt num">${fmt(t.amount)}</div>
        <button class="btn ghost sm exp-del" style="margin-left:8px">삭제</button></div>`).join('')
      || '<p class="desc" style="margin:0;padding:10px 0">직접 넣은 지출이 없습니다.</p>';
  }

  $('#expenseForm')?.addEventListener('submit', async e => {
    e.preventDefault(); $('#expErr').textContent = '';
    try {
      const d = $('#expDate').value, amt = +$('#expAmt').value, nm = $('#expName').value.trim();
      if (!d || !amt || !nm) throw new Error('날짜 · 금액 · 내용을 입력하세요.');
      await S.insertTx([{
        kind: 'expense', source: 'manual', tx_date: d, merchant: nm, amount: amt, raw_amount: amt,
        benefit: 0, category: $('#expCat').value, subcategory: $('#expSub').value.trim(),
        income_src: null, is_work: false, installment: '', bill_month: null,
        memo: $('#expMethod').value.trim(), owner: USER.name,
        fingerprint: `manual|out|${d}|${nm}|${amt}|${Date.now()}`
      }]);
      $('#expAmt').value = ''; $('#expName').value = ''; $('#expSub').value = '';
      await reload(); go('expense'); toast('지출 저장 완료');
    } catch (err) { $('#expErr').textContent = err.message; }
  });
  $('#expenseList')?.addEventListener('click', async e => {
    if (!e.target.classList.contains('exp-del')) return;
    const id = +e.target.closest('.row').dataset.id;
    if (!confirm('삭제할까요?')) return;
    await S.deleteTx(id); TX = TX.filter(t => t.id !== id); applyPerson(); renderExpense(); toast('삭제됨');
  });

  /* ---------- 업무비용 ---------- */
  function renderWork() {
    const tagged = VTX.filter(t => t.is_work).reduce((a, t) => a + t.amount, 0);
    const paid = CLAIMS.filter(c => c.status === '환급완료').reduce((a, c) => a + (+c.amount || 0), 0);
    const open = CLAIMS.filter(c => c.status !== '환급완료').reduce((a, c) => a + (+c.amount || 0), 0);
    const st = (n, v, d, color) => `<div class="stat"><div class="n"><i style="background:${color}"></i>${n}</div>
      <div class="v num">${v}</div><div class="d flat">${d}</div></div>`;
    $('#wkStats').innerHTML = st('업무 태그 합계', fmt(tagged), '가계 지출에서 제외', 'var(--warn)') +
      st('환급 완료', fmt(paid), `${CLAIMS.filter(c => c.status === '환급완료').length}건`, 'var(--income)') +
      st('미환급 잔액', fmt(open), '기안 누락 확인', 'var(--expense)');

    const ed = canWrite();
    $('#tblClaim tbody').innerHTML = [...CLAIMS].sort((a, b) => a.period < b.period ? 1 : -1).map(c => `
      <tr data-period="${c.period}"><td><b>${c.period}</b></td>
      <td class="num">${ed ? `<input class="pill js-c-amt" type="number" value="${+c.amount || 0}" style="width:110px;text-align:right;padding:5px 8px;font-size:12.5px;border-radius:9px">` : fmt(+c.amount || 0)}</td>
      <td>${ed ? `<select class="pill js-c-status" style="padding:5px 22px 5px 8px;font-size:12.5px;border-radius:9px">${['미기안', '기안완료', '환급완료'].map(o => `<option ${o === c.status ? 'selected' : ''}>${o}</option>`).join('')}</select>` : `<span class="tag ${c.status === '환급완료' ? 'g' : 'w'}">${c.status}</span>`}</td>
      <td>${ed ? `<input class="pill js-c-paid" type="date" value="${c.paid_date || ''}" style="padding:5px 8px;font-size:12.5px;border-radius:9px">` : (c.paid_date || '—')}</td>
      <td>${ed ? `<input class="pill js-c-memo" type="text" value="${esc(c.memo || '')}" style="padding:5px 8px;font-size:12.5px;border-radius:9px;width:130px">` : esc(c.memo || '')}</td>
      <td>${ed ? '<button class="btn ghost sm js-c-del">삭제</button>' : ''}</td></tr>`).join('')
      || '<tr><td colspan="6" style="color:var(--muted)">등록된 기안이 없습니다.</td></tr>';

    const cand = VTX.filter(t => t.kind === 'expense' &&
      (t.is_work || /Google \(제미나이|네이버파이낸셜|microsoft|오피스/i.test(t.merchant)))
      .sort((a, b) => a.tx_date < b.tx_date ? 1 : -1).slice(0, 200);
    $('#tblWorkCand tbody').innerHTML = cand.map(t => `
      <tr data-id="${t.id}"><td>${t.tx_date}</td><td>${esc(t.merchant)}</td>
      <td class="num">${fmt(t.amount)}</td>
      <td>${ed ? `<input type="checkbox" class="js-work2" ${t.is_work ? 'checked' : ''}>` : (t.is_work ? '업무' : '')}</td></tr>`).join('')
      || '<tr><td colspan="4" style="color:var(--muted)">후보가 없습니다.</td></tr>';
  }
  $('#tblClaim').addEventListener('change', async e => {
    const tr = e.target.closest('tr'); if (!tr?.dataset.period) return;
    const row = { period: tr.dataset.period, amount: +tr.querySelector('.js-c-amt').value || 0,
      status: tr.querySelector('.js-c-status').value,
      paid_date: tr.querySelector('.js-c-paid').value || null,
      memo: tr.querySelector('.js-c-memo').value || '' };
    if (row.status === '환급완료' && !row.paid_date) {
      row.paid_date = new Date().toISOString().slice(0, 10);
      tr.querySelector('.js-c-paid').value = row.paid_date;
    }
    await S.upsertClaim(row); CLAIMS = await S.listClaims(); renderWork(); toast(`${row.period} 저장됨`);
  });
  $('#tblClaim').addEventListener('click', async e => {
    if (!e.target.classList.contains('js-c-del')) return;
    const period = e.target.closest('tr').dataset.period;
    if (!confirm(`${period} 기안 건을 삭제할까요?`)) return;
    await S.deleteClaim(period); CLAIMS = await S.listClaims(); renderWork(); toast('삭제됨');
  });
  $('#tblWorkCand').addEventListener('change', async e => {
    if (!e.target.classList.contains('js-work2')) return;
    const id = +e.target.closest('tr').dataset.id, t = TX.find(x => x.id === id);
    await S.updateTx(id, { is_work: e.target.checked }); t.is_work = e.target.checked;
    renderWork(); toast('반영됨');
  });
  $('#claimForm').addEventListener('submit', async e => {
    e.preventDefault(); if (!$('#clPeriod').value) return;
    await S.upsertClaim({ period: $('#clPeriod').value, amount: +$('#clAmt').value,
      status: $('#clStatus').value, paid_date: $('#clPaid').value || null, memo: $('#clMemo').value || '' });
    $('#clAmt').value = ''; $('#clMemo').value = '';
    CLAIMS = await S.listClaims(); renderWork(); toast('추가되었습니다');
  });

  /* ---------- 정보 ---------- */
  function renderInfo() {
    const bySrc = {};
    for (const t of VTX) bySrc[t.source] = (bySrc[t.source] || 0) + 1;
    $('#infoBody').innerHTML = `
      <b>기간</b> ${months[0] || '—'} ~ ${months[months.length - 1] || '—'}<br>
      <b>거래</b> ${VTX.length.toLocaleString()}건 · 고정비 ${FIXED.length}개 · 기안 ${CLAIMS.length}건 · 쿠팡 상품 ${CP.length.toLocaleString()}건<br>
      <b>출처</b> ${Object.entries(bySrc).map(([k, v]) => `${srcLabel(k)} ${v.toLocaleString()}`).join(' · ')}<br>
      <b>저장</b> ${S.ONLINE ? 'Supabase (두 기기 공유)' : '이 브라우저에만 저장 (오프라인 모드)'}<br><br>
      <span style="color:var(--muted)">2025년은 기존 가계부 시트를 옮겨온 월 단위 집계라 가맹점 상세와 수입 기록이 없습니다.
      2026년부터는 카드·은행 실거래 기준이며, 집계 기준일은 <b>이용일</b>입니다 —
      이번 달 카드 사용분은 다음 달 명세서를 올려야 채워집니다.</span>`;
  }

  $('#bmCopy')?.addEventListener('click', async () => {
    const ta = $('#bmCode'); ta.value = BOOKMARKLET;
    try { await navigator.clipboard.writeText(BOOKMARKLET); toast('복사되었습니다'); }
    catch (e) { ta.select(); ta.setSelectionRange(0, 999999); document.execCommand('copy'); toast('복사되었습니다'); }
  });

  /* ---------- 유틸 ---------- */
  function drawChart(id, cfg) {
    const el = document.getElementById(id); if (!el) return;
    if (charts[id]) charts[id].destroy();
    cfg.options = Object.assign({ responsive: true, animation: { duration: 380 } }, cfg.options);
    charts[id] = new Chart(el, cfg);
  }
})();
