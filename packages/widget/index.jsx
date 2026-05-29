// =====================================================================
// LiGlance — Linear の Issue をデスクトップにチラ見するウィジェット
// =====================================================================
//
// 機能:
//   - Mine / Team / Project の 3 タブ（Project はドロップダウンで選択）
//   - 接続ステータスドット（緑=正常 / 黄=古い / 赤=エラー）
//   - 最終更新時刻表示
//   - 手動リロードボタン（🔄）
//
// 設計メモ:
//   - initialState / updateState を使う state machine パターン
//   - command の自動実行結果は updateState の 'UB/COMMAND_RAN' で受け取る
//   - 手動リロードは `import { run } from "uebersicht"` でコマンドを直接実行
//     し、結果を 'MANUAL_RESULT' イベントとして dispatch する
// =====================================================================

import { run } from "uebersicht";

// Übersicht の cwd は widgets フォルダ。symlink 名 (liglance.widget) を経由する
const FETCH_CMD = "bash liglance.widget/lib/fetch.sh 2>/dev/null || bash lib/fetch.sh 2>/dev/null";

export const command = FETCH_CMD;
export const refreshFrequency = 60_000; // 1 分

// --- 位置（ドラッグで移動） ---------------------------------------------
//
// localStorage に座標を保存し、起動時に復元する。
// className の top / left は CSS 変数を参照し、JS から書き換える。
//
// 注: 旧名 "linear-glance.pos" のままにしてある（既に設定済みの位置が消えないように）
const POS_KEY = "linear-glance.pos";
/** @type {{top:number,left:number} | null} */
let currentPos = null;

function loadPos() {
  try {
    const s = localStorage.getItem(POS_KEY);
    if (s) return JSON.parse(s);
  } catch {}
  // デフォルト: 右上
  const left = (window.innerWidth || 1280) - 380 - 24;
  return { left, top: 80 };
}
function savePos(p) {
  try { localStorage.setItem(POS_KEY, JSON.stringify(p)); } catch {}
}
function applyPos(p) {
  document.documentElement.style.setProperty("--lg-left", p.left + "px");
  document.documentElement.style.setProperty("--lg-top", p.top + "px");
}
function ensurePosInitialized() {
  if (currentPos == null) {
    currentPos = loadPos();
    applyPos(currentPos);
  }
}
function startDrag(e) {
  // ボタンや select の上でのクリックはドラッグ開始しない
  const tag = e.target?.tagName;
  if (tag === "BUTTON" || tag === "SELECT" || tag === "OPTION") return;
  if (e.target?.closest && e.target.closest("button, select")) return;

  e.preventDefault();
  ensurePosInitialized();
  const start = { ...currentPos };
  const mouse = { x: e.clientX, y: e.clientY };
  const onMove = (ev) => {
    const np = {
      left: Math.max(0, start.left + (ev.clientX - mouse.x)),
      top: Math.max(0, start.top + (ev.clientY - mouse.y)),
    };
    currentPos = np;
    applyPos(np);
  };
  const onUp = () => {
    document.removeEventListener("mousemove", onMove);
    document.removeEventListener("mouseup", onUp);
    savePos(currentPos);
  };
  document.addEventListener("mousemove", onMove);
  document.addEventListener("mouseup", onUp);
}

// --- スタイル -----------------------------------------------------------
export const className = `
  top: var(--lg-top, 80px);
  left: var(--lg-left, calc(100vw - 404px));
  width: 380px;
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
  padding: 10px 12px;
  box-shadow: 0 8px 24px rgba(0,0,0,0.35);

  /* ヘッダー行（ドラッグハンドル） */
  header {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 8px;
    cursor: grab;
    user-select: none;
  }
  header:active { cursor: grabbing; }
  header button { cursor: pointer; } /* ボタン部分はポインタに戻す */
  header .brand { font-weight: 600; opacity: 0.85; }
  header .status-dot {
    width: 8px; height: 8px; border-radius: 50%;
    box-shadow: 0 0 6px currentColor;
  }
  header .last-updated { font-size: 10.5px; opacity: 0.55; }
  header .spacer { flex: 1; }
  header .icon-btn {
    background: none; border: none; cursor: pointer; color: #fff;
    font-size: 13px; padding: 2px 4px; opacity: 0.7;
  }
  header .icon-btn:hover { opacity: 1; }
  header .icon-btn.spinning { animation: spin 0.8s linear infinite; opacity: 1; }
  @keyframes spin {
    from { transform: rotate(0deg); }
    to   { transform: rotate(360deg); }
  }

  /* タブ行 */
  .tabs {
    display: flex;
    gap: 4px;
    margin-bottom: 8px;
    border-bottom: 1px solid rgba(255,255,255,0.08);
    padding-bottom: 6px;
  }
  .tabs button {
    background: rgba(255,255,255,0.06);
    border: 1px solid rgba(255,255,255,0.1);
    color: #fff;
    border-radius: 6px;
    padding: 3px 10px;
    font-size: 11px;
    cursor: pointer;
    font-family: inherit;
  }
  .tabs button.active {
    background: rgba(94, 106, 210, 0.55);
    border-color: rgba(94, 106, 210, 0.9);
  }
  /* 状態フィルタ行 */
  .filter-row {
    display: flex;
    gap: 4px;
    margin-bottom: 8px;
    flex-wrap: wrap;
  }
  .filter-chip {
    background: transparent;
    border: 1px dashed rgba(255,255,255,0.2);
    color: #fff;
    border-radius: 6px;
    padding: 2px 7px;
    font-size: 10px;
    cursor: pointer;
    font-family: inherit;
    opacity: 0.55;
  }
  .filter-chip.active {
    opacity: 1;
    background: rgba(80,200,120,0.25);
    border-color: rgba(80,200,120,0.7);
    border-style: solid;
  }

  /* プロジェクトセレクタ */
  .project-select {
    margin-bottom: 8px;
  }
  .project-select select {
    width: 100%;
    background: rgba(255,255,255,0.06);
    color: #fff;
    border: 1px solid rgba(255,255,255,0.12);
    border-radius: 6px;
    padding: 4px 8px;
    font-size: 11px;
    font-family: inherit;
  }

  /* Issue リスト */
  ul.issues {
    list-style: none; margin: 0; padding: 0;
    max-height: calc(80vh - 110px);
    overflow-y: auto;
  }
  ul.issues::-webkit-scrollbar { width: 0; }

  li.issue {
    display: grid;
    grid-template-columns: 8px 1fr;
    gap: 8px;
    padding: 7px 4px;
    border-bottom: 1px solid rgba(255,255,255,0.05);
  }
  li.issue:last-child { border-bottom: none; }
  .dot { width: 8px; height: 8px; border-radius: 50%; margin-top: 5px; }
  .dot.updating {
    background: #888;
    animation: pulse 0.8s ease-in-out infinite alternate;
  }
  @keyframes pulse { from { opacity: 0.3; } to { opacity: 1; } }

  .state-select-wrap {
    position: relative;
    display: inline-block;
    width: 8px;
    height: 8px;
    margin-top: 5px;
  }
  .state-select-wrap .dot {
    position: absolute;
    top: 0; left: 0;
    margin-top: 0;
    pointer-events: none;
    box-shadow: 0 0 0 2px rgba(255,255,255,0.4);
  }
  .state-select-wrap .state-select {
    position: absolute;
    top: -4px; left: -4px;
    width: 16px;
    height: 16px;
    opacity: 0;
    cursor: pointer;
  }
  header .icon-btn.edit-toggle.active {
    opacity: 1;
    background: rgba(94, 106, 210, 0.4);
    border-radius: 4px;
  }
  .row1 { display: flex; gap: 6px; align-items: baseline; }
  .row1 a {
    color: #fff; text-decoration: none; font-weight: 500; flex: 1;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .row1 a:hover { text-decoration: underline; }
  /* === 優先度バッジ === */
  .priority-urgent {
    display: inline-block;
    width: 14px;
    text-align: center;
    font-weight: 900;
    font-size: 13px;
    line-height: 1;
  }
  .priority-bars {
    display: inline-flex;
    align-items: flex-end;
    gap: 1.5px;
    width: 12px;
    height: 11px;
  }
  .priority-bars .bar {
    width: 3px;
    border-radius: 1px;
    background: currentColor;
    opacity: 0.2;
  }
  .priority-bars .bar.on { opacity: 1; }
  .priority-bars .bar-1 { height: 4px; }
  .priority-bars .bar-2 { height: 7px; }
  .priority-bars .bar-3 { height: 10px; }
  .ident { opacity: 0.55; font-size: 10.5px; font-family: ui-monospace, monospace; }
  .meta {
    opacity: 0.55; font-size: 10.5px; margin-top: 2px;
    display: flex; gap: 8px;
  }

  .empty, .error {
    text-align: center; padding: 24px 0; opacity: 0.65;
  }
  .error { color: #ff9c9c; }
`;

// --- state machine ------------------------------------------------------
/**
 * @typedef {{
 *   tab: 'mine' | 'team' | 'project',
 *   projectId: string | null,
 *   output: string | null,
 *   lastUpdated: number | null,  // 成功した最後の取得時刻 (Date.now())
 *   lastError: string | null,    // 直近のエラー文字列
 *   refreshing: boolean,
 * }} State
 */
// localStorage から永続化された設定を読み込む（起動時 1 回）
function loadBool(key, defaultValue) {
  try {
    const v = localStorage.getItem(key);
    if (v === "true") return true;
    if (v === "false") return false;
  } catch {}
  return defaultValue;
}

/** @type {State} */
export const initialState = {
  tab: "mine",
  projectId: null,
  output: null,
  lastUpdated: null,
  lastError: null,
  refreshing: false,
  // 状態フィルタ。Done/Canceled は noise なのでデフォルト OFF、
  // Backlog/InReview は通常作業なのでデフォルト ON
  showDone: loadBool("liglance.showDone", false),
  showCanceled: loadBool("liglance.showCanceled", false),
  showBacklog: loadBool("liglance.showBacklog", true),
  showInReview: loadBool("liglance.showInReview", true),
  // 編集モード: ON でステータス変更可。誤クリック防止のためデフォルト OFF
  editMode: loadBool("liglance.editMode", false),
  /** @type {Record<string, Array<{id:string,name:string,color:string,type:string,position?:number}>>} */
  statesByTeam: {},
  /** @type {string | null} */
  updatingIssueId: null,
};

/** 取得結果(string)を state に反映する共通処理 */
function applyOutput(prev, output, error) {
  if (error) {
    return { ...prev, refreshing: false, lastError: String(error) };
  }
  if (typeof output !== "string" || output === "") {
    return { ...prev, refreshing: false, lastError: "EMPTY_OUTPUT" };
  }
  // output が JSON エラーを含んでいないか軽くチェック
  try {
    const j = JSON.parse(output);
    if (j.error) {
      return { ...prev, refreshing: false, output, lastError: j.error };
    }
    if (j.errors) {
      return { ...prev, refreshing: false, output, lastError: j.errors[0]?.message || "API_ERROR" };
    }
    return {
      ...prev,
      refreshing: false,
      output,
      lastUpdated: Date.now(),
      lastError: null,
    };
  } catch (e) {
    return { ...prev, refreshing: false, output, lastError: "PARSE_ERROR" };
  }
}

/** @param {any} event @param {State} prev */
export const updateState = (event, prev) => {
  switch (event.type) {
    case "UB/COMMAND_RAN": // 自動更新の結果
      return applyOutput(prev, event.output, event.error);
    case "MANUAL_START":
      return { ...prev, refreshing: true };
    case "MANUAL_RESULT":
      return applyOutput(prev, event.output, event.error);
    case "SET_TAB":
      return { ...prev, tab: event.tab };
    case "SET_PROJECT":
      return { ...prev, projectId: event.projectId };
    case "SET_SHOW_DONE":
      try { localStorage.setItem("liglance.showDone", String(event.value)); } catch {}
      return { ...prev, showDone: event.value };
    case "SET_SHOW_CANCELED":
      try { localStorage.setItem("liglance.showCanceled", String(event.value)); } catch {}
      return { ...prev, showCanceled: event.value };
    case "SET_SHOW_BACKLOG":
      try { localStorage.setItem("liglance.showBacklog", String(event.value)); } catch {}
      return { ...prev, showBacklog: event.value };
    case "SET_SHOW_INREVIEW":
      try { localStorage.setItem("liglance.showInReview", String(event.value)); } catch {}
      return { ...prev, showInReview: event.value };
    case "SET_EDIT_MODE":
      try { localStorage.setItem("liglance.editMode", String(event.value)); } catch {}
      return { ...prev, editMode: event.value };
    case "STATES_FETCHED":
      return { ...prev, statesByTeam: event.statesByTeam };
    case "UPDATE_START":
      return { ...prev, updatingIssueId: event.issueId };
    case "UPDATE_END":
      return { ...prev, updatingIssueId: null };
    default:
      return prev;
  }
};

// --- render -------------------------------------------------------------
/** @param {State} state @param {(action:any)=>void} dispatch */
// 状態取得 fetch を 1 回だけ走らせるためのフラグ
let statesFetchInFlight = false;

function fetchStatesOnce(dispatch) {
  if (statesFetchInFlight) return;
  statesFetchInFlight = true;
  run("bash liglance.widget/lib/fetch-states.sh 2>/dev/null || bash lib/fetch-states.sh 2>/dev/null")
    .then((out) => {
      try {
        const d = JSON.parse(out);
        const map = {};
        for (const m of d?.data?.viewer?.teamMemberships?.nodes ?? []) {
          if (m.team?.id) map[m.team.id] = m.team.states?.nodes ?? [];
        }
        dispatch({ type: "STATES_FETCHED", statesByTeam: map });
      } catch {}
    })
    .finally(() => { statesFetchInFlight = false; });
}

function changeIssueState(dispatch, issueId, stateId) {
  if (!issueId || !stateId) return;
  dispatch({ type: "UPDATE_START", issueId });
  // env 変数経由でシェルに渡す（引数より安全）
  const cmd = `ISSUE_ID='${issueId.replace(/'/g, "")}' STATE_ID='${stateId.replace(/'/g, "")}' bash liglance.widget/lib/update-state.sh 2>/dev/null || ISSUE_ID='${issueId.replace(/'/g, "")}' STATE_ID='${stateId.replace(/'/g, "")}' bash lib/update-state.sh 2>/dev/null`;
  run(cmd)
    .then(() => {
      // メイン fetch を再実行して最新化
      return run(FETCH_CMD);
    })
    .then((out) => dispatch({ type: "MANUAL_RESULT", output: String(out) }))
    .catch((err) => dispatch({ type: "MANUAL_RESULT", error: err }))
    .finally(() => dispatch({ type: "UPDATE_END" }));
}

export const render = (state, dispatch) => {
  const { output, lastError, lastUpdated, refreshing, tab, projectId, showDone, showCanceled, showBacklog, showInReview, editMode, statesByTeam, updatingIssueId } = state;

  // 編集モード ON で states 未取得なら fetch
  if (editMode && Object.keys(statesByTeam).length === 0) {
    fetchStatesOnce(dispatch);
  }

  // データ未取得 → Loading
  if (!output && !lastError) {
    return (
      <div>
        {renderHeader(state, dispatch)}
        <div className="empty">Loading…</div>
      </div>
    );
  }

  // パース
  /** @type {any} */
  let data = null;
  try { data = output ? JSON.parse(output) : null; } catch { /* noop */ }

  const viewer = data?.data?.viewer;

  // ステータス重大エラー (NO_TOKEN, NETWORK)
  if (data?.error === "NO_TOKEN") {
    return (
      <div>
        {renderHeader(state, dispatch)}
        <div className="error">
          Keychain にトークンがありません。<br />
          README.md のセットアップ手順を実行してください。
        </div>
      </div>
    );
  }

  // プロジェクト一覧を集約（重複排除）
  const projects = collectProjects(viewer);

  // 現在のタブに応じて表示する Issue を決める
  const issues = pickIssues(viewer, tab, projectId, { showDone, showCanceled, showBacklog, showInReview });

  return (
    <div>
      {renderHeader(state, dispatch, { mineCount: viewer?.assignedIssues?.nodes?.length })}

      <div className="tabs">
        <TabButton active={tab === "mine"} onClick={() => dispatch({ type: "SET_TAB", tab: "mine" })}>
          Mine{viewer?.assignedIssues?.nodes ? ` (${viewer.assignedIssues.nodes.length})` : ""}
        </TabButton>
        <TabButton active={tab === "team"} onClick={() => dispatch({ type: "SET_TAB", tab: "team" })}>
          Team
        </TabButton>
        <TabButton active={tab === "project"} onClick={() => dispatch({ type: "SET_TAB", tab: "project" })}>
          Project
        </TabButton>
      </div>

      {/* 状態フィルタ: 4 つ並べる */}
      <div className="filter-row">
        <FilterChip active={showBacklog} onClick={() => dispatch({ type: "SET_SHOW_BACKLOG", value: !showBacklog })} title="Backlog を表示">
          📋 BL
        </FilterChip>
        <FilterChip active={showInReview} onClick={() => dispatch({ type: "SET_SHOW_INREVIEW", value: !showInReview })} title="In Review を表示">
          👁 Rev
        </FilterChip>
        <FilterChip active={showDone} onClick={() => dispatch({ type: "SET_SHOW_DONE", value: !showDone })} title="Done を表示">
          ✓ Done
        </FilterChip>
        <FilterChip active={showCanceled} onClick={() => dispatch({ type: "SET_SHOW_CANCELED", value: !showCanceled })} title="Canceled を表示">
          ✗ Canc.
        </FilterChip>
      </div>

      {tab === "project" && (
        <div className="project-select">
          <select
            value={projectId || ""}
            onChange={(e) => dispatch({ type: "SET_PROJECT", projectId: e.target.value || null })}
          >
            <option value="">— プロジェクトを選択 —</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
      )}

      {issues.length === 0 ? (
        <div className="empty">
          {tab === "project" && !projectId
            ? "上のセレクタからプロジェクトを選んでください"
            : tab === "mine"
              ? "👏 自分担当の未完了 Issue はありません"
              : "Issue がありません"}
        </div>
      ) : (
        <ul className="issues">
          {issues.map((issue) => {
            const teamId = issue.team?.id || "";
            const states = statesByTeam[teamId] || [];
            const isUpdating = updatingIssueId === issue.id;
            return (
            <li key={issue.identifier} className="issue">
              {editMode && states.length > 0 ? (
                <span className="state-select-wrap">
                  <span className="dot" style={{ background: issue.state?.color || "#888" }} />
                  <select
                    className="state-select"
                    value={issue.state?.id || ""}
                    onChange={(e) => changeIssueState(dispatch, issue.id, e.target.value)}
                    title={`ステータス変更 (現在: ${issue.state?.name || "—"})`}
                  >
                    {states
                      .slice()
                      .sort((a, b) => (a.position || 0) - (b.position || 0))
                      .map((s) => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                  </select>
                </span>
              ) : isUpdating ? (
                <span className="dot updating" title="更新中" />
              ) : (
                <span className="dot" style={{ background: issue.state?.color || "#888" }} />
              )}
              <div>
                <div className="row1">
                  <PriorityBadge priority={issue.priority} />
                  <span className="ident">{issue.identifier}</span>
                  <a href={safeUrl(issue.url)} target="_blank" rel="noreferrer">{issue.title}</a>
                </div>
                <div className="meta">
                  <span>{issue.state?.name}</span>
                  {issue.project?.name && <span>· {issue.project.name}</span>}
                  {(tab === "team" || tab === "project") && issue.assignee?.displayName && (
                    <span>· {issue.assignee.displayName}</span>
                  )}
                  <span>· {formatRelative(issue.updatedAt)}</span>
                </div>
              </div>
            </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

// --- ヘッダー描画（タイトル + ステータスドット + 時刻 + リロード） ---------
function renderHeader(state, dispatch) {
  const { lastUpdated, lastError, refreshing } = state;
  const statusColor = getStatusColor(lastUpdated, lastError);
  const statusTitle = lastError
    ? `エラー: ${lastError}`
    : lastUpdated
      ? `最終更新 ${formatTime(lastUpdated)}`
      : "未取得";

  const handleRefresh = () => {
    dispatch({ type: "MANUAL_START" });
    run(FETCH_CMD)
      .then((stdout) => dispatch({ type: "MANUAL_RESULT", output: String(stdout) }))
      .catch((err) => dispatch({ type: "MANUAL_RESULT", error: err }));
  };

  // 初回 render で位置を復元
  ensurePosInitialized();

  return (
    <header onMouseDown={startDrag}>
      <span className="brand">Linear</span>
      <span className="status-dot" style={{ background: statusColor, color: statusColor }} title={statusTitle} />
      <span className="last-updated">{lastUpdated ? formatTime(lastUpdated) : "—"}</span>
      <span className="spacer" />
      <button
        className={"icon-btn edit-toggle" + (state.editMode ? " active" : "")}
        onClick={() => dispatch({ type: "SET_EDIT_MODE", value: !state.editMode })}
        title={state.editMode ? "編集モード: ON" : "編集モード: OFF"}
      >
        {state.editMode ? "🔓" : "🔒"}
      </button>
      <button
        className={"icon-btn" + (refreshing ? " spinning" : "")}
        onClick={handleRefresh}
        title="リロード"
      >
        ↻
      </button>
    </header>
  );
}

// --- ヘルパー -----------------------------------------------------------
function getStatusColor(lastUpdated, lastError) {
  if (lastError) return "#ff6b6b"; // 赤
  if (!lastUpdated) return "#999";  // グレー（未取得）
  const age = Date.now() - lastUpdated;
  if (age > refreshFrequency * 2) return "#f4c542"; // 黄
  return "#4ade80"; // 緑
}

/**
 * プロジェクト一覧を Issue から集める。
 * GraphQL の複雑度制限を避けるため projects フィールドは取らず、
 * 「アクティブな Issue を持つプロジェクト」だけを表示する方針。
 * 実用上、Issue が無いプロジェクトは選んでも空なので問題なし。
 */
function collectProjects(viewer) {
  if (!viewer) return [];
  const map = new Map();
  // 自分のアサインから
  for (const i of viewer.assignedIssues?.nodes ?? []) {
    if (i.project && !map.has(i.project.id)) map.set(i.project.id, i.project);
  }
  // チームの Issue から
  for (const m of viewer.teamMemberships?.nodes ?? []) {
    for (const i of m.team?.issues?.nodes ?? []) {
      if (i.project && !map.has(i.project.id)) map.set(i.project.id, i.project);
    }
  }
  return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
}

/** priority(0-4) → rank (0=なし は最後尾) */
function priorityRank(p) { return p === 0 ? 99 : p; }
/** 優先度（Urgent→Low→None）→ updatedAt の降順 */
function sortByPriorityThenUpdated(a, b) {
  const d = priorityRank(a.priority) - priorityRank(b.priority);
  if (d !== 0) return d;
  return a.updatedAt < b.updatedAt ? 1 : -1;
}

/**
 * 状態フィルタ。
 *  - Done(completed) / Canceled / Backlog は state.type で判定
 *  - In Review は state.name に "review" を含むかで判定（type=started の一部のため）
 */
function filterByState(issues, opts) {
  const { showDone, showCanceled, showBacklog, showInReview } = opts;
  return issues.filter((i) => {
    const t = i.state?.type;
    const name = (i.state?.name || "").toLowerCase();
    if (t === "completed" && !showDone) return false;
    if (t === "canceled" && !showCanceled) return false;
    if (t === "backlog" && !showBacklog) return false;
    if (!showInReview && name.includes("review")) return false;
    return true;
  });
}

function pickIssues(viewer, tab, projectId, filterOpts) {
  if (!viewer) return [];
  if (tab === "mine") {
    return filterByState(viewer.assignedIssues?.nodes ?? [], filterOpts)
      .slice()
      .sort(sortByPriorityThenUpdated);
  }
  const seen = new Set();
  const all = [];
  for (const m of viewer.teamMemberships?.nodes ?? []) {
    for (const i of m.team?.issues?.nodes ?? []) {
      if (seen.has(i.identifier)) continue;
      seen.add(i.identifier);
      all.push(i);
    }
  }
  const filtered = filterByState(all, filterOpts);
  if (tab === "project") {
    if (!projectId) return [];
    return filtered.filter((i) => i.project?.id === projectId).sort(sortByPriorityThenUpdated);
  }
  return filtered.sort(sortByPriorityThenUpdated);
}

function FilterChip({ active, onClick, title, children }) {
  return (
    <button className={"filter-chip" + (active ? " active" : "")} onClick={onClick} title={title}>
      {children}
    </button>
  );
}

function TabButton({ active, onClick, children }) {
  return (
    <button className={active ? "active" : ""} onClick={onClick}>
      {children}
    </button>
  );
}

/** ISO日時 → "3h ago" 形式 */
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

/**
 * 外部 URL を href に渡す前に検証。javascript: 等を弾く。
 * 万一 Linear のレスポンスに悪意ある URL が混入してもブラウザ内 JS 実行を防ぐ。
 */
function safeUrl(u) {
  if (!u || typeof u !== "string") return "#";
  return /^https?:\/\//i.test(u) ? u : "#";
}

/**
 * Linear の priority(0-4) → 表示用メタ
 * Urgent は "!" 表示、それ以外は信号強度的なバー（filled=点灯本数）
 */
function priorityMeta(priority) {
  switch (priority) {
    case 1: return { color: "#ef4444", label: "Urgent", kind: "urgent", filled: 0 };
    case 2: return { color: "#f97316", label: "High",   kind: "bars",   filled: 3 };
    case 3: return { color: "#eab308", label: "Medium", kind: "bars",   filled: 2 };
    case 4: return { color: "#06b6d4", label: "Low",    kind: "bars",   filled: 1 };
    default: return null;
  }
}

/** 優先度バッジを描画 (Übersicht widget) */
function PriorityBadge({ priority }) {
  const m = priorityMeta(priority);
  if (!m) return null;
  if (m.kind === "urgent") {
    return <span className="priority-urgent" style={{ color: m.color }} title={m.label}>!</span>;
  }
  return (
    <span className="priority-bars" style={{ color: m.color }} title={m.label}>
      <span className={"bar bar-1" + (m.filled >= 1 ? " on" : "")} />
      <span className={"bar bar-2" + (m.filled >= 2 ? " on" : "")} />
      <span className={"bar bar-3" + (m.filled >= 3 ? " on" : "")} />
    </span>
  );
}

/** timestamp(ms) → "MM/DD HH:mm" 形式で常に日付付き */
function formatTime(ms) {
  const d = new Date(ms);
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  return `${mo}/${da} ${h}:${m}`;
}
