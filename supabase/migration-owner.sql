-- ============================================================
--  현우 미란 가계부 · 사람별 소유권 추가 (기존 프로젝트에 이어서 실행)
--  Supabase SQL Editor 에 전체 붙여넣고 RUN 하세요.
-- ============================================================

-- 1) owner 컬럼 추가 -------------------------------------------
alter table public.transactions add column if not exists owner text not null default '김현우';
alter table public.fixed_costs  add column if not exists owner text not null default '김현우';

create index if not exists idx_tx_owner on public.transactions (owner);
create index if not exists idx_fx_owner on public.fixed_costs (owner);

-- 기존 데이터는 전부 김현우 소유로
update public.transactions set owner = '김현우' where owner is null or owner = '';
update public.fixed_costs  set owner = '김현우' where owner is null or owner = '';

-- 2) 로그인한 사람 이름 -----------------------------------------
create or replace function public.me_name()
returns text language sql stable security definer set search_path = public as $$
  select name from public.profiles where id = auth.uid();
$$;

-- 3) 역할 정리 : 홍미란도 쓰기 가능한 member 로 -------------------
update public.profiles set role = 'member' where name = '홍미란';

-- 4) RLS 재작성 -------------------------------------------------
--    조회 : 로그인한 사람은 둘 다 전부 볼 수 있음
--    쓰기 : 본인 소유 행만. 단 김현우(owner)는 전부 가능
drop policy if exists "tx_select_all"   on public.transactions;
drop policy if exists "tx_write_owner"  on public.transactions;
drop policy if exists "tx_write_own"    on public.transactions;
create policy "tx_select_all" on public.transactions
  for select to authenticated using (true);
create policy "tx_write_own" on public.transactions
  for all to authenticated
  using      (owner = public.me_name() or public.is_owner())
  with check (owner = public.me_name() or public.is_owner());

drop policy if exists "fx_select_all"   on public.fixed_costs;
drop policy if exists "fx_write_owner"  on public.fixed_costs;
drop policy if exists "fx_write_own"    on public.fixed_costs;
create policy "fx_select_all" on public.fixed_costs
  for select to authenticated using (true);
create policy "fx_write_own" on public.fixed_costs
  for all to authenticated
  using      (owner = public.me_name() or public.is_owner())
  with check (owner = public.me_name() or public.is_owner());

-- 쿠팡 · 업무비용 환급은 공용 → 둘 다 쓰기 허용
drop policy if exists "cp_write_owner" on public.coupang_items;
drop policy if exists "cp_write_any"   on public.coupang_items;
create policy "cp_write_any" on public.coupang_items
  for all to authenticated using (true) with check (true);

drop policy if exists "wc_write_owner" on public.work_claims;
drop policy if exists "wc_write_any"   on public.work_claims;
create policy "wc_write_any" on public.work_claims
  for all to authenticated using (true) with check (true);

-- 확인
select name, role from public.profiles order by role;
