-- ============================================================
--  경조사 · 이벤트 캘린더
--  Supabase SQL Editor 에 붙여넣고 RUN
-- ============================================================

create table if not exists public.events (
  id         bigserial primary key,
  ev_date    date not null,                 -- 예정일
  title      text not null,                 -- 예: 김철수 결혼식
  amount     numeric(14,0) not null default 0,
  kind       text not null default '경조사', -- 경조사 | 명절 | 가족용돈 | 기념일 | 기타
  yearly     boolean not null default false, -- 매년 반복 (어버이날·명절 등)
  done       boolean not null default false, -- 지출 완료
  memo       text default '',
  owner      text not null default '김현우',
  created_at timestamptz default now()
);
create index if not exists idx_ev_date on public.events (ev_date);

alter table public.events enable row level security;
drop policy if exists "ev_all" on public.events;
create policy "ev_all" on public.events
  for all to authenticated using (true) with check (true);

-- 고정 수입 기본값 (앱에서 언제든 수정 가능)
insert into public.settings (key, value)
values ('income_fixed', '{"김현우":5090000,"홍미란":2500000}'::jsonb)
on conflict (key) do nothing;

select * from public.settings order by key;
