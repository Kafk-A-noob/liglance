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
    assignedIssues( first: 50, orderBy: updatedAt) {
      nodes {
        id identifier title url updatedAt
        priority priorityLabel
        state { id name color type }
        project { id name }
        team { id key }
      }
    }
    teamMemberships {
      nodes {
        team {
          id key name
          issues( first: 30, orderBy: updatedAt) {
            nodes {
              id identifier title url updatedAt
              priority priorityLabel
              state { id name color type }
              project { id name color }
              assignee { displayName }
              team { id }
            }
          }
        }
      }
    }
  }
}
GRAPHQL

# 3. クエリをファイルに書き出し、curl の --data-urlencode で送る
#    （python3 / jq に依存しない＝Übersicht の最小 PATH でも動く）
TMP=$(mktemp -t liglance.XXXXXX)
trap 'rm -f "$TMP"' EXIT
# 改行を空白に圧縮してから JSON 文字列として渡す
COMPACT=$(printf '%s' "$QUERY" | tr '\n' ' ')

# 4. curl 実行。--data-urlencode を使えばシェルエスケープ不要
#    ただし GraphQL は JSON ボディ必須なので、自前でエスケープ：
#      " → \"  だけやれば充分（クエリ中にバックスラッシュは無いことが前提）
ESCAPED=$(printf '%s' "$COMPACT" | sed 's/"/\\"/g')
BODY="{\"query\":\"$ESCAPED\"}"

RESPONSE=$(curl -sS --max-time 10 https://api.linear.app/graphql \
  -H "Authorization: $TOKEN" \
  -H "Content-Type: application/json" \
  --data "$BODY" 2>/dev/null)

if [ -z "$RESPONSE" ]; then
  echo '{"error":"NETWORK"}'
  exit 0
fi

echo "$RESPONSE"
