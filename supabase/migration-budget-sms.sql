-- ============================================================
--  생활비 예산 + 문자(SMS) 자동 연동
--  Supabase SQL Editor 에 전체 붙여넣고 RUN 하세요.
--  ※ migration-owner.sql 을 먼저 실행한 뒤에 하세요.
-- ============================================================

-- 1) 설정 저장소 ------------------------------------------------
create table if not exists public.settings (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz default now()
);

alter table public.settings enable row level security;
drop policy if exists "set_all" on public.settings;
create policy "set_all" on public.settings
  for all to authenticated using (true) with check (true);

-- 기본 생활비 예산 (월 100만원)
insert into public.settings (key, value)
values ('budget', '{"amount":1000000,"startDay":1}'::jsonb)
on conflict (key) do nothing;

-- 문자 연동용 비밀키 (아래 값을 본인만 아는 문자열로 바꾸세요)
insert into public.settings (key, value)
values ('sms_secret', '{"secret":"CHANGE-ME-1234"}'::jsonb)
on conflict (key) do nothing;

-- 2) 문자 → 지출 자동 등록 함수 ---------------------------------
--    폰의 자동화 앱(MacroDroid)이 이 함수를 호출합니다.
--    비밀키가 맞을 때만 동작하며, 같은 결제는 두 번 들어가지 않습니다.
create or replace function public.ingest_sms(
  p_secret   text,
  p_amount   numeric,
  p_merchant text,
  p_owner    text default '김현우',
  p_when     timestamptz default now()
) returns json
language plpgsql security definer set search_path = public as $$
declare
  v_sec text;
  v_fp  text;
  v_cnt int;
begin
  select value->>'secret' into v_sec from public.settings where key = 'sms_secret';
  if v_sec is null or v_sec = '' or p_secret is distinct from v_sec then
    return json_build_object('ok', false, 'error', 'unauthorized');
  end if;
  if p_amount is null or p_amount <= 0 or coalesce(p_merchant,'') = '' then
    return json_build_object('ok', false, 'error', 'bad payload');
  end if;

  v_fp := 'sms|' || to_char(p_when at time zone 'Asia/Seoul', 'YYYY-MM-DD"T"HH24:MI')
                 || '|' || p_merchant || '|' || p_amount::bigint;

  insert into public.transactions
    (kind, source, tx_date, merchant, amount, raw_amount, benefit,
     category, subcategory, is_work, owner, memo, fingerprint)
  values
    ('expense', 'sms', (p_when at time zone 'Asia/Seoul')::date, p_merchant,
     p_amount, p_amount, 0, '미분류', '', false, coalesce(p_owner,'김현우'),
     '문자 자동 등록', v_fp)
  on conflict (fingerprint) do nothing;

  get diagnostics v_cnt = row_count;
  return json_build_object('ok', true, 'inserted', v_cnt);
end $$;

-- 로그인 없이(폰에서) 호출할 수 있도록 실행 권한 부여
grant execute on function public.ingest_sms(text, numeric, text, text, timestamptz) to anon, authenticated;

-- 3) 확인 ------------------------------------------------------
select key, value from public.settings order by key;
