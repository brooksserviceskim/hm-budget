/* ============================================================
   ① Supabase 프로젝트를 만든 뒤 아래 두 값을 채워 넣으세요.
      Supabase 대시보드 → Project Settings → API Keys
        · Data API 의 Project URL     →  SUPABASE_URL
        · Publishable key (sb_publishable_...) →  SUPABASE_ANON_KEY
      (publishable key 는 공개되어도 되는 키입니다. RLS 로 보호됩니다.
       Secret key 는 절대 여기에 넣지 마세요.)

   ② 두 값이 비어 있으면 자동으로 "오프라인 모드"로 동작합니다.
      (이 브라우저에만 저장 · 기기 간 공유 안 됨)
   ============================================================ */
window.APP_CONFIG = {
  SUPABASE_URL: 'https://jjlmmebptyefmrqbrisw.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_WUTZ8a4bBrGALf6WLISXBA_vgzAzi4L',

  // 수입 드롭다운 항목 (필요하면 자유롭게 추가하세요)
  INCOME_SOURCES: [
    '급여소득',
    '사업소득',
    '보험금 환급',
    '업무비용 환급',
    '상여 · 성과급',
    '이자 · 배당',
    '용돈 · 지원금',
    '기타 수입'
  ],

  // 고정 급여 (예상치 계산용)
  FIXED_SALARY: 5095650,

  HOUSEHOLD: '김현우 · 홍미란 부부'
};
