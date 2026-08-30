#!/bin/bash
# ============================================================
#  현우 미란 가계부 — 깃허브 배포 스크립트
#  터미널에서:  ./deploy.sh  또는  ./deploy.sh "수정 내용"
#  파인더에서:  배포.command 더블클릭
# ============================================================

cd "$(dirname "$0")" || exit 1
ROOT="$(pwd)"
CFG="$ROOT/.deploy.conf"

BOLD=$'\033[1m'; DIM=$'\033[2m'; GRN=$'\033[32m'; YLW=$'\033[33m'; RED=$'\033[31m'; OFF=$'\033[0m'
say()  { echo "${BOLD}▶ $*${OFF}"; }
ok()   { echo "${GRN}✔ $*${OFF}"; }
warn() { echo "${YLW}! $*${OFF}"; }
die()  { echo "${RED}✕ $*${OFF}"; echo; read -r -p "엔터를 누르면 닫힙니다..." _; exit 1; }

echo
echo "${BOLD}━━━ 현우 미란 가계부 배포 ━━━${OFF}"
echo "${DIM}$ROOT${OFF}"
echo

# ---------- 0. git 확인 ----------
command -v git >/dev/null 2>&1 || die "git 이 설치되어 있지 않습니다.  터미널에서  xcode-select --install  을 먼저 실행하세요."

# ---------- 1. 설정 (최초 1회) ----------
[ -f "$CFG" ] && . "$CFG"

if [ -z "$GH_USER" ]; then
  echo "처음 한 번만 물어봅니다."
  read -r -p "  깃허브 사용자명 (예: brookskim) : " GH_USER
  [ -z "$GH_USER" ] && die "사용자명이 비었습니다."
  read -r -p "  저장소 이름 [hm-budget] : " GH_REPO
  GH_REPO="${GH_REPO:-hm-budget}"
  printf 'GH_USER=%s\nGH_REPO=%s\n' "$GH_USER" "$GH_REPO" > "$CFG"
  ok "저장했습니다 → $GH_USER/$GH_REPO  (바꾸려면 .deploy.conf 삭제)"
  echo
fi
REMOTE="https://github.com/$GH_USER/$GH_REPO.git"
PAGES="https://$GH_USER.github.io/$GH_REPO/"

# ---------- 2. 저장소 준비 ----------
if [ ! -d .git ]; then
  say "깃 저장소를 새로 만듭니다"
  git init -q
  git symbolic-ref HEAD refs/heads/main
fi

[ -f .gitignore ] || cat > .gitignore <<'EOF'
.DS_Store
node_modules/
*.zip
.deploy.conf
EOF

git config user.name  >/dev/null 2>&1 || git config user.name  "$GH_USER"
git config user.email >/dev/null 2>&1 || git config user.email "$GH_USER@users.noreply.github.com"

if git remote get-url origin >/dev/null 2>&1; then
  CUR="$(git remote get-url origin)"
  [ "$CUR" != "$REMOTE" ] && { git remote set-url origin "$REMOTE"; warn "원격 주소를 $REMOTE 로 바꿨습니다"; }
else
  git remote add origin "$REMOTE"
fi

# ---------- 3. 원격 저장소 존재 확인 ----------
say "깃허브 저장소를 확인합니다"
if ! git ls-remote "$REMOTE" >/dev/null 2>&1; then
  warn "$GH_USER/$GH_REPO 에 접근할 수 없습니다."
  if command -v gh >/dev/null 2>&1 && gh auth status >/dev/null 2>&1; then
    read -r -p "  gh 로 저장소를 새로 만들까요? (y/N) " a
    [ "$a" = "y" ] || [ "$a" = "Y" ] || die "중단했습니다."
    gh repo create "$GH_USER/$GH_REPO" --public --source=. --remote=origin || die "저장소 생성 실패"
    ok "저장소를 만들었습니다"
  else
    echo
    echo "  아래 중 하나를 먼저 하세요."
    echo "   1) 저장소가 없다면 → https://github.com/new 에서 ${BOLD}$GH_REPO${OFF} 를 Public 으로 생성"
    echo "   2) 로그인이 안 됐다면 → ${BOLD}brew install gh && gh auth login${OFF}"
    echo "      (gh 가 브라우저로 로그인시켜 주고, 비밀번호를 터미널에 칠 일이 없습니다)"
    echo
    die "준비 후 다시 실행해 주세요."
  fi
fi
ok "확인됨 — $GH_USER/$GH_REPO"

# ---------- 3-b. 자가검사 ----------
if [ -f tools/smoke.js ] && command -v node >/dev/null 2>&1 && [ -d node_modules/jsdom ]; then
  say "화면 자가검사"
  if node tools/smoke.js; then ok "전 화면 정상"; else
    warn "검사에서 문제가 발견됐습니다."
    read -r -p "  그래도 배포할까요? (y/N) " a
    [ "$a" = "y" ] || [ "$a" = "Y" ] || die "중단했습니다."
  fi
fi

# ---------- 4. 커밋 ----------
git add -A
if git diff --cached --quiet 2>/dev/null && git rev-parse HEAD >/dev/null 2>&1; then
  warn "바뀐 파일이 없습니다. 그래도 푸시는 시도합니다."
else
  MSG="${1:-업데이트 $(date '+%Y-%m-%d %H:%M')}"
  git commit -q -m "$MSG" || die "커밋할 내용이 없습니다."
  ok "커밋 — $MSG"
  git --no-pager diff --stat HEAD~1 HEAD 2>/dev/null | tail -12
fi

# ---------- 5. 푸시 ----------
echo
say "깃허브로 올립니다"
git branch -M main

set -o pipefail
git push -u origin main 2>&1 | tee /tmp/hm_push.log
PUSH_RC=${PIPESTATUS[0]}
set +o pipefail

if [ "$PUSH_RC" -ne 0 ]; then
  if grep -qiE 'rejected|non-fast-forward|fetch first' /tmp/hm_push.log; then
    echo
    warn "깃허브에 이미 다른 내용이 있어 거절됐습니다."
    echo "  (예전에 웹으로 직접 올린 파일들입니다.)"
    echo "  이 폴더 내용으로 ${BOLD}덮어쓰기${OFF} 하시겠습니까?"
    read -r -p "  덮어쓰려면 yes 를 입력하세요 : " a
    [ "$a" = "yes" ] || die "중단했습니다. 원격 내용을 살리려면  git pull --rebase origin main  을 먼저 실행하세요."
    git push -u --force origin main || die "푸시 실패"
  else
    die "푸시에 실패했습니다. 위 메시지를 확인해 주세요."
  fi
fi

echo
ok "완료"
echo
echo "  사이트   ${BOLD}$PAGES${OFF}"
echo "  저장소   https://github.com/$GH_USER/$GH_REPO"
echo
echo "${DIM}  * 첫 배포라면 저장소 Settings → Pages → Source 를"
echo "    'Deploy from a branch / main / (root)' 로 한 번 설정해 주세요."
echo "  * 반영까지 1~2분 걸립니다. 화면이 그대로면 새로고침 하세요.${OFF}"
echo
