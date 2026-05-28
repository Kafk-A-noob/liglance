#!/bin/bash
# Linear API を叩いて JSON を標準出力に返すだけのスクリプト。
#
# なぜスクリプト化したか:
#   index.jsx の `command` テンプレート文字列内に GraphQL クエリを
#   インライン展開すると、JSX / JS / シェル の3層エスケープが必要になって
#   非常に壊れやすい。スクリプトに分離すれば各層の心配がなくなる。
#
# 失敗時も必ず JSON を返す（widget 側の JSON.parse が落ちないように）。

set -u  # 未定義変数だけ厳しく。-e は使わない（フォールバックを自分で書くため）

# このスクリプトと同じディレクトリ
DIR="$(cd "$(dirname "$0")" && pwd)"

# 1. Keychain からトークン取得
TOKEN=$(bash "$DIR/token.sh" 2>/dev/null)
if [ -z "${TOKEN:-}" ]; then
  echo '{"error":"NO_TOKEN"}'
  exit 0
fi

# 2. GraphQL クエリ（ヒアドキュメントなのでエスケープ不要）
read -r -d '' QUERY <<'GRAPHQL'
query {
  viewer {
    id
    name
    assignedIssues(filter: { state: { type: { neq: "completed" } } }, first: 30, orderBy: updatedAt) {
      nodes {
        identifier title url updatedAt
        state { name color type }
        project { name }
        team { key }
      }
    }
    teamMemberships {
      nodes {
        team {
          id key name
          issues(filter: { state: { type: { neq: "completed" } } }, first: 30, orderBy: updatedAt) {
            nodes {
              identifier title url updatedAt
              state { name color type }
              project { name }
              assignee { displayName }
            }
          }
        }
      }
    }
  }
}
GRAPHQL

# 3. JSON ボディを安全に組み立て（jq が無くても動くように printf で）
#    クエリ内の改行を \n に、ダブルクォートを \" に置換
ESCAPED=$(printf '%s' "$QUERY" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))')
BODY="{\"query\":$ESCAPED}"

# 4. curl 実行。失敗時もエラーJSONを返す
RESPONSE=$(curl -sS --max-time 10 https://api.linear.app/graphql \
  -H "Authorization: $TOKEN" \
  -H "Content-Type: application/json" \
  --data "$BODY" 2>/dev/null)

if [ -z "$RESPONSE" ]; then
  echo '{"error":"NETWORK"}'
  exit 0
fi

echo "$RESPONSE"
