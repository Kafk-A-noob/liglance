#!/bin/bash
# Issue のステータスを変更する mutation スクリプト。
# 使い方: ISSUE_ID=xxx STATE_ID=yyy bash update-state.sh
#
# 防御的:
#   - ISSUE_ID / STATE_ID は UUID 想定。英数字+ハイフンのみ許可
#   - 万一 GraphQL injection を防ぐ
#
# 出力: JSON

set -u
DIR="$(cd "$(dirname "$0")" && pwd)"

if [ -z "${ISSUE_ID:-}" ] || [ -z "${STATE_ID:-}" ]; then
  echo '{"error":"MISSING_ARGS"}'
  exit 1
fi

# UUID 形式バリデーション（英数字とハイフンのみ）
if ! [[ "$ISSUE_ID" =~ ^[a-zA-Z0-9-]+$ ]]; then
  echo '{"error":"INVALID_ISSUE_ID"}'
  exit 1
fi
if ! [[ "$STATE_ID" =~ ^[a-zA-Z0-9-]+$ ]]; then
  echo '{"error":"INVALID_STATE_ID"}'
  exit 1
fi

TOKEN=$(bash "$DIR/token.sh" 2>/dev/null)
if [ -z "${TOKEN:-}" ]; then
  echo '{"error":"NO_TOKEN"}'
  exit 0
fi

# mutation を組み立て
QUERY="mutation { issueUpdate(id: \"$ISSUE_ID\", input: { stateId: \"$STATE_ID\" }) { success issue { id state { id name } } } }"
ESCAPED=$(printf '%s' "$QUERY" | sed 's/"/\\"/g')
BODY="{\"query\":\"$ESCAPED\"}"

curl -sS --max-time 10 https://api.linear.app/graphql \
  -H "Authorization: $TOKEN" \
  -H "Content-Type: application/json" \
  --data "$BODY" 2>/dev/null || echo '{"error":"NETWORK"}'
