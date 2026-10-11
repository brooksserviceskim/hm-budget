-- ============================================================
--  public.sms(text) — 문자 원문 한 덩어리를 받는 입구 (DB에만 있던 것을 2026-10-11 기록)
--  첫 줄 = 비밀키, 나머지 = 문자 원문 → ingest_sms_raw 로 넘김
--  SQL 함수 본문은 실행 때 이름으로 찾으므로 sms-watch 적용 후에도 기록용 겉함수를 거친다.
-- ============================================================
CREATE OR REPLACE FUNCTION public.sms(text) RETURNS json LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' AS $function$
  select public.ingest_sms_raw(
    btrim(replace(split_part($1, E'\n', 1), E'\r', '')),
    substr($1, length(split_part($1, E'\n', 1)) + 2),
    '김현우'
  );
$function$;
