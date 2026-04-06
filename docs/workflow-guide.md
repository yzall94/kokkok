# 개발 워크플로우 가이드

## 일상 작업 흐름

```bash
# 1. 최신 main에서 새 브랜치 생성
git checkout main && git pull origin main
git checkout -b feature/기능명

# 2. 작업 중 커밋
git add .
git commit -m "feat: 로그인 폼 UI 추가"

# 3. 원격에 push → GitHub에서 PR 생성
git push origin feature/기능명

# 4. CI 통과 + 리뷰 후 → GitHub 웹에서 Merge

# 5. 로컬 정리
git checkout main && git pull origin main
git branch -d feature/기능명
```

## 브랜치 네이밍

```
feature/간단한-설명   (새 기능)
fix/간단한-설명       (버그 수정)
docs/간단한-설명      (문서)
chore/간단한-설명     (설정/유지보수)
```

## 커밋 메시지 컨벤션

```
feat: 새 기능          fix: 버그 수정
docs: 문서 변경        style: 코드 스타일
refactor: 리팩토링     chore: 설정/빌드
```

## 충돌 해결

```bash
git checkout main && git pull origin main
git checkout feature/내-브랜치
git merge main
# 충돌 해결 후:
git add . && git commit -m "merge: 충돌 해결"
git push origin feature/내-브랜치
```
