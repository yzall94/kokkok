# kokkok 저장소 소유자 설정 가이드

> **대상**: GitHub 저장소 소유자 (yzall94)
> **목적**: 개발-배포 파이프라인 완성을 위한 GitHub & Vercel 설정
> **예상 소요 시간**: 약 15~20분

---

## 현재 상태

코드 쪽 설정은 이미 완료되어 main 브랜치에 push되어 있습니다:
- Next.js 프로젝트 초기화 완료
- GitHub Actions CI 워크플로우 (lint, type-check, build)
- PR 템플릿
- 개발 워크플로우 가이드 문서

**아래 4가지 작업을 순서대로 진행해주세요.**

---

## 작업 1: 기본 브랜치 변경 (master → main)

현재 `master`와 `main` 브랜치가 둘 다 존재합니다. `main`을 기본 브랜치로 변경해야 합니다.

### 순서

1. GitHub에서 `yzall94/kokkok` 저장소로 이동
2. 상단 **Settings** 탭 클릭
3. 왼쪽 메뉴에서 **General** (기본 선택되어 있음)
4. 아래로 스크롤하여 **Default branch** 섹션 찾기
5. 현재 `master`로 되어 있는 브랜치 이름 옆의 **화살표(⇄) 버튼** 클릭
6. `main`을 선택하고 **Update** 클릭
7. 확인 팝업에서 **I understand, update the default branch** 클릭

### 기본 브랜치 변경 후: master 브랜치 삭제

1. 저장소 메인 페이지로 이동
2. 브랜치 드롭다운 클릭 → **View all branches** 클릭
3. `master` 브랜치의 오른쪽 **휴지통 아이콘** 클릭하여 삭제

---

## 작업 2: Vercel 연동 (자동 배포 설정)

Vercel을 연결하면 PR마다 미리보기 URL이 생성되고, main에 머지하면 자동으로 프로덕션 배포됩니다.

### 순서

1. [vercel.com](https://vercel.com) 접속
2. **Sign Up** → **Continue with GitHub** → `yzall94` 계정으로 로그인
3. 대시보드에서 **Add New...** → **Project** 클릭
4. **Import Git Repository** 에서 `yzall94/kokkok` 선택
   - 저장소가 안 보이면 **Adjust GitHub App Permissions** 클릭하여 권한 추가
5. 설정 화면:
   - **Framework Preset**: `Next.js` (자동 감지됨, 확인만)
   - **Root Directory**: `.` (기본값 그대로)
   - 나머지 설정은 기본값 유지
6. **Deploy** 클릭
7. 첫 배포가 완료되면 프로덕션 URL이 생성됨 (예: `kokkok-xxx.vercel.app`)

### 확인 방법

- 배포 완료 후 제공된 URL에 접속하여 Next.js 기본 페이지가 보이면 성공
- 이후부터 PR 생성 시 Vercel이 자동으로 Preview URL을 PR 코멘트에 추가함

---

## 작업 3: 브랜치 보호 규칙 설정

main 브랜치에 직접 push를 막고, 반드시 PR + CI 통과 + 코드 리뷰를 거치도록 설정합니다.

> **중요**: 이 설정은 작업 1, 2가 완료된 후, 그리고 테스트 PR (#1)에서 CI가 통과된 것을 확인한 후에 적용하세요.

### 순서

1. GitHub에서 `yzall94/kokkok` 저장소 → **Settings** 탭
2. 왼쪽 메뉴에서 **Rules** → **Rulesets** 클릭
3. **New ruleset** → **New branch ruleset** 클릭
4. 아래와 같이 설정:

| 항목 | 설정값 |
|---|---|
| **Ruleset name** | `main 보호` |
| **Enforcement status** | `Active` |
| **Target branches** | Add target → Include by pattern → `main` 입력 |

5. **Rules** 섹션에서 아래 항목을 체크:

| 규칙 | 설정 | 설명 |
|---|---|---|
| **Restrict deletions** | 체크 | main 브랜치 삭제 방지 |
| **Require a pull request before merging** | 체크 | 직접 push 차단 |
| ↳ Required approvals | `1` | 최소 1명 리뷰 승인 필요 |
| **Require status checks to pass** | 체크 | CI 통과 필수 |
| ↳ Add checks | `Lint, Type Check & Build` 검색하여 추가 | CI job 이름 |
| ↳ Require branches to be up to date before merging | 체크 | 최신 main 반영 필수 |
| **Block force pushes** | 체크 | force push 방지 |

> **참고**: "Require status checks"에서 CI check를 검색할 때, 테스트 PR (#1)에서 CI가 한 번 이상 실행되어야 검색 목록에 나타납니다. CI가 아직 안 돌았다면 PR #1 페이지에서 CI 완료를 기다린 후 이 설정을 하세요.

6. **Create** 클릭하여 저장

---

## 작업 4: Merge 방식 설정 (Squash Merge만 허용)

여러 커밋이 하나로 합쳐져서 main 히스토리가 깔끔하게 유지됩니다.

### 순서

1. GitHub에서 `yzall94/kokkok` 저장소 → **Settings** 탭
2. 왼쪽 메뉴 **General**
3. 아래로 스크롤하여 **Pull Requests** 섹션 찾기
4. 아래와 같이 설정:

| 옵션 | 상태 |
|---|---|
| Allow merge commits | **체크 해제** |
| Allow squash merging | **체크** ✅ |
| Allow rebase merging | **체크 해제** |

5. 페이지 하단의 변경사항이 자동 저장됨 (별도 저장 버튼 없음)

---

## 모든 설정 완료 후 확인 방법

1. **테스트 PR 확인**: PR #1 (https://github.com/yzall94/kokkok/pull/1) 에서:
   - GitHub Actions CI가 통과(초록색 체크)되었는지 확인
   - Vercel Preview URL이 코멘트로 달렸는지 확인
   - Preview URL에 접속하여 페이지가 뜨는지 확인
2. **보호 규칙 확인**: main에 직접 push 시도하면 차단되어야 함
3. **PR 머지 테스트**: PR #1을 "Squash and merge"로 머지 → Vercel 프로덕션 자동 배포 확인

---

## 작업 순서 체크리스트

- [ ] 작업 1: 기본 브랜치를 main으로 변경하고 master 삭제
- [ ] 작업 2: Vercel 가입 및 프로젝트 연결
- [ ] 작업 3: 브랜치 보호 규칙 설정 (CI 통과 확인 후)
- [ ] 작업 4: Squash merge만 허용
- [ ] 최종 확인: PR #1에서 CI + Preview URL + 머지 테스트
