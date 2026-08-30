-- ============================================================
--  결제 시각 저장  —  점심시간(11~14시) 분석용
--  Supabase SQL Editor 에 붙여넣고 RUN
-- ============================================================

-- 1) 거래 테이블에 시각 칸 추가
alter table public.transactions add column if not exists tx_time time;

-- 2) 문자 자동 등록에도 시각을 남기도록 함수 교체
--    (기존 ingest_sms_raw 와 동작은 같고, tx_time 만 추가로 저장합니다)
create or replace function public.ingest_sms_raw(
  p_secret text,
  p_raw    text,
  p_owner  text default '김현우'
) returns json
language plpgsql security definer set search_path = public as $$
declare
  v_sec text; v_amt numeric; v_cur text; v_fx numeric;
  v_mer text; v_card text; v_md text; v_hm text;
  v_date date; v_ts timestamp; v_fp text; v_cnt int;
  v_cat text; v_sub text; v_memo text;
  v_lines text[]; v_i int; v_j int; v_ln text;
begin
  select value->>'secret' into v_sec from public.settings where key = 'sms_secret';
  if v_sec is null or v_sec = '' or p_secret is distinct from v_sec then
    return json_build_object('ok', false, 'error', 'unauthorized');
  end if;
  if p_raw is null or p_raw = '' then
    return json_build_object('ok', false, 'error', 'empty');
  end if;
  if p_raw !~ '승인' then return json_build_object('ok', false, 'skip', 'not approval'); end if;
  if p_raw ~ '취소'  then return json_build_object('ok', false, 'skip', 'cancel'); end if;

  v_cur := substring(p_raw from
    '(USD|EUR|JPY|MYR|CNY|GBP|AUD|SGD|THB|VND|HKD|TWD|CAD|CHF|PHP|IDR|NZD|MOP|AED|MXN|TRY)');
  v_amt := nullif(replace(substring(p_raw from '([0-9][0-9,]*)[[:space:]]*원'), ',', ''), '')::numeric;

  if v_cur is not null then
    v_fx := nullif(replace(
              coalesce(substring(p_raw from v_cur || '[ \t]*([0-9][0-9,]*\.?[0-9]*)'),
                       substring(p_raw from '([0-9][0-9,]*\.?[0-9]*)[ \t]*' || v_cur)), ',', ''), '')::numeric;
    if v_fx is null or v_fx <= 0 then v_cur := null; end if;
  end if;
  if v_cur is null and (v_amt is null or v_amt <= 0) then
    return json_build_object('ok', false, 'error', 'amount not found');
  end if;

  v_mer := trim(substring(p_raw from '[0-9]{1,2}/[0-9]{1,2}[[:space:]]+[0-9]{1,2}:[0-9]{2}[[:space:]]*([^\r\n]+)'));
  if coalesce(v_mer,'') = '' then
    v_mer := trim(substring(p_raw from '[0-9]{1,2}/[0-9]{1,2}[[:space:]]+[0-9]{1,2}:[0-9]{2}[[:space:]\r\n]*([^\r\n]+)'));
  end if;
  v_mer := trim(regexp_replace(coalesce(v_mer,''), '누적.*$', ''));
  if v_mer ~ '^[0-9,\.]+$' or v_mer ~ '^[0-9][0-9,]*원' or v_mer ~ '^[A-Z]{3}[ \t]*[0-9]'
     or v_mer ~ '^(일시불|할부)' then
    v_mer := '';
  end if;
  if v_mer = '' then
    v_lines := regexp_split_to_array(replace(p_raw, E'\r', ''), E'\n');
    for v_i in 1 .. coalesce(array_length(v_lines, 1), 0) loop
      v_ln := trim(v_lines[v_i]);
      if v_ln ~ '[0-9]{1,2}/[0-9]{1,2}' and v_ln ~ '[0-9]{1,2}:[0-9]{2}' then
        for v_j in v_i + 1 .. coalesce(array_length(v_lines, 1), 0) loop
          v_ln := trim(v_lines[v_j]);
          if v_ln <> '' and v_ln !~ '누적' and v_ln !~ '^[0-9,\.]+$'
             and v_ln !~ '원[[:space:]]*(일시불|할부)?$' and v_ln !~ '^[A-Z]{3}[[:space:]]*[0-9]' then
            v_mer := v_ln; exit;
          end if;
        end loop;
        exit;
      end if;
    end loop;
  end if;
  if v_mer = '' then return json_build_object('ok', false, 'error', 'merchant not found'); end if;

  v_card := case
    when p_raw ~ 'KB국민' or p_raw ~ '국민카드' then 'KB국민카드'
    when p_raw ~ '삼성' then '삼성카드'
    when p_raw ~ '현대' then '현대카드'
    when p_raw ~ '신한' then '신한카드'
    else '' end;

  v_md := substring(p_raw from '([0-9]{1,2}/[0-9]{1,2})[[:space:]]+[0-9]{1,2}:[0-9]{2}');
  v_hm := substring(p_raw from '[0-9]{1,2}/[0-9]{1,2}[[:space:]]+([0-9]{1,2}:[0-9]{2})');
  if v_md is not null then
    begin
      v_date := to_date(to_char(now() at time zone 'Asia/Seoul','YYYY') || '/' || v_md, 'YYYY/MM/DD');
      if v_date > (now() at time zone 'Asia/Seoul')::date + 7 then v_date := v_date - interval '1 year'; end if;
    exception when others then v_date := (now() at time zone 'Asia/Seoul')::date;
    end;
  else
    v_date := (now() at time zone 'Asia/Seoul')::date;
  end if;
  v_ts := (v_date::text || ' ' || coalesce(v_hm,'00:00'))::timestamp;

  v_memo := coalesce(nullif(v_card,'') || ' · ', '') || '문자 자동 등록';
  if v_cur is not null then
    v_cat := '오락·문화'; v_sub := '해외여행';
    v_memo := v_memo || ' FX:' || v_cur || ':' || trim(to_char(v_fx, 'FM999999990.00'));
    v_fp := 'sms|' || to_char(v_ts, 'YYYY-MM-DD"T"HH24:MI') || '|' || v_mer
            || '|' || v_cur || trim(to_char(v_fx, 'FM999999990.00'));
    v_amt := coalesce(v_amt, 0);
  else
    v_cat := '미분류'; v_sub := '';
    v_fp := 'sms|' || to_char(v_ts, 'YYYY-MM-DD"T"HH24:MI') || '|' || v_mer || '|' || v_amt::bigint;
  end if;

  insert into public.transactions
    (kind, source, tx_date, tx_time, merchant, amount, raw_amount, benefit,
     category, subcategory, is_work, owner, memo, fingerprint)
  values
    ('expense', 'sms', v_date, nullif(v_hm,'')::time, v_mer, v_amt, v_amt, 0,
     v_cat, v_sub, false, coalesce(p_owner,'김현우'), v_memo, v_fp)
  on conflict (fingerprint) do nothing;

  get diagnostics v_cnt = row_count;
  return json_build_object('ok', true, 'inserted', v_cnt, 'amount', v_amt,
                           'currency', v_cur, 'fx', v_fx, 'time', v_hm,
                           'merchant', v_mer, 'card', v_card, 'date', v_date);
end $$;

grant execute on function public.ingest_sms_raw(text, text, text) to anon, authenticated;
