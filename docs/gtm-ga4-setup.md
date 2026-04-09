# 콕콕 — GTM / GA4 / Solapi 설정 인수인계 문서

> 마지막 업데이트: 2026-04-09  
> 작성 기준: 현재 프로덕션 배포 상태

---

## 현재 구현 완료 상태

| 항목 | 값 |
|------|-----|
| 서비스 URL | https://kokkok-nu.vercel.app |
| GTM 컨테이너 ID | `GTM-5J9S297S` |
| GA4 측정 ID | `G-E0ZBMXEESR` |
| Solapi 발신번호 | `01055817054` |
| 배포 플랫폼 | Vercel (yzall94s-projects/kokkok) |
| 프레임워크 | Next.js 15 (App Router) |

---

## Vercel 환경변수 전체 목록

Vercel 프로젝트 설정 → Environment Variables 에서 관리.

| 변수명 | 환경 | 용도 |
|--------|------|------|
| `NEXT_PUBLIC_GA_MEASUREMENT_ID` | Production | GA4 측정 ID (`G-E0ZBMXEESR`) |
| `NEXT_PUBLIC_SUPABASE_URL` | Production | Supabase 프로젝트 URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Production | Supabase 익명 키 |
| `SOLAPI_API_KEY` | Production | Solapi API 키 |
| `SOLAPI_API_SECRET` | Production | Solapi API 시크릿 |
| `SOLAPI_SENDER` | Production | Solapi 발신번호 (`01055817054`) |

> **주의:** 환경변수 등록 시 반드시 `printf '%s' '값'` 방식 사용.  
> `echo` 또는 복붙 시 줄바꿈(`\n`)이 붙어 SMS 발송 실패 원인이 됨 (실제 발생한 버그).

### Vercel CLI로 환경변수 재등록하는 법

```bash
TOKEN=$(grep VERCEL_TOKEN .env.local | cut -d= -f2)

# 삭제 후 재등록 (printf로 줄바꿈 없이)
vercel env rm SOLAPI_SENDER production --yes --token $TOKEN
printf '%s' '01055817054' | vercel env add SOLAPI_SENDER production --token $TOKEN
```

---

## GTM / GA4 구현 구조

### layout.tsx — 스크립트 삽입 위치

```
<head>
  ├── GTM 스니펫 (dangerouslySetInnerHTML, 항상 로드)
  └── GA4 gtag.js (NEXT_PUBLIC_GA_MEASUREMENT_ID 환경변수 있을 때만 로드)
<body>
  └── GTM noscript iframe (JS 비활성 폴백)
```

- GTM은 환경변수 없이 하드코딩(`GTM-5J9S297S`)으로 항상 로드됨
- GA4는 `NEXT_PUBLIC_GA_MEASUREMENT_ID` 환경변수가 없으면 로드 안 됨 (로컬 개발 시 자동 비활성)
- `send_page_view: false` — GA4 자동 pageview 비활성, 가상 pageview를 코드에서 직접 발송

### src/lib/ga.ts — GA 유틸리티

| 함수 | 역할 |
|------|------|
| `pageview(url)` | GA4에 `config` 이벤트로 page_path 전송 |
| `event(action, params)` | GA4 커스텀 이벤트 전송 |
| `trackScreen(screenName, screenPath)` | GTM dataLayer에 `screen_view` 이벤트 푸시 |

`trackScreen`은 GA4가 없어도 GTM dataLayer에 직접 푸시하므로 GTM만 있어도 동작.

---

## 화면별 screen_view 이벤트 매핑

`page.tsx`의 `step` 상태가 바뀔 때마다 `pageview` + `trackScreen` 자동 호출.

| Step 상태 | screen_name | screen_path (page_path) |
|-----------|-------------|-------------------------|
| `landing` | `landing` | `/landing` |
| `login` | `login` | `/login` |
| `splash` | `splash` | `/splash` |
| `target` | `target` | `/target` |
| `done` | `done` | `/done` |
| `admin` | `admin` | `/admin` |

별도 페이지 라우트에서도 마운트 시 `trackScreen` 호출:

| 페이지 | screen_name | screen_path |
|--------|-------------|-------------|
| `reveal/page.tsx` | `reveal` | `/reveal` |
| `dashboard/page.tsx` | `dashboard` | `/dashboard` |

---

## GTM 컨테이너 설정 방법

GTM(tagmanager.google.com) → 컨테이너 `GTM-5J9S297S` → 작업공간

### 1단계: DLV(Data Layer Variable) 생성

| 변수명 | DLV 키 | 용도 |
|--------|--------|------|
| `DLV - screen_name` | `screen_name` | 화면명 |
| `DLV - screen_path` | `screen_path` | 화면 경로 |

변수 → 새로 만들기 → 유형: 데이터 영역 변수 → 키 이름 입력

### 2단계: 트리거 생성

| 트리거명 | 유형 | 조건 |
|----------|------|------|
| `screen_view 이벤트` | 맞춤 이벤트 | 이벤트 이름: `screen_view` |

### 3단계: GA4 이벤트 태그 생성

- 태그 유형: Google 애널리틱스 → GA4 이벤트
- 측정 ID: `G-E0ZBMXEESR`
- 이벤트 이름: `screen_view`
- 이벤트 매개변수:
  - `screen_name` → `{{DLV - screen_name}}`
  - `screen_path` → `{{DLV - screen_path}}`
- 트리거: `screen_view 이벤트`

### 4단계: 게시

변경사항 → 제출 → 버전 이름 입력 후 게시

---

## Solapi SMS 설정

### 계정 정보 위치

Solapi 대시보드: https://console.solapi.com  
(로그인 정보는 팀 1Password 또는 팀장에게 문의)

### 발신번호 등록 확인

Solapi → 발신번호 관리에서 `01055817054` 등록 여부 확인.  
미등록 시 `InvalidSender` 오류 발생.

### SMS API 코드 위치

`src/app/api/send-verification/route.ts`

- 환경변수 3개(`SOLAPI_API_KEY`, `SOLAPI_API_SECRET`, `SOLAPI_SENDER`) 중 하나라도 없으면 500 반환
- 서버 로그에 `[send-verification] env status:` 로 변수 로딩 상태 출력됨
- `failedMessageList`가 비어있지 않으면 실패로 처리

### 잔액 확인

Solapi SMS 1건당 18원. 콘솔에서 잔액 확인 및 충전 필요.

---

## 알려진 이슈 & 해결 이력

### [해결됨] SMS 발송 무응답

- **증상:** API가 200을 반환하지만 SMS가 도달하지 않음
- **원인:** Vercel 환경변수 `SOLAPI_SENDER`에 줄바꿈(`\n`)이 포함됨
- **해결:** `echo` 대신 `printf '%s' '번호'` 로 재등록 + 코드에서 `.trim()` 추가
- **발생일:** 2026-04-08

### [해결됨] 재전송 타이머 2배 속도 감소

- **증상:** 재전송 버튼 클릭 시 타이머가 1초마다 2씩 줄어드는 현상
- **원인:** `startCooldown()` 재호출 시 기존 `setInterval`을 clear하지 않아 interval 중복 누적
- **해결:** `startCooldown()` 진입부에 `clearInterval(cooldownRef.current)` 추가
- **파일:** `src/app/page.tsx`
- **발생일:** 2026-04-08

### [해결됨] 인증번호 입력 후 번호 수정 불가

- **증상:** SMS 전송 후 전화번호를 잘못 입력했음을 알았을 때 돌아갈 방법 없음
- **해결:** 인증번호 입력 화면 상단에 `← 번호 다시 입력` 버튼 추가 (타이머 리셋 포함)
- **파일:** `src/app/page.tsx`
- **발생일:** 2026-04-08

---

## 로컬 개발 환경 설정

```bash
# .env.local 예시 (실제 값은 팀장에게 요청)
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
NEXT_PUBLIC_GA_MEASUREMENT_ID=G-E0ZBMXEESR
SOLAPI_API_KEY=...
SOLAPI_API_SECRET=...
SOLAPI_SENDER=01055817054
VERCEL_TOKEN=vcp_...
```

로컬에서 `NEXT_PUBLIC_GA_MEASUREMENT_ID`를 설정하지 않으면 GA4 스크립트가 로드되지 않아 분석 데이터가 쌓이지 않음 (의도된 동작).

```bash
npm run dev   # http://localhost:3000
```
