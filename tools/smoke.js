/* 배포 전 자가검사 — node tools/smoke.js
   시드 데이터로 로그인부터 전 화면 전환까지 돌려보고 오류를 잡는다. */
const { JSDOM } = require('jsdom'); const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const dom = new JSDOM(fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8'),
  { runScripts: 'outside-only', url: 'https://x.test/' });
const w = dom.window;
w.Chart = function () { return { destroy() {}, update() {} }; }; w.Chart.register = () => {};
w.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {} });
w.fetch = async () => ({ ok: false, json: async () => ({}) });
globalThis.window = w; global.window = w; global.document = w.document;
const errs = [];
w.addEventListener('error', e => errs.push('window: ' + e.message));
w.console.error = (...a) => errs.push('error: ' + a.map(x => (x && x.stack) || x).join(' '));

const load = f => new w.Function(fs.readFileSync(path.join(ROOT, f), 'utf8'))();
for (const f of ['js/config.js', 'data/benchmark.js', 'data/seed.js', 'data/coupang.js',
                 'data/lunar.js', 'js/categorize.js', 'js/parsers.js', 'js/analytics.js', 'js/store.js']) load(f);

// 시드로 거래 만들기
const P = w.Parsers, C = w.Categorize, fp = P.fpFactory();
const TX = [];
for (const c of (w.__SEED__.cards || [])) {
  if (c.d < '2026-01-01') continue;
  TX.push(Object.assign(P.rowFrom({ source: 'samsung_card', tx_date: c.d, merchant: c.m, amount: c.a,
    raw_amount: c.u || c.a, memo: '', fingerprint: fp(['sc', c.d, c.m, c.a]) }),
    { id: TX.length + 1, owner: '김현우' }));
}
for (const b of (w.__SEED__.bank || [])) {
  const r = P.bankRow(b, fp); if (r) TX.push(Object.assign(r, { id: TX.length + 1, owner: '김현우' }));
}
w.Store = { ONLINE: true,
  async getSetting(k, d) { return d; }, async setSetting() {},
  async listEvents() { return []; }, async insertEvent() {}, async updateEvent() {}, async deleteEvent() {},
  async signIn() {}, async signOut() {}, async currentUser() { return { name: '김현우', role: 'admin' }; },
  async listTx() { return TX; }, async insertTx() { return { inserted: 0, skipped: 0 }; },
  async updateTx() {}, async deleteTx() {}, async deleteTxMany() {},
  async listClaims() { return []; }, async upsertClaim() {}, async deleteClaim() {},
  async listFixed() { return []; }, async insertFixed() {}, async updateFixed() {}, async deleteFixed() {},
  async listCoupang() { return []; }, async insertCoupang() { return { inserted: 0, skipped: 0 }; } };
w.localStorage.setItem('bb_auto_login', '1');
load('js/app.js');

setTimeout(() => {
  let bad = 0;
  console.log(`거래 ${TX.length}건으로 검사\n`);
  for (const v of ['home', 'ledger', 'budget', 'allowance', 'fixed', 'analysis', 'subs', 'work', 'income', 'expense', 'more', 'info', 'prefs', 'upload', 'add']) {
    errs.length = 0;
    const btn = w.document.querySelector(`#tabbar button[data-v="${v}"]`) || w.document.querySelector(`[data-go="${v}"]`);
    btn && btn.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    const shown = [...w.document.querySelectorAll('main > section')].filter(s => !s.classList.contains('hide')).map(s => s.id);
    const box = w.document.querySelector('#loadErrBox');
    const ok = !errs.length && !box && shown.length === 1;
    if (!ok) bad++;
    console.log(`  ${v.padEnd(10)} ${(shown.join(',') || '없음').padEnd(14)} ` +
      (errs.length ? '❌ ' + errs[0].slice(0, 130) : box ? '⚠ ' + box.textContent.replace(/\s+/g, ' ').slice(0, 120) : '✅'));
  }
  console.log(bad ? `\n❌ ${bad}개 화면에 문제가 있습니다` : '\n✅ 전 화면 정상');
  process.exit(bad ? 1 : 0);
}, 1200);
