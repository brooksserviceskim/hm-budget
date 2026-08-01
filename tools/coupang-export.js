/* ============================================================
   쿠팡 주문내역 → CSV 추출기  (v4 · 숨긴 iframe 렌더링 방식)
   ------------------------------------------------------------
   fetch 로는 주문이 안 나옵니다(자바스크립트로 그려지는 페이지라서).
   그래서 화면 밖 iframe 에 실제로 페이지를 띄워 렌더링된 결과를 읽습니다.

   [사용법]
   1) 마이쿠팡 → 주문목록 에서 콘솔 열기 (Cmd + Option + J)
      붙여넣기가 막히면 allow pasting 직접 타이핑 후 Enter
   2) 이 코드 전부 붙여넣고 Cmd + Enter
   3) 왼쪽 위에 진행 상황이 뜹니다. 끝나면 CSV 가 저장됩니다.
      (수집 중 다른 탭으로 옮겨도 됩니다. 이 탭만 닫지 마세요)
   ------------------------------------------------------------
   읽기만 합니다. 주문·결제·취소 등 어떤 변경도 하지 않습니다.
   ============================================================ */

(async () => {
  const THIS_YEAR = new Date().getFullYear();
  const YEARS = []; for (let y = THIS_YEAR; y >= 2015; y--) YEARS.push(y);
  const MAX_PAGES   = 60;
  const RENDER_WAIT = 12000;   // 페이지가 그려질 때까지 최대 대기(ms)

  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const clean = s => String(s || '').replace(/\s+/g, ' ').trim();
  const SEL = 'a[href*="/ssr/sdp/link"], a[href*="/vp/products/"]';

  // 진행 표시
  const hud = document.createElement('div');
  hud.style.cssText = 'position:fixed;z-index:2147483647;left:12px;top:12px;background:#111;color:#fff;' +
    'padding:12px 16px;border-radius:10px;font:13px/1.5 -apple-system,sans-serif;box-shadow:0 6px 24px rgba(0,0,0,.4)';
  hud.textContent = '쿠팡 주문 수집 준비 중...';
  document.body.appendChild(hud);
  const say = t => { hud.textContent = t; console.log(t); };

  const ifr = document.createElement('iframe');
  ifr.style.cssText = 'position:fixed;left:-10000px;top:0;width:1280px;height:2400px;border:0';
  document.body.appendChild(ifr);

  const rows = [], seen = new Set();

  const nearestDate = el => {
    let n = el;
    for (let i = 0; i < 12 && n; i++, n = n.parentElement) {
      const m = (n.textContent || '').match(/(20\d{2})\s*\.\s*(\d{1,2})\s*\.\s*(\d{1,2})\s*주문/);
      if (m) return `${m[1]}-${String(m[2]).padStart(2, '0')}-${String(m[3]).padStart(2, '0')}`;
    }
    return '';
  };
  const nearestOrderNo = el => {
    let n = el;
    for (let i = 0; i < 12 && n; i++, n = n.parentElement) {
      const a = n.querySelector?.('a[href*="orderId="]');
      if (a) { const m = a.getAttribute('href').match(/orderId=(\d+)/); if (m) return m[1]; }
    }
    return '';
  };

  const scrape = doc => {
    let added = 0;
    for (const a of doc.querySelectorAll(SEL)) {
      const spans = [...a.querySelectorAll('span')].map(s => clean(s.textContent)).filter(Boolean);
      let name = spans.sort((x, y) => y.length - x.length)[0] || clean(a.textContent);
      name = name.replace(/\s*[\d,]{3,}\s*원\s*$/, '').trim();
      if (!name || name.length < 3) continue;
      if (/장바구니|배송조회|리뷰|교환|반품|재구매|주문 상세/.test(name)) continue;
      const row = a.parentElement || a;
      const t = clean(row.textContent);
      const pm = t.match(/([\d,]{3,})\s*원/), qm = t.match(/(\d+)\s*개/);
      const price = pm ? Number(pm[1].replace(/,/g, '')) : '';
      const qty = qm ? Number(qm[1]) : 1;
      const date = nearestDate(a), orderNo = nearestOrderNo(a);
      const key = `${date}|${name}|${price}|${qty}|${orderNo}`;
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push({ date, orderNo, name, qty, price });
      added++;
    }
    return added;
  };

  // iframe 에 URL 을 띄우고, 상품이 그려질 때까지 기다린 뒤 document 를 돌려준다
  const load = async url => {
    ifr.src = url;
    const t0 = Date.now();
    while (Date.now() - t0 < RENDER_WAIT) {
      await sleep(400);
      let d;
      try { d = ifr.contentDocument; } catch (e) { return { doc: null, blocked: true }; }
      if (!d) continue;
      if (d.querySelectorAll(SEL).length > 0) { await sleep(600); return { doc: d }; }
      // "주문 내역이 없습니다" 안내가 뜨면 바로 종료
      if (/주문\s*(내역|하신 상품)?\s*이?\s*없/.test(d.body?.innerText || '')) return { doc: d, empty: true };
    }
    return { doc: ifr.contentDocument || null, timeout: true };
  };

  say('현재 화면 수집 중...');
  scrape(document);

  let emptyYears = 0;
  outer:
  for (const year of YEARS) {
    let yearCount = 0;
    for (let page = 1; page <= MAX_PAGES; page++) {
      const url = `/ssr/desktop/order/list?requestYear=${year}&pageIndex=${page}`;
      say(`${year}년 ${page}페이지 불러오는 중... (누적 ${rows.length}건)`);
      const { doc, blocked, empty } = await load(url);
      if (blocked) { say('⚠ iframe 접근이 차단되었습니다. 다른 방법이 필요합니다.'); break outer; }
      if (!doc || empty) break;
      const n = scrape(doc);
      if (n === 0) break;
      yearCount += n;
      say(`${year}년 ${page}페이지 · +${n}건 (누적 ${rows.length}건)`);
    }
    console.log(`— ${year}년 총 ${yearCount}건`);
    if (yearCount === 0) { if (++emptyYears >= 3) break; } else emptyYears = 0;
  }

  ifr.remove();

  if (!rows.length) { hud.textContent = '주문을 찾지 못했습니다.'; return; }

  rows.sort((a, b) => (a.date < b.date ? 1 : -1));
  const esc = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv = '﻿' + ['주문일,주문번호,상품명,수량,금액']
    .concat(rows.map(r => [r.date, r.orderNo, r.name, r.qty, r.price].map(esc).join(',')))
    .join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
  a.download = 'coupang_orders_all.csv';
  document.body.appendChild(a); a.click(); a.remove();

  const total = rows.reduce((s, r) => s + (Number(r.price) || 0), 0);
  const ys = [...new Set(rows.map(r => r.date.slice(0, 4)).filter(Boolean))].sort();
  hud.style.background = '#0d9488';
  hud.textContent = `✅ ${rows.length}건 · ${ys[0]}~${ys[ys.length - 1]} · 합계 ${total.toLocaleString()}원 — CSV 저장 완료`;
  console.log(`✅ ${rows.length}건 · 합계 ${total.toLocaleString()}원`);
  setTimeout(() => hud.remove(), 15000);
})();
