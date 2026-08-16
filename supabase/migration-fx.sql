-- ============================================================
--  외화(해외) 카드 결제 지원  —  2026-08
--  기존에는 USD/EUR/JPY 가 보이면 그냥 버렸으나,
--  이제는 외화 금액을 기록하고 원화는 앱에서 결제일 환율로 채운다.
--  Supabase SQL Editor 에 통째로 붙여넣고 RUN
-- ============================================================

create or replace function public.ingest_sms_raw(
  p_secret text,
  p_raw    text,
  p_owner  text default '김현우'
) returns json
language plpgsql security definer set search_path = public as $$
declare
  v_sec   text;
  v_amt   numeric;
  v_cur   text;
  v_fx    numeric;
  v_mer   text;
  v_card  text;
  v_md    text;
  v_hm    text;
  v_date  date;
  v_ts    timestamp;
  v_fp    text;
  v_cnt   int;
  v_cat   text;
  v_sub   text;
  v_memo  text;
  v_lines text[];
  v_i     int;
  v_j     int;
  v_ln    text;
begin
  -- 1) 비밀키
  select value->>'secret' into v_sec from public.settings where key = 'sms_secret';
  if v_sec is null or v_sec = '' or p_secret is distinct from v_sec then
    return json_build_object('ok', false, 'error', 'unauthorized');
  end if;

  if p_raw is null or p_raw = '' then
    return json_build_object('ok', false, 'error', 'empty');
  end if;
  if p_raw !~ '승인' then
    return json_build_object('ok', false, 'skip', 'not approval');
  end if;
  if p_raw ~ '취소' then
    return json_build_object('ok', false, 'skip', 'cancel');
  end if;

  -- 2) 통화 판별 (해외 결제)
  v_cur := substring(p_raw from
    '(USD|EUR|JPY|MYR|CNY|GBP|AUD|SGD|THB|VND|HKD|TWD|CAD|CHF|PHP|IDR|NZD|MOP|AED|MXN|TRY)');

  -- 3) 원화 금액 : 첫 번째 "숫자원"
  v_amt := nullif(replace(substring(p_raw from '([0-9][0-9,]*)[[:space:]]*원'), ',', ''), '')::numeric;

  -- 4) 외화 금액 : 통화코드 앞뒤 숫자
  if v_cur is not null then
    v_fx := nullif(replace(
              coalesce(
                substring(p_raw from v_cur || '[ \t]*([0-9][0-9,]*\.?[0-9]*)'),
                substring(p_raw from '([0-9][0-9,]*\.?[0-9]*)[ \t]*' || v_cur)
              ), ',', ''), '')::numeric;
    if v_fx is null or v_fx <= 0 then
      v_cur := null;
    end if;
  end if;

  if v_cur is null and (v_amt is null or v_amt <= 0) then
    return json_build_object('ok', false, 'error', 'amount not found');
  end if;

  -- 5) 가맹점 : "MM/DD HH:MM" 뒤
  v_mer := trim(substring(p_raw from '[0-9]{1,2}/[0-9]{1,2}[[:space:]]+[0-9]{1,2}:[0-9]{2}[[:space:]]*([^\r\n]+)'));
  if coalesce(v_mer,'') = '' then
    v_mer := trim(substring(p_raw from '[0-9]{1,2}/[0-9]{1,2}[[:space:]]+[0-9]{1,2}:[0-9]{2}[[:space:]\r\n]*([^\r\n]+)'));
  end if;
  v_mer := trim(regexp_replace(coalesce(v_mer,''), '누적.*$', ''));

  -- 5-a) 가맹점 자리에 금액/통화/할부 문구가 잡혔으면 버린다
  if v_mer ~ '^[0-9,\.]+$' or v_mer ~ '^[0-9][0-9,]*원' or v_mer ~ '^[A-Z]{3}[ \t]*[0-9]'
     or v_mer ~ '^(일시불|할부)' then
    v_mer := '';
  end if;

  -- 5-b) 못 찾으면 줄 단위로 (RCS 카드형 레이아웃)
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

  if v_mer = '' then
    return json_build_object('ok', false, 'error', 'merchant not found');
  end if;

  -- 6) 카드 구분
  v_card := case
    when p_raw ~ 'KB국민' or p_raw ~ '국민카드' then 'KB국민카드'
    when p_raw ~ '삼성'   then '삼성카드'
    when p_raw ~ '현대'   then '현대카드'
    when p_raw ~ '신한'   then '신한카드'
    else '' end;

  -- 7) 날짜
  v_md := substring(p_raw from '([0-9]{1,2}/[0-9]{1,2})[[:space:]]+[0-9]{1,2}:[0-9]{2}');
  v_hm := substring(p_raw from '[0-9]{1,2}/[0-9]{1,2}[[:space:]]+([0-9]{1,2}:[0-9]{2})');
  if v_md is not null then
    begin
      v_date := to_date(to_char(now() at time zone 'Asia/Seoul','YYYY') || '/' || v_md, 'YYYY/MM/DD');
      if v_date > (now() at time zone 'Asia/Seoul')::date + 7 then
        v_date := v_date - interval '1 year';
      end if;
    exception when others then
      v_date := (now() at time zone 'Asia/Seoul')::date;
    end;
  else
    v_date := (now() at time zone 'Asia/Seoul')::date;
  end if;
  v_ts := (v_date::text || ' ' || coalesce(v_hm,'00:00'))::timestamp;

  -- 8) 분류 · 메모 · 지문
  v_memo := coalesce(nullif(v_card,'') || ' · ', '') || '문자 자동 등록';
  if v_cur is not null then
    v_cat  := '오락·문화';
    v_sub  := '해외여행';
    v_memo := v_memo || ' FX:' || v_cur || ':' || trim(to_char(v_fx, 'FM999999990.00'));
    v_fp   := 'sms|' || to_char(v_ts, 'YYYY-MM-DD"T"HH24:MI') || '|' || v_mer
              || '|' || v_cur || trim(to_char(v_fx, 'FM999999990.00'));
    v_amt  := coalesce(v_amt, 0);
  else
    v_cat := '미분류'; v_sub := '';
    v_fp  := 'sms|' || to_char(v_ts, 'YYYY-MM-DD"T"HH24:MI') || '|' || v_mer || '|' || v_amt::bigint;
  end if;

  insert into public.transactions
    (kind, source, tx_date, merchant, amount, raw_amount, benefit,
     category, subcategory, is_work, owner, memo, fingerprint)
  values
    ('expense', 'sms', v_date, v_mer, v_amt, v_amt, 0,
     v_cat, v_sub, false, coalesce(p_owner,'김현우'), v_memo, v_fp)
  on conflict (fingerprint) do nothing;

  get diagnostics v_cnt = row_count;
  return json_build_object('ok', true, 'inserted', v_cnt, 'amount', v_amt,
                           'currency', v_cur, 'fx', v_fx,
                           'merchant', v_mer, 'card', v_card, 'date', v_date);
end $$;

grant execute on function public.ingest_sms_raw(text, text, text) to anon, authenticated;

-- ============================================================
--  테스트 (비밀키는 본인 것으로)
-- ============================================================
-- select public.ingest_sms_raw('miran0813!',
--   E'삼성2695해외승인 김*우\nMYR 150.00\n08/18 19:22\nJALAN ALOR KL');
-- select public.ingest_sms_raw('miran0813!',
--   E'[Web발신]\nKB국민카드0952승인\n김*우님\n64,340원 일시불\n08/01 23:54\n쿠팡(쿠페이)\n누적64,340원');
