-- ============================================================
--  카드 승인 문자 파서 v3  —  2026-08-30
--  KB국민카드 RCS 카드형(가맹점이 승인시각보다 위) 대응
--  가맹점을 '문자 안에서 label 이 아닌 첫 줄'로 찾는 방식으로 바꿈
--  Supabase SQL Editor 에 통째로 붙여넣고 RUN
-- ============================================================

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
  v_lines text[]; v_i int; v_ln text;
  -- 가맹점이 아닌 줄 (카드사명 · 라벨 · 금액 · 날짜 · 안내문구)
  v_noise text :=
    '^\[?web발신|^\(광고\)|^kb국민|^국민카드|^삼성카드|^삼성[0-9]|^현대카드|^신한카드|^롯데카드'
    || '|^하나카드|^우리카드|^비씨카드|^농협카드|^승인$|^취소$|^체크승인$|^일시불|^할부'
    || '|고객명|승인시각|승인일시|승인번호|이용일시|이용시각|누적|한[[:space:]]?달|얼마나|썼을까'
    || '|^[0-9]+$|^[0-9,]+[[:space:]]*원|^[0-9]{1,2}/[0-9]{1,2}|^[A-Z]{3}[[:space:]]*[0-9]'
    || '|^[0-9]{1,2}:[0-9]{2}|님$|^김\*|^잔액|^출금|^입금|^www\.|^https?:|^■|^▶|^☞';
begin
  select value->>'secret' into v_sec from public.settings where key = 'sms_secret';
  if v_sec is null or v_sec = '' or p_secret is distinct from v_sec then
    return json_build_object('ok', false, 'error', 'unauthorized');
  end if;
  if p_raw is null or p_raw = '' then
    return json_build_object('ok', false, 'error', 'empty');
  end if;
  if p_raw ~ '\(광고\)' then return json_build_object('ok', false, 'skip', 'ad'); end if;
  if p_raw !~ '승인' then return json_build_object('ok', false, 'skip', 'not approval'); end if;
  if p_raw ~ '취소'  then return json_build_object('ok', false, 'skip', 'cancel'); end if;

  -- 통화 · 금액
  v_cur := substring(p_raw from
    '(USD|EUR|JPY|MYR|CNY|GBP|AUD|SGD|THB|VND|HKD|TWD|CAD|CHF|PHP|IDR|NZD|MOP|AED|MXN|TRY)');
  v_amt := nullif(replace(substring(p_raw from '([0-9][0-9,]*)[[:space:]]*원'), ',', ''), '')::numeric;
  if v_cur is not null then
    v_fx := nullif(replace(
              coalesce(substring(p_raw from v_cur || '[ \t]*([0-9][0-9,]*\.?[0-9]*)'),
                       substring(p_raw from '([0-9][0-9,]*\.?[0-9]*)[ \t]*' || v_cur)), ',', ''), '')::numeric;
    if v_fx is null or v_fx <= 0 then v_cur := null; end if;
    if v_cur = 'KRW' then v_amt := coalesce(v_amt, v_fx); v_cur := null; end if;
  end if;
  if v_cur is null and (v_amt is null or v_amt <= 0) then
    return json_build_object('ok', false, 'error', 'amount not found');
  end if;

  -- 가맹점 : 라벨·금액·날짜가 아닌 첫 줄  (모든 카드사 · 구형 SMS · RCS 카드형 공통)
  v_lines := regexp_split_to_array(replace(p_raw, E'\r', ''), E'\n');
  for v_i in 1 .. coalesce(array_length(v_lines, 1), 0) loop
    v_ln := btrim(v_lines[v_i]);
    continue when v_ln = '';
    continue when v_ln ~* v_noise;
    continue when v_ln ~ '^[0-9,\.[:space:]원()]+$';
    v_mer := v_ln; exit;
  end loop;

  -- 예비 : 예전 방식 (승인시각 뒤)
  if coalesce(v_mer,'') = '' then
    v_mer := btrim(regexp_replace(
      coalesce(substring(p_raw from
        '[0-9]{1,2}/[0-9]{1,2}[[:space:]]+[0-9]{1,2}:[0-9]{2}[[:space:]]*([^\r\n]+)'), ''),
      '누적.*$', ''));
  end if;
  if coalesce(v_mer,'') = '' then
    return json_build_object('ok', false, 'error', 'merchant not found');
  end if;

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

notify pgrst, 'reload schema';

-- ============================================================
--  오늘 놓친 2건 되살리기 (비밀키는 본인 것으로)
-- ============================================================
-- select public.ingest_sms_raw('내비밀키',
--   E'[Web발신]\nKB국민카드0952\n승인\n30,030 원(일시불)\n씨제이올리브네트웍\n고객명 김*우님\n승인시각 08/30 12:56\n누적 1,269,750원');
-- select public.ingest_sms_raw('내비밀키',
--   E'[Web발신]\nKB국민카드0952\n승인\n17,400 원(일시불)\n빵백화점 청라점\n고객명 김*우님\n승인시각 08/30 13:03\n누적 1,287,150원');
