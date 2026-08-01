# 현우 미란 가계부

김현우 · 홍미란 부부의 수입/지출을 관리하는 모바일 웹앱(PWA)입니다.
삼성카드 명세서와 기업은행 입출금 내역을 올리면 자동으로 분류·집계되고,
2인 가구 평균과 비교해 어디서 얼마를 아낄 수 있는지 알려줍니다.

아이폰·안드로이드 홈 화면에 추가하면 앱처럼 전체화면으로 열립니다.

---

## 화면 구성 (하단 탭 5개)

| 탭 | 내용 |
|---|---|
| **홈** | 이번 달 남은 돈, 지난달 대비 증감, 카테고리 도넛, 2인 가구 평균 비교, 진단·절약 제안, 많이 쓴 곳 |
| **가계부** | 월별 거래 내역. 지출/수입 토글, 분류 칩 필터, 검색. 항목을 누르면 분류 변경·업무비용 표시 |
| **고정비** | 매월 고정비와 일시 할부를 직접 등록/수정. 할부는 `+1` 로 회차를 넘기면 완납 시 자동으로 빠짐 |
| **분석** | 고정비 vs 변동비, 쿠팡·마트·배달 집중 분석, 기간별(연/월/주/일) 추이 |
| **생활비** | 월 예산(기본 100만원) 대비 남은 금액, 날짜 페이스, 어디에 썼는지, 문자 자동 등록분 |
| **더보기** | 명세서 업로드 · 수입/지출 입력 · 쿠팡 상품 분석 · 쿠팡 가져오기 · 업무비용 환급 |

**권한** — 김현우 `owner`(전체 관리 · 명세서 업로드) / 홍미란 `member`(본인 수입·지출·고정비 직접 입력·수정)
상단 `2인 합계 / 김현우 / 홍미란` 버튼으로 전환합니다. **2인 합계가 가구 전체 가계부**입니다.

**설치 순서** — `supabase/schema.sql` → `supabase/migration-owner.sql` → `supabase/migration-budget-sms.sql`
문자 자동 연동은 `docs/문자연동-설정.md` 참고.

---

## 1. Supabase 만들기 (두 사람이 같은 데이터를 보려면 필수)

1. https://supabase.com → **Start your project** → GitHub 로그인
2. **New project**
   - Name `hm-budget` · Region **Northeast Asia (Seoul)** · DB 비밀번호는 따로 기록
3. 왼쪽 **SQL Editor → New query** → `supabase/schema.sql` 전체 붙여넣고 **RUN**
4. **Authentication → Users → Add user** 로 두 계정 생성 (Auto Confirm 체크)
5. 다시 SQL Editor 에서 실행 (이메일은 실제로 만든 것으로 교체)

```sql
update public.profiles set name = '김현우', role = 'owner'
  where id = (select id from auth.users where email = '김현우이메일@gmail.com');
update public.profiles set name = '홍미란', role = 'viewer'
  where id = (select id from auth.users where email = '홍미란이메일@gmail.com');
```

6. **Project Settings → Data API** 의 `Project URL` 과 `anon public` 키를 `js/config.js` 에 입력

```js
window.APP_CONFIG = {
  SUPABASE_URL: 'https://xxxxxxxx.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOi...',
  ...
};
```

> `anon key` 는 공개돼도 되는 키입니다. 실제 데이터는 RLS(행 수준 보안)가 지킵니다.

---

## 2. GitHub Pages 로 배포

1. https://github.com/new → 이름 `hm-budget` → **Public** → Create
2. 새 저장소 화면에서 **uploading an existing file** → 이 폴더 **안의 파일·폴더 전부** 드래그 → Commit
3. **Settings → Pages** → Source `Deploy from a branch` / Branch `main` / `/ (root)` → Save
4. 1~2분 뒤 `https://<아이디>.github.io/hm-budget/` 으로 접속

---

## 3. 아이폰에 앱으로 설치 (홍미란)

1. **사파리**로 위 주소를 엽니다 (크롬 아님 — 사파리여야 합니다)
2. 하단 **공유 버튼** ⬆️ → **홈 화면에 추가** → 추가
3. 홈 화면 아이콘으로 실행하면 주소창 없이 전체화면으로 열립니다

안드로이드는 크롬 메뉴 → **앱 설치**.

---

## 4. 매달 하는 일

1. 삼성카드에서 **이용대금명세서 엑셀** 다운로드
2. 더보기 → **명세서 업로드** 에 드래그 (중복은 자동으로 걸러집니다)
3. 사업소득이 들어왔으면 **수입 입력**
4. 루트82 업무로 쓴 건은 가계부에서 해당 항목을 눌러 **업무비용 표시**
5. 할부가 있으면 고정비 탭에서 **+1**

---

## 5. 데이터 출처

| 기간 | 출처 | 형태 |
|---|---|---|
| 2025-01 ~ 2025-12 | 기존 `수입 지출 내역.xlsx` 계산 시트 | 월 단위 집계 (가맹점 상세·수입 기록 없음) |
| 2026-01 ~ | 삼성카드 명세서 + 기업은행 입출금 | 실거래 단위 |

- 집계 기준일은 **이용일**입니다. 이번 달 카드 사용분은 다음 달 명세서를 올려야 채워집니다.
- 삼성카드 결제대금(은행 출금)은 이중 계상이라 지출에서 제외됩니다.
- 본인 계좌 간 이체는 지출·수입 모두에서 빠집니다.

---

## 6. 파일 구조

```
├── index.html               화면
├── manifest.webmanifest     PWA 설정
├── sw.js                    오프라인 캐시
├── icons/                   앱 아이콘
├── css/app.css              스타일
├── js/
│   ├── config.js            ★ Supabase 접속 정보 (여기만 채우면 됨)
│   ├── categorize.js        가맹점 → 분류 규칙
│   ├── parsers.js           삼성카드/기업은행 파서
│   ├── store.js             데이터 저장 (Supabase / 오프라인)
│   ├── analytics.js         집계 · 진단 엔진
│   └── app.js               화면 로직
├── data/                    2인 가구 평균 · 초기 데이터
└── supabase/schema.sql      ★ Supabase SQL Editor 에 붙여넣을 스크립트
```

출처: 국가데이터처(통계청) 가계동향조사 2025년 3분기 2인 근로자가구 기준
