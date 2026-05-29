#!/bin/bash
# 編集モード時に呼ぶ。team.id → states のマップを返す軽量クエリ。
# 出力: JSON

set -u
DIR="$(cd "$(dirname "$0")" && pwd)"

TOKEN=$(bash "$DIR/token.sh" 2>/dev/null)
if [ -z "${TOKEN:-}" ]; then
  echo '{"error":"NO_TOKEN"}'
  exit 0
fi

read -r -d '' QUERY <<'GRAPHQL'
query {
  viewer {
    teamMemberships {
      nodes {
        team {
          id
          states(first: 30) {
            nodes { id name color type position }
          }
        }
      }
    }
  }
}
GRAPHQL

COMPACT=$(printf '%s' "$QUERY" | tr '\n' ' ')
ESCAPED=$(printf '%s' "$COMPACT" | sed 's/"/\\"/g')
BODY="{\"query\":\"$ESCAPED\"}"

curl -sS --max-time 10 https://api.linear.app/graphql \
  -H "Authorization: $TOKEN" \
  -H "Content-Type: application/json" \
  --data "$BODY" 2>/dev/null || echo '{"error":"NETWORK"}'
