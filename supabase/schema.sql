-- ============================================================
--  현우 미란 가계부 · Supabase 스키마
--  Supabase 대시보드 > SQL Editor 에 전체 붙여넣고 RUN 하세요.
-- ============================================================

-- 1) 사용자 프로필 (역할 관리) --------------------------------
create table if not exists public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  name       text not null,
  role       text not null default 'viewer',   -- 'owner' = 김현우(쓰기), 'viewer' = 홍미란(읽기)
  created_at timestamptz default now()
);

-- 회원가입 시 프로필 자동 생성
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, name, role)
  values (new.id,
          coalesce(new.raw_user_meta_data->>'name', split_part(new.email,'@',1)),
          coalesce(new.raw_user_meta_data->>'role', 'viewer'))
  on conflict (id) do nothing;
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 2) 거래 내역 -----------------------------------------------
create table if not exists public.transactions (
  id           bigserial primary key,
  kind         text not null default 'expense',   -- expense | income
  source       text not null default 'manual',    -- samsung_card | bank | manual | seed
  tx_date      date not null,
  merchant     text not null default '',
  amount       numeric(14,0) not null default 0,  -- 실제 청구(할인 반영) 금액
  raw_amount   numeric(14,0) not null default 0,  -- 할인 전 이용금액
  benefit      numeric(14,0) not null default 0,  -- 할인/혜택 금액
  category     text not null default '미분류',
  subcategory  text not null default '',
  income_src   text,                              -- 근로소득-루트82 | 사업소득-브룩스글로벌 | 기타
  is_work      boolean not null default false,    -- 루트82 업무 사용분(환급 예정) → 가계 지출에서 제외
  installment  text default '',                   -- 할부 회차 (예: 5/10)
  bill_month   int,                               -- 카드 청구월
  memo         text default '',
  fingerprint  text unique,                       -- 중복 업로드 방지 키
  created_by   uuid references auth.users(id),
  created_at   timestamptz default now()
);

create index if not exists idx_tx_date     on public.transactions (tx_date);
create index if not exists idx_tx_kind     on public.transactions (kind);
create index if not exists idx_tx_category on public.transactions (category);

-- 3) 루트82 업무비용 환급 관리 ---------------------------------
create table if not exists public.work_claims (
  id         bigserial primary key,
  period     text not null unique,       -- 'YYYY-MM'
  amount     numeric(14,0) not null default 0,
  status     text not null default '미기안',  -- 미기안 | 기안완료 | 환급완료
  filed_date date,
  paid_date  date,
  memo       text default '',
  created_at timestamptz default now()
);

-- 3-2) 고정비 마스터 -------------------------------------------
create table if not exists public.fixed_costs (
  id         bigserial primary key,
  name       text not null,
  amount     numeric(14,0) not null default 0,
  cycle      text not null default '매월',      -- 매월 | 격월 | 분기 | 반기 | 연
  category   text not null default '기타상품·서비스',
  method     text default '',                   -- 결제 수단
  kind       text not null default '고정',      -- 고정 | 할부(일시적)
  inst_now   int,                               -- 할부 현재 회차
  inst_total int,                               -- 할부 총 회차
  match      text default '',                   -- 실제 거래와 연결할 가맹점 키워드
  memo       text default '',
  active     boolean not null default true,
  sort       int default 0,
  created_at timestamptz default now()
);

-- 3-3) 쿠팡 주문 상품 -------------------------------------------
create table if not exists public.coupang_items (
  id          bigserial primary key,
  order_date  date not null,
  order_no    text default '',
  name        text not null,
  qty         int not null default 1,
  price       numeric(14,0) not null default 0,
  category    text not null default '기타',
  memo        text default '',
  fingerprint text unique,
  created_at  timestamptz default now()
);
create index if not exists idx_cp_date on public.coupang_items (order_date);

-- 4) RLS (행 수준 보안) ---------------------------------------
alter table public.profiles     enable row level security;
alter table public.transactions enable row level security;
alter table public.work_claims  enable row level security;
alter table public.fixed_costs  enable row level security;
alter table public.coupang_items enable row level security;

create or replace function public.is_owner()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'owner');
$$;

-- 프로필: 본인 것만 조회
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select to authenticated using (id = auth.uid());

-- 거래: 로그인한 사람은 모두 조회 가능 / 쓰기는 owner 만
drop policy if exists "tx_select_all"  on public.transactions;
drop policy if exists "tx_write_owner" on public.transactions;
create policy "tx_select_all"  on public.transactions for select to authenticated using (true);
create policy "tx_write_owner" on public.transactions for all    to authenticated
  using (public.is_owner()) with check (public.is_owner());

drop policy if exists "wc_select_all"  on public.work_claims;
drop policy if exists "wc_write_owner" on public.work_claims;
create policy "wc_select_all"  on public.work_claims for select to authenticated using (true);
create policy "wc_write_owner" on public.work_claims for all    to authenticated
  using (public.is_owner()) with check (public.is_owner());

drop policy if exists "fx_select_all"  on public.fixed_costs;
drop policy if exists "fx_write_owner" on public.fixed_costs;
create policy "fx_select_all"  on public.fixed_costs for select to authenticated using (true);
create policy "fx_write_owner" on public.fixed_costs for all    to authenticated
  using (public.is_owner()) with check (public.is_owner());

drop policy if exists "cp_select_all"  on public.coupang_items;
drop policy if exists "cp_write_owner" on public.coupang_items;
create policy "cp_select_all"  on public.coupang_items for select to authenticated using (true);
create policy "cp_write_owner" on public.coupang_items for all    to authenticated
  using (public.is_owner()) with check (public.is_owner());

-- ============================================================
--  계정 생성 후 실행 (Authentication > Users 에서 2명 추가한 뒤)
--  이메일 주소는 실제로 만든 것으로 바꿔주세요.
-- ============================================================
-- update public.profiles set name = '김현우', role = 'owner'
--   where id = (select id from auth.users where email = 'hyunwoo@example.com');
-- update public.profiles set name = '홍미란', role = 'viewer'
--   where id = (select id from auth.users where email = 'miran@example.com');
