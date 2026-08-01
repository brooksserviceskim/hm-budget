/* ============================================================
   데이터 저장소
   - Supabase 설정이 있으면 Supabase, 없으면 localStorage(오프라인 모드)
   ============================================================ */
(function (root) {
  'use strict';
  const CFG = root.APP_CONFIG || {};
  const ONLINE = !!(CFG.SUPABASE_URL && CFG.SUPABASE_ANON_KEY);
  const LS_TX = 'bb_transactions', LS_WC = 'bb_work_claims', LS_USER = 'bb_user', LS_FX = 'bb_fixed_costs', LS_CP = 'bb_coupang', LS_ST = 'bb_settings';

  let sb = null;
  if (ONLINE && root.supabase) sb = root.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY);

  const lsGet = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
  const lsSet = (k, v) => localStorage.setItem(k, JSON.stringify(v));

  /* ---------------- 인증 ---------------- */
  async function signIn(email, password) {
    if (!ONLINE) {
      // 오프라인 모드: 아이디만으로 역할 구분
      const id = String(email).trim();
      const name = /미란|miran/i.test(id) ? '홍미란' : '김현우';
      const user = { name, role: name === '홍미란' ? 'member' : 'owner', email: id, offline: true };
      lsSet(LS_USER, user);
      return user;
    }
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return await currentUser();
  }

  async function currentUser() {
    if (!ONLINE) return lsGet(LS_USER, null);
    const { data: { session } } = await sb.auth.getSession();
    if (!session) return null;
    const { data: prof } = await sb.from('profiles').select('name,role').eq('id', session.user.id).single();
    return {
      name: prof?.name || session.user.email.split('@')[0],
      role: prof?.role || 'viewer',
      email: session.user.email, id: session.user.id
    };
  }

  async function signOut() {
    if (!ONLINE) { localStorage.removeItem(LS_USER); return; }
    await sb.auth.signOut();
  }

  /* ---------------- 거래 ---------------- */
  async function listTx() {
    if (!ONLINE) return lsGet(LS_TX, []);
    const all = [];
    const PAGE = 1000;
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await sb.from('transactions')
        .select('*').order('tx_date', { ascending: false }).range(from, from + PAGE - 1);
      if (error) throw error;
      all.push(...data);
      if (data.length < PAGE) break;
    }
    return all;
  }

  /** 중복(fingerprint) 은 건너뛰고 새 건만 저장. @returns {inserted, skipped} */
  async function insertTx(rows) {
    if (!rows.length) return { inserted: 0, skipped: 0 };
    if (!ONLINE) {
      const cur = lsGet(LS_TX, []);
      const seen = new Set(cur.map(r => r.fingerprint));
      let ins = 0, skip = 0, id = Math.max(0, ...cur.map(r => r.id || 0));
      for (const r of rows) {
        if (seen.has(r.fingerprint)) { skip++; continue; }
        seen.add(r.fingerprint); cur.push(Object.assign({ id: ++id }, r)); ins++;
      }
      lsSet(LS_TX, cur);
      return { inserted: ins, skipped: skip };
    }
    let ins = 0, skip = 0;
    for (let i = 0; i < rows.length; i += 400) {
      const chunk = rows.slice(i, i + 400);
      const { data, error } = await sb.from('transactions')
        .upsert(chunk, { onConflict: 'fingerprint', ignoreDuplicates: true }).select('id');
      if (error) throw error;
      ins += (data || []).length; skip += chunk.length - (data || []).length;
    }
    return { inserted: ins, skipped: skip };
  }

  async function updateTx(id, patch) {
    if (!ONLINE) {
      const cur = lsGet(LS_TX, []);
      const i = cur.findIndex(r => r.id === id);
      if (i >= 0) Object.assign(cur[i], patch);
      lsSet(LS_TX, cur); return;
    }
    const { error } = await sb.from('transactions').update(patch).eq('id', id);
    if (error) throw error;
  }

  async function deleteTx(id) {
    if (!ONLINE) { lsSet(LS_TX, lsGet(LS_TX, []).filter(r => r.id !== id)); return; }
    const { error } = await sb.from('transactions').delete().eq('id', id);
    if (error) throw error;
  }

  /* ---------------- 업무비용 환급 ---------------- */
  async function listClaims() {
    if (!ONLINE) return lsGet(LS_WC, []);
    const { data, error } = await sb.from('work_claims').select('*').order('period', { ascending: false });
    if (error) throw error;
    return data;
  }
  async function upsertClaim(row) {
    if (!ONLINE) {
      const cur = lsGet(LS_WC, []);
      const i = cur.findIndex(r => r.period === row.period);
      if (i >= 0) Object.assign(cur[i], row); else cur.push(Object.assign({ id: Date.now() }, row));
      lsSet(LS_WC, cur); return;
    }
    const { error } = await sb.from('work_claims').upsert(row, { onConflict: 'period' });
    if (error) throw error;
  }

  async function deleteClaim(period) {
    if (!ONLINE) { lsSet(LS_WC, lsGet(LS_WC, []).filter(r => r.period !== period)); return; }
    const { error } = await sb.from('work_claims').delete().eq('period', period);
    if (error) throw error;
  }

  /* ---------------- 고정비 마스터 ---------------- */
  async function listFixed() {
    if (!ONLINE) return lsGet(LS_FX, []).sort((a, b) => (a.sort || 0) - (b.sort || 0));
    const { data, error } = await sb.from('fixed_costs').select('*').order('sort', { ascending: true });
    if (error) throw error;
    return data;
  }
  async function insertFixed(rows) {
    if (!rows.length) return 0;
    if (!ONLINE) {
      const cur = lsGet(LS_FX, []);
      let id = Math.max(0, ...cur.map(r => r.id || 0));
      for (const r of rows) cur.push(Object.assign({ id: ++id }, r));
      lsSet(LS_FX, cur); return rows.length;
    }
    const { data, error } = await sb.from('fixed_costs').insert(rows).select('id');
    if (error) throw error;
    return (data || []).length;
  }
  async function updateFixed(id, patch) {
    if (!ONLINE) {
      const cur = lsGet(LS_FX, []); const i = cur.findIndex(r => r.id === id);
      if (i >= 0) Object.assign(cur[i], patch);
      lsSet(LS_FX, cur); return;
    }
    const { error } = await sb.from('fixed_costs').update(patch).eq('id', id);
    if (error) throw error;
  }
  async function deleteFixed(id) {
    if (!ONLINE) { lsSet(LS_FX, lsGet(LS_FX, []).filter(r => r.id !== id)); return; }
    const { error } = await sb.from('fixed_costs').delete().eq('id', id);
    if (error) throw error;
  }

  /* ---------------- 쿠팡 주문 상품 ---------------- */
  async function listCoupang() {
    if (!ONLINE) return lsGet(LS_CP, []);
    const all = []; const PAGE = 1000;
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await sb.from('coupang_items')
        .select('*').order('order_date', { ascending: false }).range(from, from + PAGE - 1);
      if (error) throw error;
      all.push(...data);
      if (data.length < PAGE) break;
    }
    return all;
  }
  async function insertCoupang(rows) {
    if (!rows.length) return { inserted: 0, skipped: 0 };
    if (!ONLINE) {
      const cur = lsGet(LS_CP, []);
      const seen = new Set(cur.map(r => r.fingerprint));
      let ins = 0, skip = 0, id = Math.max(0, ...cur.map(r => r.id || 0));
      for (const r of rows) {
        if (seen.has(r.fingerprint)) { skip++; continue; }
        seen.add(r.fingerprint); cur.push(Object.assign({ id: ++id }, r)); ins++;
      }
      lsSet(LS_CP, cur);
      return { inserted: ins, skipped: skip };
    }
    let ins = 0, skip = 0;
    for (let i = 0; i < rows.length; i += 400) {
      const chunk = rows.slice(i, i + 400);
      const { data, error } = await sb.from('coupang_items')
        .upsert(chunk, { onConflict: 'fingerprint', ignoreDuplicates: true }).select('id');
      if (error) throw error;
      ins += (data || []).length; skip += chunk.length - (data || []).length;
    }
    return { inserted: ins, skipped: skip };
  }
  async function updateCoupang(id, patch) {
    if (!ONLINE) {
      const cur = lsGet(LS_CP, []); const i = cur.findIndex(r => r.id === id);
      if (i >= 0) Object.assign(cur[i], patch); lsSet(LS_CP, cur); return;
    }
    const { error } = await sb.from('coupang_items').update(patch).eq('id', id);
    if (error) throw error;
  }

  /* ---------------- 설정 ---------------- */
  async function getSetting(key, def) {
    if (!ONLINE) { const all = lsGet(LS_ST, {}); return all[key] ?? def; }
    const { data, error } = await sb.from('settings').select('value').eq('key', key).maybeSingle();
    if (error) return def;
    return data ? data.value : def;
  }
  async function setSetting(key, value) {
    if (!ONLINE) { const all = lsGet(LS_ST, {}); all[key] = value; lsSet(LS_ST, all); return; }
    const { error } = await sb.from('settings').upsert({ key, value, updated_at: new Date().toISOString() });
    if (error) throw error;
  }

  root.Store = { ONLINE, getSetting, setSetting, signIn, signOut, currentUser, listTx, insertTx, updateTx, deleteTx,
                 listClaims, upsertClaim, deleteClaim,
                 listFixed, insertFixed, updateFixed, deleteFixed,
                 listCoupang, insertCoupang, updateCoupang };
})(window);
