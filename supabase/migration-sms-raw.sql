-- ============================================================
--  문자 원문을 그대로 받아 서버에서 파싱 (MacroDroid 설정 최소화)
--  Supabase SQL Editor 에 붙여넣고 RUN
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
  v_mer   text;
  v_card  text;
  v_md    text;
  v_hm    text;
  v_date  date;
  v_ts    timestamptz;
  v_fp    text;
  v_cnt   int;
begin
  -- 1) 비밀키 확인
  select value->>'secret' into v_sec from public.settings where key = 'sms_secret';
  if v_sec is null or v_sec = '' or p_secret is distinct from v_sec then
    return json_build_object('ok', false, 'error', 'unauthorized');
  end if;

  -- 2) 걸러낼 문자
  if p_raw is null or p_raw = '' then
    return json_build_object('ok', false, 'error', 'empty');
  end if;
  if p_raw !~ '승인' then
    return json_build_object('ok', false, 'skip', 'not approval');
  end if;
  if p_raw ~ '취소' or p_raw ~ 'USD' or p_raw ~ 'EUR' or p_raw ~ 'JPY' then
    return json_build_object('ok', false, 'skip', 'cancel or foreign');
  end if;

  -- 3) 금액 : 첫 번째 "숫자원" (누적금액은 뒤에 나오므로 자동 제외)
  v_amt := nullif(replace(substring(p_raw from '([0-9][0-9,]*)[[:space:]]*원'), ',', ''), '')::numeric;
  if v_amt is null or v_amt <= 0 then
    return json_build_object('ok', false, 'error', 'amount not found');
  end if;

  -- 4) 가맹점 : "MM/DD HH:MM" 바로 뒤 (같은 줄이든 다음 줄이든)
  v_mer := trim(substring(p_raw from '[0-9]{2}/[0-9]{2}[[:space:]]+[0-9]{2}:[0-9]{2}[[:space:]]*([^\r\n]+)'));
  if v_mer is null or v_mer = '' then
    v_mer := trim(substring(p_raw from '[0-9]{2}/[0-9]{2}[[:space:]]+[0-9]{2}:[0-9]{2}[[:space:]\r\n]*([^\r\n]+)'));
  end if;
  v_mer := regexp_replace(coalesce(v_mer,''), '누적.*$', '');
  v_mer := trim(v_mer);
  if v_mer = '' then
    return json_build_object('ok', false, 'error', 'merchant not found');
  end if;

  -- 5) 카드 구분
  v_card := case
    when p_raw ~ 'KB국민' or p_raw ~ '국민카드' then 'KB국민카드'
    when p_raw ~ '삼성'   then '삼성카드'
    when p_raw ~ '현대'   then '현대카드'
    when p_raw ~ '신한'   then '신한카드'
    else '' end;

  -- 6) 날짜 : MM/DD 를 올해로 해석, 미래면 작년으로
  v_md := substring(p_raw from '([0-9]{2}/[0-9]{2})[[:space:]]+[0-9]{2}:[0-9]{2}');
  v_hm := substring(p_raw from '[0-9]{2}/[0-9]{2}[[:space:]]+([0-9]{2}:[0-9]{2})');
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

  -- 7) 저장 (같은 시각·가맹점·금액이면 중복 방지)
  v_fp := 'sms|' || to_char(v_ts, 'YYYY-MM-DD"T"HH24:MI') || '|' || v_mer || '|' || v_amt::bigint;

  insert into public.transactions
    (kind, source, tx_date, merchant, amount, raw_amount, benefit,
     category, subcategory, is_work, owner, memo, fingerprint)
  values
    ('expense', 'sms', v_date, v_mer, v_amt, v_amt, 0,
     '미분류', '', false, coalesce(p_owner,'김현우'),
     coalesce(nullif(v_card,'') || ' · ', '') || '문자 자동 등록', v_fp)
  on conflict (fingerprint) do nothing;

  get diagnostics v_cnt = row_count;
  return json_build_object('ok', true, 'inserted', v_cnt,
                           'amount', v_amt, 'merchant', v_mer, 'card', v_card, 'date', v_date);
end $$;

grant execute on function public.ingest_sms_raw(text, text, text) to anon, authenticated;

-- ============================================================
--  테스트 : 실제 문자로 확인 (비밀키는 본인 것으로)
-- ============================================================
select public.ingest_sms_raw(
  '내가정한비밀문자열',
  E'[Web발신]\nKB국민카드0952승인\n김*우님\n64,340원 일시불\n08/01 23:54\n쿠팡(쿠페이)\n누적64,340원'
);
