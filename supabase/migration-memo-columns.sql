-- ============================================================
--  memo 태그 → 칼럼  —  2026-10-11
--  memo 를 태그 저장소로 쓰던 설계 부채 정리.
--
--    [생활비] / [생활비제외]      → budget_flag  (true / false / null=자동 판정)
--    [기안:YYYY-MM]              → claim_period
--    FX:USD:20.00 @1374.55?      → fx_cur · fx_amt · fx_rate · fx_provisional
--    '이용내역' (설명 문구)        → doc_kind = 'usage'   (메모 글자는 그대로 둠)
--
--  ① 백업 테이블 transactions_bak_20261011 을 먼저 만든다
--  ② 칼럼 추가 → 기존 memo 에서 값 옮기기 → memo 에서 태그 글자 지우기
--  ③ 트리거 tx_tags_from_memo : 문자 파서 · 옛 버전 앱이 memo 에 태그를 써도
--     저장 순간 칼럼으로 옮기고 memo 에서 지운다 (앞으로도 계속 안전)
--
--  여러 번 돌려도 안전. 되돌리기는 맨 아래 주석 참고.
-- ============================================================

-- ① 백업 (이미 있으면 건너뜀)
do $$
begin
  if to_regclass('public.transactions_bak_20261011') is null then
    create table public.transactions_bak_20261011 as table public.transactions;
    alter table public.transactions_bak_20261011 enable row level security;   -- 앱에선 안 보이게
  end if;
end $$;

-- ② 칼럼
alter table public.transactions
  add column if not exists budget_flag    boolean,
  add column if not exists claim_period   text,
  add column if not exists fx_cur         text,
  add column if not exists fx_amt         numeric(14,2),
  add column if not exists fx_rate        numeric(12,4),
  add column if not exists fx_provisional boolean not null default false,
  add column if not exists doc_kind       text;

-- memo 한 줄 → 태그를 칼럼으로 옮기고 지운 결과 (트리거 · 일괄 변환 공용)
create or replace function public.tx_apply_memo_tags(r public.transactions)
returns public.transactions language plpgsql immutable as $$
declare
  m text := coalesce(r.memo, '');
  v text[];
begin
  if m ~ '\[생활비제외\]' then r.budget_flag := false;
  elsif m ~ '\[생활비\]' then r.budget_flag := true;
  end if;

  v := regexp_match(m, '\[기안:([0-9]{4}-[0-9]{2})\]');
  if v is not null then r.claim_period := v[1]; end if;

  v := regexp_match(m, 'FX:([A-Z]{3}):([0-9.]+)');
  if v is not null then r.fx_cur := v[1]; r.fx_amt := v[2]::numeric; end if;

  v := regexp_match(m, '@([0-9]+(\.[0-9]+)?)(\?)?');
  if v is not null and (r.fx_cur is not null or m ~ 'FX:') then
    r.fx_rate := v[1]::numeric;
    r.fx_provisional := v[3] is not null;
  end if;

  if m ~ '이용내역' then r.doc_kind := 'usage'; end if;

  -- 태그 글자 지우기 (설명 문구는 남김)
  m := regexp_replace(m, '\[(생활비제외|생활비|기안:[0-9]{4}-[0-9]{2})\]', '', 'g');
  m := regexp_replace(m, 'FX:[A-Z]{3}:[0-9.]+', '', 'g');
  m := regexp_replace(m, '@[0-9]+(\.[0-9]+)?\??', '', 'g');
  m := regexp_replace(m, '\s+', ' ', 'g');
  m := regexp_replace(m, '^[\s·]+|[\s·]+$', '', 'g');
  r.memo := m;
  return r;
end $$;

-- 기존 데이터 변환 (태그가 있는 행만)
update public.transactions t
   set budget_flag = x.budget_flag, claim_period = x.claim_period,
       fx_cur = x.fx_cur, fx_amt = x.fx_amt, fx_rate = x.fx_rate,
       fx_provisional = x.fx_provisional, doc_kind = x.doc_kind, memo = x.memo
  from (select (public.tx_apply_memo_tags(t2)).* from public.transactions t2
         where t2.memo ~ '\[생활비|\[기안:|FX:|@[0-9]|이용내역') x
 where t.id = x.id;

-- ③ 트리거
create or replace function public.tx_tags_from_memo() returns trigger
language plpgsql as $$
begin
  if new.memo ~ '\[생활비|\[기안:|FX:|@[0-9]|이용내역' then
    new := public.tx_apply_memo_tags(new);
  end if;
  return new;
end $$;

drop trigger if exists tx_tags_from_memo on public.transactions;
create trigger tx_tags_from_memo before insert or update of memo on public.transactions
  for each row execute function public.tx_tags_from_memo();

notify pgrst, 'reload schema';

-- 확인
-- select count(*) filter (where fx_cur is not null) fx, count(*) filter (where doc_kind='usage') usage,
--        count(*) filter (where memo ~ 'FX:|@[0-9]') left_tags from public.transactions;

-- 되돌리기 (필요할 때만)
-- update public.transactions t set memo = b.memo from public.transactions_bak_20261011 b where t.id = b.id;
-- drop trigger if exists tx_tags_from_memo on public.transactions;
