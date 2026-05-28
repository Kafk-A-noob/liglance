#!/bin/bash
# Keychain から Linear Personal API Key を取り出すだけのスクリプト。
#
# なぜ別ファイルに分けているか:
#   - 将来 Infisical に移行するとき、このファイルだけ差し替えれば済むようにするため。
#   - index.jsx の command 行を短く保ち、可読性を上げるため。
#
# 使い方:
#   bash lib/token.sh
#
# 出力:
#   標準出力にトークン文字列1行のみ（改行なし）。失敗時は終了コード非0。

set -euo pipefail

# -s : サービス名（add-generic-password で登録したときの -s と同じ）
# -w : パスワード（=トークン本体）だけを表示するオプション
security find-generic-password -s "linear-widget-token" -w
