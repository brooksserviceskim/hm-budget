#!/bin/bash
cd "$(dirname "$0")"
bash ./deploy.sh "$@"
echo
read -r -p "엔터를 누르면 창이 닫힙니다..." _
