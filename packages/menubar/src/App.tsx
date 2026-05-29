import { useCallback, useEffect, useMemo, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { tokenExists, saveToken, fetchLinear, fetchStates, openUrl, updateIssueState } from "./api";
import type { Issue, IssueState, LinearResponse, Project, Tab, Viewer } from "./types";
import { formatRelative, formatTime, priorityRank, redactSecrets, safeUrl } from "./utils";
import { PriorityBadge } from "./PriorityBadge";
import "./App.css";

const REFRESH_INTERVAL_MS = 60_000;

export default function App() {
  const [hasToken, setHasToken] = useState<boolean | null>(null);

  useEffect(() => {
    tokenExists().then(setHasToken);
  }, []);

  // トレイメニューの "Reset token" が押されたらウィザードに戻す
  useEffect(() => {
    const promise = listen("token-reset", () => setHasToken(false));
    return () => {
      promise.then((unlisten) => unlisten());
    };
  }, []);

  if (hasToken === null) {
    return <div className="root loading">起動中…</div>;
  }
  if (!hasToken) {
    return <TokenWizard onSaved={() => setHasToken(true)} />;
  }
  return <Dashboard />;
}

// =====================================================================
// 初回ウィザード — Personal API Key を Keychain に保存
// =====================================================================
function TokenWizard({ onSaved }: { onSaved: () => void }) {
  const [token, setToken] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token.startsWith("lin_api_")) {
      setError("Linear の Personal API Key は 'lin_api_' で始まります");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await saveToken(token.trim());
      onSaved();
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="root wizard">
      <h2>LiGlance へようこそ</h2>
      <p>
        最初に Linear の Personal API Key が必要です。<br />
        Linear → Settings → My Account → <b>Security &amp; access</b> →
        Personal API keys から発行できます。
      </p>
      <form onSubmit={submit}>
        <input
          type="password"
          placeholder="lin_api_..."
          value={token}
          onChange={(e) => setToken(e.target.value)}
          autoFocus
        />
        <button type="submit" disabled={saving || !token}>
          {saving ? "保存中…" : "保存して開始"}
        </button>
        {error && <div className="error-msg">{error}</div>}
      </form>
      <p className="hint">
        トークンは macOS Keychain に暗号化保存されます。
        Übersicht 版がインストール済みなら、そちらでも同じトークンを使えます。
      </p>
    </div>
  );
}

// =====================================================================
// メイン画面 — タブ + Issue 一覧
// =====================================================================
function Dashboard() {
  const [data, setData] = useState<LinearResponse | null>(null);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<Tab>("mine");
  const [projectId, setProjectId] = useState<string | null>(null);
  // 編集モード: 既定 OFF。誤クリックでステータスを変えないため
  const [editMode, setEditMode] = useState<boolean>(() => {
    try { return localStorage.getItem("liglance.editMode") === "true"; }
    catch { return false; }
  });
  // 完了・キャンセル表示の有無（永続化）
  const [showDone, setShowDone] = useState<boolean>(() => {
    try { return localStorage.getItem("liglance.showDone") === "true"; }
    catch { return false; }
  });
  const [showCanceled, setShowCanceled] = useState<boolean>(() => {
    try { return localStorage.getItem("liglance.showCanceled") === "true"; }
    catch { return false; }
  });
  // Backlog / In Review もデフォルト OFF（ユーザー選好に合わせて noise 寄り扱い）
  const [showBacklog, setShowBacklog] = useState<boolean>(() => {
    try { return localStorage.getItem("liglance.showBacklog") === "true"; }
    catch { return false; }
  });
  const [showInReview, setShowInReview] = useState<boolean>(() => {
    try { return localStorage.getItem("liglance.showInReview") === "true"; }
    catch { return false; }
  });
  // Duplicate は noise 寄りなのでデフォルト OFF
  const [showDuplicate, setShowDuplicate] = useState<boolean>(() => {
    try { return localStorage.getItem("liglance.showDuplicate") === "true"; }
    catch { return false; }
  });
  // ステータス変更中の issue id（更新中スピナー用）
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  // 別 fetch で取得した states マップ（編集モード ON 時のみ取得）
  const [statesByTeam, setStatesByTeam] = useState<Map<string, IssueState[]>>(
    new Map()
  );

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      // 「表示しない」もの = excludeTypes として API に送る (type ベース)
      const excludeTypes: string[] = [];
      if (!showDone) excludeTypes.push("completed");
      if (!showCanceled) excludeTypes.push("canceled");
      if (!showBacklog) excludeTypes.push("backlog");
      if (!showDuplicate) excludeTypes.push("duplicate");

      const res = await fetchLinear(excludeTypes);
      setData(res);
      if (res.errors) {
        setLastError(res.errors[0]?.message ?? "API_ERROR");
      } else {
        setLastError(null);
        setLastUpdated(Date.now());
      }
    } catch (err) {
      setLastError(String(err));
    } finally {
      setRefreshing(false);
    }
  }, [showDone, showCanceled, showBacklog, showDuplicate]);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, REFRESH_INTERVAL_MS);
    return () => clearInterval(id);
  }, [refresh]);

  // 編集モード ON のときだけ states を別 fetch（query 複雑度を抑えるため）
  useEffect(() => {
    if (!editMode) return;
    if (statesByTeam.size > 0) return; // 既に取得済みなら再取得不要
    fetchStates()
      .then((res) => {
        const map = new Map<string, IssueState[]>();
        for (const m of res.data?.viewer?.teamMemberships?.nodes ?? []) {
          if (m.team?.id) map.set(m.team.id, m.team.states.nodes);
        }
        setStatesByTeam(map);
      })
      .catch((err) => setLastError(String(err)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editMode]);

  const toggleShowDone = () => {
    setShowDone((v) => {
      const next = !v;
      try { localStorage.setItem("liglance.showDone", String(next)); } catch {}
      return next;
    });
  };
  const toggleShowCanceled = () => {
    setShowCanceled((v) => {
      const next = !v;
      try { localStorage.setItem("liglance.showCanceled", String(next)); } catch {}
      return next;
    });
  };
  const toggleShowBacklog = () => {
    setShowBacklog((v) => {
      const next = !v;
      try { localStorage.setItem("liglance.showBacklog", String(next)); } catch {}
      return next;
    });
  };
  const toggleShowInReview = () => {
    setShowInReview((v) => {
      const next = !v;
      try { localStorage.setItem("liglance.showInReview", String(next)); } catch {}
      return next;
    });
  };
  const toggleShowDuplicate = () => {
    setShowDuplicate((v) => {
      const next = !v;
      try { localStorage.setItem("liglance.showDuplicate", String(next)); } catch {}
      return next;
    });
  };

  const viewer: Viewer | null = data?.data?.viewer ?? null;
  const projects = useMemo(() => collectProjects(viewer), [viewer]);
  const issues = useMemo(
    () => {
      const list = pickIssues(viewer, tab, projectId);
      // In Review はクライアント側フィルタ（state.name に "review" 含む、case-insensitive）
      // type ベースでは "started" 全体になってしまい、In Progress も巻き込むため
      if (!showInReview) {
        return list.filter((i) => {
          const name = i.state?.name?.toLowerCase() ?? "";
          return !name.includes("review");
        });
      }
      return list;
    },
    [viewer, tab, projectId, showInReview]
  );
  const toggleEdit = () => {
    setEditMode((v) => {
      const next = !v;
      try { localStorage.setItem("liglance.editMode", String(next)); } catch {}
      return next;
    });
  };

  const handleChangeState = async (issue: Issue, stateId: string) => {
    if (!issue.id || !stateId || stateId === issue.state?.id) return;
    setUpdatingId(issue.id);
    try {
      await updateIssueState(issue.id, stateId);
      await refresh(); // 即座に最新化
    } catch (err) {
      setLastError(String(err));
    } finally {
      setUpdatingId(null);
    }
  };

  const statusColor = getStatusColor(lastUpdated, lastError);
  const statusTitle = lastError
    ? `エラー: ${redactSecrets(lastError)}`
    : lastUpdated
    ? `最終更新 ${formatTime(lastUpdated)}`
    : "未取得";

  return (
    <div className="root dashboard">
      <header>
        <span className="brand">Linear</span>
        <span
          className="status-dot"
          style={{ background: statusColor }}
          title={statusTitle}
        />
        <span className="last-updated">
          {lastUpdated ? formatTime(lastUpdated) : "—"}
        </span>
        <span className="spacer" />
        <button
          className={"icon-btn edit-toggle" + (editMode ? " active" : "")}
          onClick={toggleEdit}
          title={editMode ? "編集モード: ON（クリックで OFF）" : "編集モード: OFF（クリックで ON）"}
        >
          {editMode ? "🔓" : "🔒"}
        </button>
        <button
          className={"icon-btn" + (refreshing ? " spinning" : "")}
          onClick={refresh}
          title="リロード"
          disabled={refreshing}
        >
          ↻
        </button>
      </header>

      {/* Row 1: タブ select + (Project 選んだ時は) プロジェクトセレクタ */}
      <div className="controls-row">
        <select
          className="tab-select"
          value={tab}
          onChange={(e) => setTab(e.target.value as Tab)}
        >
          <option value="mine">
            Mine{viewer ? ` (${viewer.assignedIssues.nodes.length})` : ""}
          </option>
          <option value="team">Team</option>
          <option value="project">Project</option>
        </select>

        {tab === "project" && (
          <select
            className="project-select-inline"
            value={projectId ?? ""}
            onChange={(e) => setProjectId(e.target.value || null)}
          >
            <option value="">— プロジェクトを選択 —</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Row 2: 状態フィルタチップ（右寄せ） */}
      <div className="filter-row">
        <span className="controls-spacer" />
        <FilterChip active={showBacklog} onClick={toggleShowBacklog} title="Backlog を表示">⊟ BL</FilterChip>
        <FilterChip active={showInReview} onClick={toggleShowInReview} title="In Review を表示">⊙ Rev</FilterChip>
        <FilterChip active={showDone} onClick={toggleShowDone} title="Done を表示">✓ Done</FilterChip>
        <FilterChip active={showCanceled} onClick={toggleShowCanceled} title="Canceled を表示">⊘ Canc.</FilterChip>
        <FilterChip active={showDuplicate} onClick={toggleShowDuplicate} title="Duplicate を表示">⎘ Dup</FilterChip>
      </div>

      {lastError && !viewer ? (
        <div className="error" style={{ textAlign: "left", padding: "12px 4px", fontSize: 11, wordBreak: "break-all" }}>
          <b>エラー:</b><br />
          {redactSecrets(lastError)}
        </div>
      ) : (
        <IssueList
          tab={tab}
          projectId={projectId}
          issues={issues}
          editMode={editMode}
          statesByTeam={statesByTeam}
          updatingId={updatingId}
          onChangeState={handleChangeState}
        />
      )}
    </div>
  );
}

function IssueList({
  tab,
  projectId,
  issues,
  editMode,
  statesByTeam,
  updatingId,
  onChangeState,
}: {
  tab: Tab;
  projectId: string | null;
  issues: Issue[];
  editMode: boolean;
  statesByTeam: Map<string, IssueState[]>;
  updatingId: string | null;
  onChangeState: (issue: Issue, stateId: string) => void;
}) {
  if (issues.length === 0) {
    return (
      <div className="empty">
        {tab === "project" && !projectId
          ? "上のセレクタからプロジェクトを選んでください"
          : tab === "mine"
          ? "👏 自分担当の未完了 Issue はありません"
          : "Issue がありません"}
      </div>
    );
  }
  return (
    <ul className="issues">
      {issues.map((issue) => {
        const teamId = issue.team?.id ?? "";
        const states = statesByTeam.get(teamId) ?? [];
        const isUpdating = updatingId === issue.id;
        return (
        <li key={issue.identifier} className="issue">
          <StateControl
            issue={issue}
            states={states}
            editMode={editMode}
            updating={isUpdating}
            onChange={(sid) => onChangeState(issue, sid)}
          />
          <div>
            <div className="row1">
              <PriorityBadge priority={issue.priority} />
              <span className="ident">{issue.identifier}</span>
              <a
                href={safeUrl(issue.url)}
                onClick={(e) => {
                  // Tauri WebView 内で開かないよう preventDefault → Rust に渡す
                  e.preventDefault();
                  void openUrl(safeUrl(issue.url));
                }}
              >
                {issue.title}
              </a>
            </div>
            <div className="meta">
              <span>{issue.state?.name}</span>
              {issue.project?.name && <span>· {issue.project.name}</span>}
              {(tab === "team" || tab === "project") &&
                issue.assignee?.displayName && (
                  <span>· {issue.assignee.displayName}</span>
                )}
              <span>· {formatRelative(issue.updatedAt)}</span>
            </div>
          </div>
        </li>
        );
      })}
    </ul>
  );
}

/** ステータスドット or 編集モード時は select */
function StateControl({
  issue,
  states,
  editMode,
  updating,
  onChange,
}: {
  issue: Issue;
  states: IssueState[];
  editMode: boolean;
  updating: boolean;
  onChange: (stateId: string) => void;
}) {
  if (updating) {
    return <span className="dot updating" title="更新中" />;
  }
  if (!editMode || states.length === 0) {
    return (
      <span
        className="dot"
        style={{ background: issue.state?.color || "#888" }}
        title={issue.state?.name}
      />
    );
  }
  // 編集モード: 色付きドット + 透明な select を重ねる
  return (
    <span className="state-select-wrap">
      <span
        className="dot"
        style={{ background: issue.state?.color || "#888" }}
      />
      <select
        className="state-select"
        value={issue.state?.id ?? ""}
        onChange={(e) => onChange(e.target.value)}
        title={`ステータス変更 (現在: ${issue.state?.name ?? "—"})`}
      >
        {states
          .slice()
          .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
          .map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
      </select>
    </span>
  );
}

/** タブと違って "ON/OFF" を表現するチップ */
function FilterChip({
  active,
  onClick,
  title,
  children,
}: {
  active: boolean;
  onClick: () => void;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      className={"filter-chip" + (active ? " active" : "")}
      onClick={onClick}
      title={title}
    >
      {children}
    </button>
  );
}

// =====================================================================
// ヘルパー
// =====================================================================
function getStatusColor(
  lastUpdated: number | null,
  lastError: string | null
): string {
  if (lastError) return "#ff6b6b";
  if (!lastUpdated) return "#999";
  const age = Date.now() - lastUpdated;
  if (age > REFRESH_INTERVAL_MS * 2) return "#f4c542";
  return "#4ade80";
}

function collectProjects(viewer: Viewer | null): Project[] {
  if (!viewer) return [];
  const map = new Map<string, Project>();
  for (const i of viewer.assignedIssues?.nodes ?? []) {
    if (i.project && !map.has(i.project.id)) map.set(i.project.id, i.project);
  }
  for (const m of viewer.teamMemberships?.nodes ?? []) {
    for (const i of m.team?.issues?.nodes ?? []) {
      if (i.project && !map.has(i.project.id))
        map.set(i.project.id, i.project);
    }
  }
  return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
}

/** 優先度（Urgent→Low→None）→ updatedAt の降順で並べる共通比較関数 */
function sortByPriorityThenUpdated(a: Issue, b: Issue): number {
  const pr = priorityRank(a.priority) - priorityRank(b.priority);
  if (pr !== 0) return pr;
  return a.updatedAt < b.updatedAt ? 1 : -1;
}

function pickIssues(
  viewer: Viewer | null,
  tab: Tab,
  projectId: string | null
): Issue[] {
  if (!viewer) return [];
  if (tab === "mine") {
    return (viewer.assignedIssues?.nodes ?? [])
      .slice()
      .sort(sortByPriorityThenUpdated);
  }
  const seen = new Set<string>();
  const all: Issue[] = [];
  for (const m of viewer.teamMemberships?.nodes ?? []) {
    for (const i of m.team?.issues?.nodes ?? []) {
      if (seen.has(i.identifier)) continue;
      seen.add(i.identifier);
      all.push(i);
    }
  }
  if (tab === "project") {
    if (!projectId) return [];
    return all.filter((i) => i.project?.id === projectId).sort(sortByPriorityThenUpdated);
  }
  return all.sort(sortByPriorityThenUpdated);
}
