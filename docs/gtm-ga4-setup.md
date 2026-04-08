# GTM + GA4 세팅 가이드 — 콕콕 서비스

> **대상**: 콕콕(`kokkok-nu.vercel.app`) 프로덕션 배포 기준
> **스택**: Next.js 15 App Router · TypeScript · Vercel · Supabase Edge Functions
> **최초 작성**: 2026-04-08 | **마지막 업데이트**: 2026-04-08

---

## 현재 구현 상태 (완료)

| 항목 | 값 / 상태 |
|------|-----------|
| GA4 Measurement ID | `G-E0ZBMXEESR` |
| GTM Container ID | `GTM-5J9S297S` |
| 프로덕션 URL | `https://kokkok-nu.vercel.app` |
| Vercel 환경변수 | `NEXT_PUBLIC_GA_MEASUREMENT_ID=G-E0ZBMXEESR` ✅ |
| GTM 스니펫 | `layout.tsx` `<head>` 최상단 (인라인) ✅ |
| GTM noscript | `layout.tsx` `<body>` 직후 ✅ |
| GA4 gtag.js | `layout.tsx` `<head>` (GTM 스니펫 다음) ✅ |
| GA4 유틸 파일 | `src/lib/ga.ts` (`pageview`, `event`, `trackScreen`) ✅ |
| 가상 pageview | step 전환마다 `pageview()` 호출 (`page.tsx`) ✅ |
| screen_view 이벤트 | step 전환마다 `trackScreen()` → dataLayer push ✅ |
| reveal 페이지 추적 | `/reveal` 진입 시 `pageview` + `trackScreen` ✅ |

### `layout.tsx` 현재 `<head>` 구조

```
<head>
  1. GTM 스니펫 인라인 스크립트 (GTM-5J9S297S) ← 최상단
  2. GA4 gtag.js <script async> + 초기화 인라인 스크립트 (G-E0ZBMXEESR)
  3. Pretendard 폰트 link
  4. apple-touch-icon link
</head>
<body>
  <noscript> GTM iframe (GTM-5J9S297S) ← body 첫 번째 자식
  ...
</body>
```

### screen_view 이벤트 매핑

| Step | screen_name | screen_path |
|------|-------------|-------------|
| `login` | `login` | `/` |
| `splash` | `splash` | `/splash` |
| `target` | `target` | `/target` |
| `done` | `done` | `/done` |
| `admin` | `admin` | `/admin` |
| reveal 페이지 | `reveal` | `/reveal` |

---

## 목차

1. [서비스 사용자 플로우](#1-서비스-사용자-플로우)
2. [GTM 개요](#2-gtm-개요)
3. [GA4 이벤트 설계 초안](#3-ga4-이벤트-설계-초안)
4. [GTM 컨테이너 설정 가이드](#4-gtm-컨테이너-설정-가이드)
5. [Next.js App Router + GTM 통합 방법](#5-nextjs-app-router--gtm-통합-방법)
6. [추후 작업 체크리스트](#6-추후-작업-체크리스트)

---

## 1. 서비스 사용자 플로우

### 페이지 / 라우트 구조

```
/                → 메인 페이지 (발신자 인터페이스 + 관리자 패널)
/reveal?t=[token]  → 수신자 공개 페이지 (SMS 딥링크로 진입)

API Routes (Next.js):
  POST /api/send-verification   → SMS 인증번호 발송 (Solapi)
  POST /api/verify-code         → 인증번호 확인 + 세션 토큰 발급

Supabase Edge Functions:
  submit-kokkok   → 콕콕 제출, 매칭 확인, SMS 발송
  get-reveal      → reveal_token으로 매칭 정보 조회
```

메인 페이지(`/`)는 단일 페이지 다중 스텝(SPA-like) 구조로, 물리적 라우트 이동 없이 step state로 화면 전환이 이루어진다:

```
login → splash → target → done
                       ↘ admin (내 콕콕 현황)
```

---

### 1-1. 발신자 플로우 (고백하는 사람)

```
┌──────────────────────────────────────────────────────────────────┐
│                        발신자 여정                                │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  [Login Step]                                                    │
│    1. 이름 + 전화번호 입력 → "시작하기" 클릭                      │
│    2. POST /api/send-verification (phone)                        │
│       └─ Solapi: SMS로 6자리 인증번호 발송                        │
│    3. 인증번호 입력 → "확인" 클릭                                  │
│    4. POST /api/verify-code (phone, code)                        │
│       └─ 응답: verified=true + 32바이트 session token            │
│    5. localStorage에 세션 저장 (14일 TTL)                        │
│                          ↓                                       │
│  [Splash Step]                                                   │
│    1. 통계 배너 표시 (X명이 콕콕, Y쌍 커플)                       │
│    2. 빛나는 오브 또는 "내 콕콕 현황" 버튼 클릭                   │
│       ├─ 오브 클릭 → Target Step                                 │
│       └─ "내 콕콕 현황" → Admin Step                             │
│                          ↓                                       │
│  [Target Step] ← 핵심 액션                                       │
│    1. 상대방 전화번호 입력 (필수)                                  │
│    2. 힌트 문자 입력 (선택, 최대 100자)                           │
│    3. "콕! 💗" 버튼 클릭                                         │
│    4. Supabase Edge: submit-kokkok 호출                          │
│       ├─ target_phone을 SHA-256 해시                             │
│       ├─ 상대방이 이미 나에게 콕콕했는지 확인 → 매칭 여부         │
│       ├─ kokkok_entries 테이블에 저장                            │
│       └─ 매칭 시: 양쪽에 reveal 링크 SMS 발송                    │
│                          ↓                                       │
│  [Done Step]                                                     │
│    - 매칭 O: "매칭됐어요! 💗 서로 같은 마음이에요!"              │
│    - 매칭 X: "전송 완료 💌 상대방도 콕콕하면 연결돼요!"           │
│    - "한 번 더 콕콕 💗" → Target Step으로 복귀 (반복 가능)       │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

---

### 1-2. 수신자 플로우 (힌트 받는 사람)

```
┌──────────────────────────────────────────────────────────────────┐
│                        수신자 여정                                │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  [SMS 수신]                                                      │
│    텍스트: "[콕콕] 누군가 당신을 좋아해요!"                       │
│    링크: https://kokkok-nu.vercel.app/reveal?t=[reveal_token]    │
│                          ↓                                       │
│  [Reveal Page - /reveal?t=[token]]                              │
│    1. URL에서 토큰 추출 (useSearchParams)                        │
│    2. Supabase Edge: get-reveal(token) 호출                      │
│       └─ 응답: { matched, partner_name?, partner_phone?, hint? } │
│                          ↓                                       │
│  매칭 O: [MatchedView]                                           │
│    - 상대방 이름 + 전화번호 + 힌트 표시                           │
│    - "나도 콕콕하러 가기 💗" 버튼 (→ 홈)                        │
│                                                                  │
│  매칭 X: [NotMatchedView]                                        │
│    - 힌트만 표시, 발신자 정보 비공개                              │
│    - "콕콕에 가입해서 같은 사람에게 마음을 전하면 매칭!"          │
│    - "나도 콕콕하러 가기 💗" 버튼 (→ 홈)                        │
│                          ↓                                       │
│  [수신자의 역-콕콕 (선택적)]                                     │
│    1. 홈으로 이동 → 로그인                                       │
│    2. 추측되는 발신자 번호로 콕콕 전송                           │
│    3. 발신자와 일치 시 → 매칭 성사 + 양쪽 SMS 발송               │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

---

### 1-3. 핵심 인터랙션 포인트 요약

| 구분 | 인터랙션 | 발생 위치 |
|------|----------|-----------|
| 폼 제출 | 인증번호 발송 | Login Step |
| 폼 제출 | 인증번호 확인 | Login Step |
| 폼 제출 | 콕콕 전송 (상대번호 + 힌트) | Target Step |
| 버튼 클릭 | 스플래시 오브 클릭 | Splash Step |
| 버튼 클릭 | 내 콕콕 현황 | Splash Step |
| 버튼 클릭 | 한 번 더 콕콕 | Done Step |
| 버튼 클릭 | 나도 콕콕하러 가기 | /reveal |
| 버튼 클릭 | 공유 버튼 | 공통 |
| 버튼 클릭 | 피드백 버튼 | 공통 |
| 페이지 진입 | reveal 페이지 로드 | /reveal?t= |
| 결과 확인 | 매칭 확인 | Done Step + /reveal |

---

## 2. GTM 개요

### GTM이란?

Google Tag Manager(GTM)는 웹사이트 소스코드를 직접 수정하지 않고, 각종 마케팅/분석 태그를 중앙에서 관리하는 태그 관리 시스템이다.

```
웹사이트 → GTM 컨테이너 스크립트 → GTM이 GA4 등 태그 로드/실행
```

**장점:**
- 개발자 배포 없이 마케터가 직접 태그 추가/수정 가능
- 여러 분석 도구(GA4, Meta Pixel, 카카오 픽셀 등)를 한 곳에서 관리
- 태그 발화 조건(트리거)을 세밀하게 제어 가능
- 버전 관리, 롤백 기능 내장

---

### GTM ↔ GA4 관계

```
[사용자 브라우저]
      │
      ▼
[GTM 컨테이너 스크립트]  ← 웹사이트에 단 한 번만 삽입
      │
      ├─ [GA4 태그]      ← GTM이 관리; GA4 Measurement ID 사용
      ├─ [Meta Pixel]   ← (선택적, 향후 추가 가능)
      └─ [기타 태그]
              │
              ▼
      [Google Analytics 4 대시보드]
```

- **GTM**: 태그를 관리하는 컨테이너. 웹사이트에는 GTM 스크립트만 삽입.
- **GA4**: 실제 데이터를 수집하고 리포팅하는 분석 도구. GTM의 GA4 태그를 통해 데이터가 전송됨.
- `dataLayer`: 브라우저 전역 배열. 우리 코드 → dataLayer → GTM이 감지 → GA4로 전송.

---

### Next.js App Router에서의 동작 방식

Next.js App Router는 서버 컴포넌트와 클라이언트 컴포넌트가 혼합된다. GTM 스크립트는 반드시 **클라이언트 측**에서 로드되어야 한다.

**주의사항:**
- App Router는 페이지 전환 시 전체 페이지를 리로드하지 않는다 (SPA 방식).
- 특히 콕콕은 단일 페이지 멀티스텝이라 페이지 뷰 이벤트가 자동으로 발화하지 않는다.
- 각 스텝 전환마다 `page_view` 이벤트를 **수동으로** dataLayer에 푸시해야 한다.

---

## 3. GA4 이벤트 설계 초안

### 이벤트 명명 규칙

```
[동사]_[명사]  또는  [화면명]_[액션]

예:
  verification_sent   → 인증번호 발송 성공
  kokkok_submitted    → 콕콕 제출 완료
  reveal_page_viewed  → reveal 페이지 조회
```

---

### 3-1. 인증 관련 이벤트

| 이벤트명 | 트리거 시점 | 파라미터 |
|---------|------------|---------|
| `verification_send_clicked` | "시작하기" 버튼 클릭 | `phone_valid: boolean` |
| `verification_sent` | SMS 발송 API 성공 | - |
| `verification_send_failed` | SMS 발송 API 실패 | `error_code: string` |
| `verification_code_submitted` | "확인" 버튼 클릭 | - |
| `verification_code_verified` | 인증 성공 | - |
| `verification_code_failed` | 인증 실패 (틀린 코드) | - |
| `session_resumed` | 기존 세션으로 자동 로그인 | `session_age_days: number` |

---

### 3-2. 스플래시 화면 이벤트

| 이벤트명 | 트리거 시점 | 파라미터 |
|---------|------------|---------|
| `splash_viewed` | Splash Step 진입 | - |
| `splash_orb_clicked` | 오브(발광 구체) 클릭 | - |
| `splash_admin_clicked` | "내 콕콕 현황" 버튼 클릭 | - |
| `stats_banner_viewed` | 통계 배너 표시 | `total_kokkoks: number`, `total_couples: number` |

---

### 3-3. 콕콕 전송 이벤트 (핵심 전환)

| 이벤트명 | 트리거 시점 | 파라미터 |
|---------|------------|---------|
| `target_step_viewed` | Target Step 진입 | - |
| `hint_entered` | 힌트 입력창에 텍스트 입력 | `hint_length: number` |
| `kokkok_submit_clicked` | "콕! 💗" 버튼 클릭 | `has_hint: boolean` |
| `kokkok_submitted` | 제출 API 성공 | `matched: boolean`, `has_hint: boolean` |
| `kokkok_submit_failed` | 제출 API 실패 | `error_code: string` |
| `kokkok_self_attempt` | 자기 번호로 전송 시도 | - |

> `kokkok_submitted`는 가장 중요한 전환 이벤트. GA4에서 **Key Event(구 전환)** 로 설정.

---

### 3-4. 완료 화면 이벤트

| 이벤트명 | 트리거 시점 | 파라미터 |
|---------|------------|---------|
| `done_step_viewed` | Done Step 진입 | `matched: boolean` |
| `done_send_again_clicked` | "한 번 더 콕콕 💗" 클릭 | - |

---

### 3-5. 수신자 Reveal 이벤트

| 이벤트명 | 트리거 시점 | 파라미터 |
|---------|------------|---------|
| `reveal_page_viewed` | /reveal 페이지 진입 | `has_token: boolean` |
| `reveal_data_loaded` | API 응답 수신 | `matched: boolean`, `has_hint: boolean` |
| `reveal_matched_viewed` | 매칭 정보 화면 표시 | `has_hint: boolean` |
| `reveal_unmatched_viewed` | 미매칭 화면 표시 | `has_hint: boolean` |
| `reveal_cta_clicked` | "나도 콕콕하러 가기" 클릭 | `from_matched: boolean` |
| `reveal_api_failed` | get-reveal API 실패 | `error_code: string` |

---

### 3-6. 어드민(내 콕콕 현황) 이벤트

| 이벤트명 | 트리거 시점 | 파라미터 |
|---------|------------|---------|
| `admin_step_viewed` | Admin Step 진입 | - |
| `admin_data_loaded` | 현황 데이터 로드 완료 | `received_count: number`, `sent_count: number` |
| `admin_tab_switched` | 탭 전환 (받은/보낸) | `tab: 'received' \| 'sent'` |
| `admin_logout_clicked` | 로그아웃 클릭 | - |

---

### 3-7. 공통 이벤트

| 이벤트명 | 트리거 시점 | 파라미터 |
|---------|------------|---------|
| `share_clicked` | 공유 버튼 클릭 | `method: 'native' \| 'clipboard'` |
| `feedback_clicked` | 기능제안 버튼 클릭 | - |
| `back_clicked` | 뒤로가기 버튼 클릭 | `from_step: string` |

---

### 3-8. 퍼널 구성 (GA4 탐색 분석용)

```
[퍼널: 발신자 전환 퍼널]
  1. verification_sent          → 인증번호 발송 (퍼널 진입)
  2. verification_code_verified → 인증 성공
  3. target_step_viewed         → 콕콕 작성 시작
  4. kokkok_submitted           → 콕콕 전송 완료 (핵심 전환)

[퍼널: 수신자 전환 퍼널]
  1. reveal_page_viewed         → 링크 클릭 (SMS에서 진입)
  2. reveal_data_loaded         → 데이터 로드
  3. reveal_cta_clicked         → 홈으로 이동 (역-콕콕 의향)
```

---

## 4. GTM 컨테이너 설정 가이드

### Step 1: GTM 계정 및 컨테이너 생성

1. [tagmanager.google.com](https://tagmanager.google.com) 접속
2. **계정 만들기** 클릭
   - 계정 이름: `콕콕` 또는 팀/회사명
   - 국가: 대한민국
3. **컨테이너 만들기**
   - 컨테이너 이름: `kokkok-production`
   - 대상 플랫폼: **웹**
4. GTM 코드 스니펫 확인
   - 컨테이너 ID 형태: `GTM-XXXXXXX`
   - `<head>` 용 스크립트 + `<body>` 용 `<noscript>` 태그 획득

---

### Step 2: GA4 속성 생성 (Google Analytics)

1. [analytics.google.com](https://analytics.google.com) 접속
2. **관리** → **속성 만들기**
   - 속성 이름: `콕콕`
   - 보고 시간대: 대한민국
   - 통화: 대한민국 원(KRW)
3. **비즈니스 정보** 입력 → **데이터 스트림 만들기**
   - 플랫폼: **웹**
   - 웹사이트 URL: `https://kokkok-nu.vercel.app`
   - 스트림 이름: `kokkok-web`
4. **측정 ID** 확인: `G-XXXXXXXXXX` 형태

---

### Step 3: GTM에서 GA4 태그 생성

#### 3-1. GA4 구성 태그 (기본 태그)

GTM 컨테이너 → **태그** → **새로 만들기**

```
태그 이름: GA4 - Configuration
태그 유형: Google 애널리틱스 GA4 구성
측정 ID: G-XXXXXXXXXX  ← GA4에서 복사한 값
트리거: All Pages (모든 페이지)
```

#### 3-2. GA4 이벤트 태그 (각 커스텀 이벤트용)

이벤트마다 개별 태그를 만들거나, **하나의 공통 이벤트 태그**로 통합할 수 있다.

**권장: 공통 이벤트 태그 방식**

```
태그 이름: GA4 - Custom Event
태그 유형: Google 애널리틱스 GA4 이벤트
구성 태그: GA4 - Configuration
이벤트 이름: {{DLV - event_name}}  ← 데이터 영역 변수
이벤트 파라미터:
  - matched      → {{DLV - matched}}
  - has_hint     → {{DLV - has_hint}}
  - error_code   → {{DLV - error_code}}
  - (필요한 파라미터 추가)
트리거: Custom Event - All (아래에서 만들 트리거)
```

---

### Step 4: GTM 변수 생성 (데이터 영역 변수)

**변수** 탭 → **새로 만들기** → 유형: **데이터 영역 변수**

| 변수 이름 | 데이터 영역 키 | 설명 |
|----------|--------------|------|
| `DLV - event_name` | `event_name` | 이벤트명 |
| `DLV - matched` | `matched` | 매칭 여부 |
| `DLV - has_hint` | `has_hint` | 힌트 존재 여부 |
| `DLV - error_code` | `error_code` | 에러 코드 |
| `DLV - hint_length` | `hint_length` | 힌트 길이 |
| `DLV - from_step` | `from_step` | 이전 스텝 |
| `DLV - tab` | `tab` | 어드민 탭 |
| `DLV - method` | `method` | 공유 방법 |

---

### Step 5: GTM 트리거 생성

**트리거** 탭 → **새로 만들기** → 유형: **맞춤 이벤트**

```
트리거 이름: Custom Event - All
이벤트 이름: .+   (정규식으로 모든 이벤트 매칭)
정규식 사용: 체크
이 트리거 발생 위치: 모든 맞춤 이벤트
```

> 필요에 따라 이벤트별로 개별 트리거를 만들 수도 있다 (예: `kokkok_submitted`만 발화).

---

### Step 6: GA4 Key Event 설정

GA4 대시보드 → **관리** → **이벤트** → 다음 이벤트를 **Key Event**로 표시:

- `kokkok_submitted` ← 가장 중요한 핵심 전환
- `verification_code_verified` ← 회원가입 완료 등가

---

### Step 7: GTM 게시

**제출** 버튼 → 버전 이름 입력 → **게시**

---

## 5. Next.js App Router + GTM 통합 방법

### 5-1. GTM / GA4 스크립트 삽입 (layout.tsx) ✅ 완료

`<head>` 안에 `dangerouslySetInnerHTML`로 직접 삽입하는 방식을 사용한다. `next/script`의 `afterInteractive` 방식은 GA4 태그 감지 도구에서 인식이 되지 않아 인라인 방식으로 변경하였다.

```tsx
// src/app/layout.tsx (실제 구현)
export default function RootLayout({ children }: { children: React.ReactNode }) {
  const GA_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID

  return (
    <html lang="ko">
      <head>
        {/* 1. GTM 스니펫 — head 최상단 */}
        <script dangerouslySetInnerHTML={{ __html: `(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','GTM-5J9S297S');` }} />

        {/* 2. GA4 gtag.js */}
        {GA_ID && (
          <>
            <script async src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`} />
            <script dangerouslySetInnerHTML={{ __html: `
              window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}
              gtag('js', new Date());
              gtag('config', '${GA_ID}', { send_page_view: false });
            ` }} />
          </>
        )}
      </head>
      <body>
        {/* 3. GTM noscript — body 첫 번째 자식 */}
        <noscript>
          <iframe src="https://www.googletagmanager.com/ns.html?id=GTM-5J9S297S"
            height="0" width="0" style={{ display: 'none', visibility: 'hidden' }} />
        </noscript>
        {children}
      </body>
    </html>
  )
}
```

> `send_page_view: false` — GA4 자동 pageview를 비활성화. SPA step 전환 시 `src/lib/ga.ts`의 `pageview()`로 수동 발송.

---

### 5-2. 환경변수 설정 ✅ 완료

`.env.local`:
```env
VERCEL_TOKEN=...
NEXT_PUBLIC_GA_MEASUREMENT_ID=G-E0ZBMXEESR
```

Vercel 환경변수 등록 완료 (`vercel env add NEXT_PUBLIC_GA_MEASUREMENT_ID production`).
GTM ID는 빌드 타임 치환 없이 스크립트에 하드코딩되어 있으므로 환경변수 불필요.

---

### 5-3. GA4 유틸리티 함수 ✅ 완료

`src/lib/ga.ts` (실제 구현):

```ts
declare global {
  interface Window {
    gtag: (
      command: 'config' | 'event' | 'js' | 'set',
      targetId: string | Date,
      params?: Record<string, unknown>
    ) => void
    dataLayer: Record<string, unknown>[]
  }
}

const GA_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID

function isClient(): boolean {
  return typeof window !== 'undefined' && typeof window.gtag === 'function'
}

// GA4 가상 페이지뷰
export function pageview(url: string): void {
  if (!isClient() || !GA_ID) return
  window.gtag('config', GA_ID, { page_path: url })
}

// GA4 커스텀 이벤트
export function event(action: string, params?: Record<string, unknown>): void {
  if (!isClient() || !GA_ID) return
  window.gtag('event', action, params)
}

// GTM dataLayer screen_view 이벤트
export function trackScreen(screenName: string, screenPath: string): void {
  if (typeof window === 'undefined') return
  window.dataLayer = window.dataLayer || []
  window.dataLayer.push({
    event: 'screen_view',
    screen_name: screenName,
    screen_path: screenPath,
  })
}
```

**사용 패턴 — step 전환 시 (`src/app/page.tsx`)**:

```tsx
useEffect(() => {
  if (!mounted) return
  pageview(STEP_PAGE[step])      // GA4 가상 pageview
  trackScreen(step, STEP_PAGE[step])  // GTM dataLayer screen_view
}, [step, mounted])
```

---

### 5-4. 각 스텝에서 이벤트 발송 패턴

#### Login Step — 인증번호 발송

```tsx
// app/page.tsx 또는 components/LoginStep.tsx (클라이언트 컴포넌트)
'use client'

import { trackEvent } from '@/lib/analytics'

async function handleSendCode() {
  trackEvent('verification_send_clicked', {
    phone_valid: isValidPhone(phone),
  })

  try {
    await sendVerificationCode(phone)
    trackEvent('verification_sent')
  } catch (error) {
    trackEvent('verification_send_failed', {
      error_code: error instanceof Error ? error.message : 'unknown',
    })
  }
}

async function handleVerify() {
  try {
    const result = await verifyCode(phone, code)
    if (result.verified) {
      trackEvent('verification_code_verified')
      // 스텝 전환
      setStep('splash')
      trackPageView('/splash', '스플래시')
    } else {
      trackEvent('verification_code_failed')
    }
  } catch {
    trackEvent('verification_code_failed')
  }
}
```

#### Splash Step — 오브 클릭

```tsx
// components/SplashStep.tsx
'use client'

import { trackEvent, trackPageView } from '@/lib/analytics'

function handleOrbClick() {
  trackEvent('splash_orb_clicked')
  setStep('target')
  trackPageView('/target', '콕콕 보내기')
}

function handleAdminClick() {
  trackEvent('splash_admin_clicked')
  setStep('admin')
  trackPageView('/admin', '내 콕콕 현황')
}
```

#### Target Step — 콕콕 전송

```tsx
// components/TargetStep.tsx
'use client'

import { trackEvent, trackPageView } from '@/lib/analytics'

// 스텝 진입 시 (useEffect)
useEffect(() => {
  trackPageView('/target', '콕콕 보내기')
}, [])

// 힌트 입력 시 (디바운스 적용 권장)
function handleHintChange(value: string) {
  setHint(value)
  // 입력 완료 후 한 번만 기록 (blur 이벤트 권장)
}

function handleHintBlur() {
  if (hint.length > 0) {
    trackEvent('hint_entered', { hint_length: hint.length })
  }
}

// 전송 버튼 클릭
async function handleSubmit() {
  if (targetPhone === myPhone) {
    trackEvent('kokkok_self_attempt')
    return
  }

  trackEvent('kokkok_submit_clicked', { has_hint: hint.length > 0 })

  try {
    const result = await submitKokkok({
      targetPhone,
      hint,
      senderName,
      senderPhone,
      token,
    })

    trackEvent('kokkok_submitted', {
      matched: result.matched,
      has_hint: hint.length > 0,
    })

    setMatched(result.matched)
    setStep('done')
    trackPageView('/done', '전송 완료')
  } catch (error) {
    trackEvent('kokkok_submit_failed', {
      error_code: error instanceof Error ? error.message : 'unknown',
    })
  }
}
```

#### Done Step

```tsx
// components/DoneStep.tsx
'use client'

import { useEffect } from 'react'
import { trackEvent } from '@/lib/analytics'

export function DoneStep({ matched }: { matched: boolean }) {
  useEffect(() => {
    trackEvent('done_step_viewed', { matched })
  }, [matched])

  function handleSendAgain() {
    trackEvent('done_send_again_clicked')
    setStep('target')
  }

  // ...
}
```

#### Reveal 페이지 (/reveal)

```tsx
// app/reveal/page.tsx
'use client'

import { useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { trackEvent } from '@/lib/analytics'

export default function RevealPage() {
  const searchParams = useSearchParams()
  const token = searchParams.get('t')

  useEffect(() => {
    trackEvent('reveal_page_viewed', { has_token: !!token })
  }, [token])

  useEffect(() => {
    if (!token) return

    getReveal(token)
      .then((data) => {
        trackEvent('reveal_data_loaded', {
          matched: data.matched,
          has_hint: !!data.hint_text,
        })
      })
      .catch((error) => {
        trackEvent('reveal_api_failed', {
          error_code: error instanceof Error ? error.message : 'unknown',
        })
      })
  }, [token])

  // ...
}
```

---

### 5-5. 세션 복원 시 이벤트

```tsx
// app/page.tsx — 초기 로드 시 세션 확인
useEffect(() => {
  const session = loadSession()
  if (session) {
    const ageDays = Math.floor(
      (Date.now() - session.createdAt) / (1000 * 60 * 60 * 24)
    )
    trackEvent('session_resumed', { session_age_days: ageDays })
    setStep('splash')
  }
}, [])
```

---

### 5-6. 공유 버튼 이벤트

```tsx
// components/ShareButton.tsx
import { trackEvent } from '@/lib/analytics'

async function handleShare() {
  if (navigator.share) {
    trackEvent('share_clicked', { method: 'native' })
    await navigator.share({ url: '...' })
  } else {
    trackEvent('share_clicked', { method: 'clipboard' })
    await navigator.clipboard.writeText('...')
  }
}
```

---

### 5-7. GTM Preview 모드로 디버깅

개발 중에는 GTM의 **미리보기 모드**를 사용해 이벤트가 올바르게 발화되는지 확인한다:

1. GTM 대시보드 → **미리보기** 클릭
2. 사이트 URL 입력 → 연결
3. 브라우저에서 사이트를 조작하면 GTM 디버거에 이벤트 실시간 표시
4. `dataLayer` 탭에서 커스텀 이벤트 파라미터 확인

로컬에서 `window.dataLayer` 직접 확인:
```js
// 브라우저 콘솔에서
window.dataLayer
// → [{event: 'gtm.js', ...}, {event: 'kokkok_submitted', matched: false, ...}]
```

---

## 6. 작업 체크리스트

### Phase 1: 기본 세팅

- [x] GA4 속성 생성 → Measurement ID `G-E0ZBMXEESR` 획득
- [x] GTM 계정 + 컨테이너 생성 → Container ID `GTM-5J9S297S` 획득
- [x] `.env.local`에 `NEXT_PUBLIC_GA_MEASUREMENT_ID` 추가
- [x] Vercel 환경변수에 `NEXT_PUBLIC_GA_MEASUREMENT_ID` 등록
- [x] `layout.tsx`에 GTM 스니펫 + GA4 gtag.js 삽입 (`<head>` 인라인 방식)
- [x] `layout.tsx` `<body>` 직후 GTM noscript 추가
- [x] `src/lib/ga.ts` 파일 생성 (`pageview`, `event`, `trackScreen`)

### Phase 2: 이벤트 구현

- [x] step 전환 시 GA4 `pageview()` 호출 (`page.tsx` useEffect)
- [x] step 전환 시 GTM `screen_view` dataLayer push (`trackScreen`)
- [x] `/reveal` 진입 시 `pageview` + `trackScreen` 호출
- [ ] **[최우선]** `kokkok_submitted` 이벤트 구현 (Target Step)
- [ ] **[최우선]** `verification_code_verified` 이벤트 구현 (Login Step)
- [ ] `reveal_page_viewed` + `reveal_data_loaded` 이벤트 구현
- [ ] `splash_orb_clicked` 이벤트 구현
- [ ] `done_step_viewed` 이벤트 구현
- [ ] 나머지 이벤트 순차 구현 (Section 3 이벤트 목록 참고)

### Phase 3: GTM 대시보드 설정

- [ ] GTM 데이터 영역 변수 생성 (Section 4 Step 4 참고)
- [ ] GA4 구성 태그 생성 (All Pages 트리거)
- [ ] `screen_view` 이벤트 태그 생성 (`screen_name`, `screen_path` 파라미터 포함)
- [ ] 공통 커스텀 이벤트 태그 생성
- [ ] GTM 미리보기 모드로 `screen_view` 이벤트 동작 검증
- [ ] GTM 게시(Publish) → 프로덕션 적용

### Phase 4: GA4 대시보드 설정

- [ ] `kokkok_submitted` → Key Event 설정
- [ ] `verification_code_verified` → Key Event 설정
- [ ] GA4 탐색 분석 → 발신자 전환 퍼널 생성
- [ ] GA4 탐색 분석 → 수신자 전환 퍼널 생성
- [ ] 실시간 보고서에서 데이터 수집 확인

### Phase 5: 검증

- [ ] GA4 DebugView에서 `screen_view` 이벤트 파라미터 확인
- [ ] GTM 미리보기 모드에서 전체 step 플로우 테스트
- [ ] 브라우저 콘솔에서 `window.dataLayer` 직접 확인
  ```js
  window.dataLayer
  // → [{event:'gtm.js',...}, {event:'screen_view', screen_name:'login', screen_path:'/'}, ...]
  ```
- [ ] 프로덕션 배포 후 24~48시간 모니터링

---

### 이벤트 구현 우선순위 요약

```
🔴 최우선 (비즈니스 핵심)
  kokkok_submitted          → 서비스 핵심 전환
  verification_code_verified → 사용자 인증 완료

🟠 높음 (퍼널 분석)
  verification_sent          → 퍼널 진입점
  target_step_viewed         → 콕콕 작성 시작
  reveal_page_viewed         → SMS 링크 클릭률 추적
  reveal_data_loaded         → matched 비율 확인

🟡 중간 (UX 인사이트)
  splash_orb_clicked
  done_step_viewed
  done_send_again_clicked
  reveal_cta_clicked

🟢 낮음 (세부 분석)
  hint_entered
  share_clicked
  admin_step_viewed
  feedback_clicked
```
