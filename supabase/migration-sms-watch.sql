-- ============================================================
--  문자 연동 감시  —  2026-10-10
--  ingest_sms_raw 에 들어온 모든 문자를 sms_log 에 남긴다.
--   · 파싱 실패(가맹점/금액 못 찾음, 예외)가 조용히 사라지지 않게
--   · 마지막 수신 시각으로 MacroDroid 가 꺼졌는지 알 수 있게
--
--  파서 본문은 건드리지 않는다. 기존 ingest_sms_raw 를 ingest_sms_parse 로
--  이름만 바꾸고, 같은 이름의 '기록하는 겉함수'를 새로 만든다.
--  → MacroDroid URL(rpc/ingest_sms_raw)은 그대로.
--
--  ★ 이후 문자 형식이 바뀌어 파서를 고칠 때는 ingest_sms_parse 를 고칠 것.
--    (migration-sms-v3.sql 을 그대로 다시 돌리면 겉함수를 덮어써서 기록이 끊김)
--
--  Supabase SQL Editor 에 통째로 붙여넣고 RUN. 여러 번 돌려도 안전.
-- ============================================================

create table if not exists public.sms_log (
  id          bigserial primary key,
  received_at timestamptz not null default now(),
  raw         text,
  result      jsonb,
  ok          boolean not null default false,
  resolved    boolean not null default false
);
create index if not exists idx_sms_log_at on public.sms_log (received_at desc);

alter table public.sms_log enable row level security;
drop policy if exists "smslog_select" on public.sms_log;
drop policy if exists "smslog_update" on public.sms_log;
create policy "smslog_select" on public.sms_log for select to authenticated using (true);
create policy "smslog_update" on public.sms_log for update to authenticated using (true) with check (true);

-- 1) 기존 파서 → ingest_sms_parse (한 번만)
do $$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                 where n.nspname = 'public' and p.proname = 'ingest_sms_parse') then
    alter function public.ingest_sms_raw(text, text, text) rename to ingest_sms_parse;
  end if;
end $$;
revoke execute on function public.ingest_sms_parse(text, text, text) from anon, authenticated, public;

-- 2) 기록하는 겉함수
create or replace function public.ingest_sms_raw(
  p_secret text,
  p_raw    text,
  p_owner  text default '김현우'
) returns json
language plpgsql security definer set search_path = public as $$
declare
  v_res json;
begin
  begin
    v_res := public.ingest_sms_parse(p_secret, p_raw, p_owner);
  exception when others then
    v_res := json_build_object('ok', false, 'error', 'exception: ' || sqlerrm);
  end;

  -- 비밀키가 틀린 호출은 남기지 않는다 (아무나 로그를 채울 수 없게)
  if coalesce(v_res->>'error', '') <> 'unauthorized' then
    insert into public.sms_log (raw, result, ok)
    values (left(p_raw, 2000), v_res::jsonb, coalesce((v_res->>'ok')::boolean, false));
    delete from public.sms_log where received_at < now() - interval '120 days';
  end if;
  return v_res;
end $$;

grant execute on function public.ingest_sms_raw(text, text, text) to anon, authenticated;

notify pgrst, 'reload schema';

-- 확인용
-- select received_at, ok, result->>'error' err, result->>'skip' skip, left(raw, 60) from public.sms_log order by id desc limit 20;
