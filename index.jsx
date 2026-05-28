// =====================================================================
// linear-glance — Linear の Issue をデスクトップにチラ見するウィジェット
// =====================================================================
//
// 【このファイルの読み方】
// Übersicht のウィジェットは "export した値の集まり" として書く。
//   - command           : シェルコマンド。標準出力が render に渡る
//   - refreshFrequency  : 自動再実行の間隔（ms）
//   - render            : command の出力を受け取って JSX を返す関数
//   - className         : ウィジェットの位置とサイズ（CSS）
//   - initialState      : ローカル状態の初期値（タブ切替などに使う）
//   - updateState       : 上記 state を更新するレデューサ
//
// React のフックは Übersicht 側で使えないため、Redux 風の
// (state, action) => state という形でローカル状態を管理する。
// "クラスコンポーネントの state" に近い API と思えばよい。
//
// 【勉強用メモ】
// - TS にしていないのは Übersicht が .jsx 前提だから。型は JSDoc で軽く補う。
// - GraphQL は1回叩いて Mine / Team 両方のデータを取得 → クライアント側で
//   タブ切替時に再フェッチしないようにしている（=APIに優しく、表示も速い）。
// =====================================================================

// --- 1. データ取得コマンド ----------------------------------------------
//
// なぜシェル経由か:
//   Übersicht の `command` は外部プロセス実行で、Node 環境ではない。
//   fetch などのブラウザ API は render 側からは使えるが、ここでは
//   curl で済ませる方がシンプルで、Keychain アクセスとも相性が良い。
//
// 流れ:
//   1) Keychain からトークンを取り出す (lib/token.sh)
//   2) curl で Linear GraphQL API を叩く
//   3) 標準出力に JSON をそのまま流す（render 側で JSON.parse）
//
// `__dirname` 相当が使えないので、Übersicht の作業ディレクトリ＝
// ウィジェットフォルダ起点でパスを書く。
// -----------------------------------------------------------------------
// 全部 lib/fetch.sh に丸投げ。Übersicht の cwd は widgets フォルダなので
// `linear-glance.widget/lib/...` でアクセスする。
// （手動デバッグ時は widget フォルダ直下で `bash lib/fetch.sh` でも動くようフォールバック）
export const command = "bash linear-glance.widget/lib/fetch.sh 2>/dev/null || bash lib/fetch.sh 2>/dev/null";

// 1分ごとに自動更新（ms 単位）
export const refreshFrequency = 60_000;

// --- 2. ウィジェットの見た目（CSS） -------------------------------------
//
// 画面右上に配置する。`position: absolute` は Übersicht 側で付くので
// `top` / `right` だけ指定すれば OK。
// -----------------------------------------------------------------------
export const className = `
  top: 80px;
  right: 24px;
  width: 360px;
  max-height: 80vh;
  overflow: hidden;
  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif;
  font-size: 12px;
  color: #fff;
  text-shadow: 0 1px 2px rgba(0,0,0,0.6);
  background: rgba(20, 20, 24, 0.65);
  backdrop-filter: blur(20px) saturate(150%);
  -webkit-backdrop-filter: blur(20px) saturate(150%);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 12px;
  padding: 12px 14px;
  box-shadow: 0 8px 24px rgba(0,0,0,0.35);

  header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 10px;
    font-weight: 600;
    letter-spacing: 0.02em;
  }
  header .title { flex: 1; opacity: 0.85; }
  header button {
    background: rgba(255,255,255,0.08);
    border: 1px solid rgba(255,255,255,0.12);
    color: #fff;
    border-radius: 6px;
    padding: 3px 9px;
    font-size: 11px;
    cursor: pointer;
    font-family: inherit;
  }
  header button.active {
    background: rgba(94, 106, 210, 0.55); /* Linear っぽい紫 */
    border-color: rgba(94, 106, 210, 0.9);
  }

  ul.issues {
    list-style: none;
    margin: 0;
    padding: 0;
    max-height: calc(80vh - 60px);
    overflow-y: auto;
  }
  ul.issues::-webkit-scrollbar { width: 0; } /* スクロールバー非表示 */

  li.issue {
    display: grid;
    grid-template-columns: 8px 1fr;
    gap: 8px;
    padding: 7px 4px;
    border-bottom: 1px solid rgba(255,255,255,0.05);
  }
  li.issue:last-child { border-bottom: none; }

  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    margin-top: 5px;
  }
  .row1 {
    display: flex;
    gap: 6px;
    align-items: baseline;
  }
  .row1 a {
    color: #fff;
    text-decoration: none;
    font-weight: 500;
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .row1 a:hover { text-decoration: underline; }
  .ident { opacity: 0.55; font-size: 10.5px; font-family: ui-monospace, monospace; }
  .meta {
    opacity: 0.55;
    font-size: 10.5px;
    margin-top: 2px;
    display: flex;
    gap: 8px;
  }

  .empty, .error {
    text-align: center;
    padding: 24px 0;
    opacity: 0.6;
  }
  .error { color: #ff9c9c; }
`;

// --- 3. ローカル状態（タブ切替） ----------------------------------------
//
// Übersicht の state は (state, action) => state という形で更新する。
// React の useReducer に近い。
// -----------------------------------------------------------------------
/** @typedef {{ tab: 'mine' | 'team' }} State */
/** @type {State} */
export const initialState = { tab: "mine" };

/** @param {{type:string, tab?:'mine'|'team'}} action @param {State} prev */
export const updateState = (action, prev) => {
  switch (action.type) {
    case "SET_TAB":
      return { ...prev, tab: action.tab ?? "mine" };
    default:
      return prev;
  }
};

// --- 4. render ----------------------------------------------------------
//
// output は string（command の標準出力）。
// state は上の initialState / updateState で管理されている。
// dispatch を呼ぶと updateState が走り、render が再実行される。
// -----------------------------------------------------------------------
/**
 * @param {{output: string, error?: any}} args
 * @param {State} state
 * @param {(action: any) => void} dispatch
 */
export const render = (props, state, dispatch) => {
  // Übersicht は初回 render 時 output が undefined のことがある（コマンド実行前）。
  // また command が非0終了したときも output が来ない場合があるので防御的に扱う。
  const output = props?.output;
  const error = props?.error;

  if (error) return <div className="error">Übersicht error: {String(error)}</div>;
  if (output == null || output === "") {
    return <div className="empty">Loading…</div>;
  }

  /** @type {any} */
  let data;
  try {
    data = JSON.parse(output);
  } catch (e) {
    const preview = String(output).slice(0, 200);
    return <div className="error">JSON parse failed:<br />{preview}</div>;
  }

  if (data.error === "NO_TOKEN") {
    return (
      <div className="error">
        Keychain にトークンがありません。<br />
        README.md のセットアップ手順を実行してください。
      </div>
    );
  }
  if (data.error === "NETWORK") {
    return <div className="error">Linear に接続できませんでした（ネットワーク？）</div>;
  }
  if (data.errors) {
    return <div className="error">Linear API error: {data.errors[0]?.message}</div>;
  }

  const viewer = data?.data?.viewer;
  if (!viewer) return <div className="error">viewer が取得できませんでした</div>;

  // 表示する Issue 配列をタブに応じて決める
  /** @type {any[]} */
  let issues = [];
  if (state.tab === "mine") {
    issues = viewer.assignedIssues?.nodes ?? [];
  } else {
    // 全チームの issues を平らに結合（重複は identifier で除く）
    const seen = new Set();
    for (const m of viewer.teamMemberships?.nodes ?? []) {
      for (const i of m.team?.issues?.nodes ?? []) {
        if (seen.has(i.identifier)) continue;
        seen.add(i.identifier);
        issues.push(i);
      }
    }
    // 更新日時の降順に並べ直す
    issues.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  }

  return (
    <div>
      <header>
        <span className="title">Linear</span>
        <button
          className={state.tab === "mine" ? "active" : ""}
          onClick={() => dispatch({ type: "SET_TAB", tab: "mine" })}
        >
          Mine ({viewer.assignedIssues?.nodes?.length ?? 0})
        </button>
        <button
          className={state.tab === "team" ? "active" : ""}
          onClick={() => dispatch({ type: "SET_TAB", tab: "team" })}
        >
          Team
        </button>
      </header>

      {issues.length === 0 ? (
        <div className="empty">
          {state.tab === "mine" ? "👏 自分担当の未完了 Issue はありません" : "Issue がありません"}
        </div>
      ) : (
        <ul className="issues">
          {issues.map((issue) => (
            <li key={issue.identifier} className="issue">
              <span className="dot" style={{ background: issue.state?.color || "#888" }} />
              <div>
                <div className="row1">
                  <span className="ident">{issue.identifier}</span>
                  <a href={issue.url} target="_blank" rel="noreferrer">{issue.title}</a>
                </div>
                <div className="meta">
                  <span>{issue.state?.name}</span>
                  {issue.project?.name && <span>· {issue.project.name}</span>}
                  {state.tab === "team" && issue.assignee?.displayName && (
                    <span>· {issue.assignee.displayName}</span>
                  )}
                  <span>· {formatRelative(issue.updatedAt)}</span>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

// --- 5. ユーティリティ ---------------------------------------------------
/**
 * ISO日時を「3h ago」みたいな相対表記に変換。依存ライブラリを足したくないので自前。
 * @param {string} iso
 */
function formatRelative(iso) {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const diff = Math.floor((Date.now() - t) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 86400 * 30) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(iso).toLocaleDateString();
}
