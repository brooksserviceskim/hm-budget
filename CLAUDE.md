# 현우 미란 가계부

김현우·홍미란 2인 가구 가계부 PWA. **빌드 없는 바닐라 JS** (ES 모듈 아님, 전역 `<script>` 방식).

- 사이트 https://brooksserviceskim.github.io/hm-budget/
- 저장소 brooksserviceskim/hm-budget (main → GitHub Pages)
- 백엔드 Supabase `jjlmmebptyefmrqbrisw`

**상세 배경·함정·남은 할 일은 반드시 [`docs/프로젝트-정리.md`](docs/프로젝트-정리.md) 를 먼저 읽을 것.**

## 배포

```bash
bash deploy.sh "수정 내용"
```
자가검사(jsdom으로 17개 화면 렌더, `tools/smoke.js` 의 목록) → 커밋 → 푸시. 검사 실패하면 배포를 막음.

## 작업 규칙

1. **편집 후 `node tools/smoke.js` 를 돌린다.** 과거에 두 앵커 사이를 통째로 치환하다가
   필터 기능 100여 줄을 날려 화면 3개가 동시에 죽은 적 있음
2. **`sw.js` 의 `CACHE` 버전을 올린다.** 안 올리면 사용자가 옛 파일을 계속 받음
3. **DB에 칼럼을 추가하면 SQL 끝에 `notify pgrst, 'reload schema';`**
   없으면 SQL Editor엔 보이는데 앱에서는 조용히 실패함
4. **ES 모듈 금지.** `file://` 로도 열려야 함
5. **오류를 삼키지 말 것.** `reload()` 와 `renderAll()` 은 단계별로 `safe()` 로 감싸고
   실패하면 화면 상단 노란 박스로 노출. 새 코드도 같은 방식 유지
6. **Supabase secret key 를 코드에 넣지 말 것.** publishable key만 사용 (RLS 보호)
7. 수정은 실제 데이터로 검증. `~/Desktop/수입 지출 관리/` 에 진짜 카드·은행 파일이 있음

## 코드 지도

| 파일 | 역할 |
|---|---|
| `js/app.js` (2.7k줄) | 화면·UI 전부. 뷰 전환은 `go(view)`, 렌더는 `renderAll()` |
| `js/parsers.js` | 카드·은행 파일 파서. 삼성 명세서/이용내역, KB, 기업은행, 현대 PDF, 쿠팡 |
| `js/categorize.js` | 가맹점 → 분류. `RULES` 는 먼저 매치되는 것이 이김 |
| `js/analytics.js` | 집계 · `detectSubs`(정기결제 자동 탐지) |
| `js/store.js` | Supabase 래퍼. 오프라인이면 localStorage |
| `supabase/migration-sms-v3.sql` | 문자 파서 본문. **watch 적용 후 DB 함수 이름은 `ingest_sms_parse`** — 고칠 땐 이 이름으로 |
| `supabase/migration-sms-watch.sql` | `ingest_sms_raw` = 기록하는 겉함수 → `sms_log`. v3 를 그대로 다시 돌리면 기록이 끊김 |

## 알아둘 설계

- 중복 방지는 `transactions.fingerprint` (unique + `ignoreDuplicates`)
- `memo` 를 태그 저장소로 쓰고 있음 — **설계 부채**
  `[생활비]` `[생활비제외]` `[기안:YYYY-MM]` `FX:통화:금액 @환율` `이용내역`
- 명세서 `amount` = 할인 반영 청구액 / `raw_amount` = 할인 전 승인금액.
  중복 판정은 **둘 중 하나만 맞아도** 같은 결제로 봄
- AI·소프트웨어 구독은 `정보통신`이 아니라 **`사업·투자`** (개인사업자 선투자, 본인 요청)
- 대시보드 맨 위 **월급 배분** 카드: `settings.payday` (`keep` 통장 잔류분 · `autos` 자동이체). 기본값은 `PAYDAY_DEFAULT`
- 한글 경로는 macOS에서 NFD. 경로는 `os.listdir()` 로 받고 비교할 때만 NFC 정규화
