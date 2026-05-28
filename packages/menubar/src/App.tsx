import { useCallback, useEffect, useMemo, useState } from "react";
import { tokenExists, saveToken, fetchLinear } from "./api";
import type { Issue, LinearResponse, Project, Tab, Viewer } from "./types";
import { formatRelative, formatTime } from "./utils";
import "./App.css";

const REFRESH_INTERVAL_MS = 60_000;

export default function App() {
  const [hasToken, setHasToken] = useState<boolean | null>(null);

  useEffect(() => {
    tokenExists().then(setHasToken);
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
      <h2>Linear Glance へようこそ</h2>
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

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await fetchLinear();
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
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, REFRESH_INTERVAL_MS);
    return () => clearInterval(id);
  }, [refresh]);

  const viewer: Viewer | null = data?.data?.viewer ?? null;
  const projects = useMemo(() => collectProjects(viewer), [viewer]);
  const issues = useMemo(
    () => pickIssues(viewer, tab, projectId),
    [viewer, tab, projectId]
  );

  const statusColor = getStatusColor(lastUpdated, lastError);
  const statusTitle = lastError
    ? `エラー: ${lastError}`
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
          className={"icon-btn" + (refreshing ? " spinning" : "")}
          onClick={refresh}
          title="リロード"
          disabled={refreshing}
        >
          ↻
        </button>
      </header>

      <div className="tabs">
        <TabButton active={tab === "mine"} onClick={() => setTab("mine")}>
          Mine{viewer ? ` (${viewer.assignedIssues.nodes.length})` : ""}
        </TabButton>
        <TabButton active={tab === "team"} onClick={() => setTab("team")}>
          Team
        </TabButton>
        <TabButton active={tab === "project"} onClick={() => setTab("project")}>
          Project
        </TabButton>
      </div>

      {tab === "project" && (
        <div className="project-select">
          <select
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
        </div>
      )}

      <IssueList tab={tab} projectId={projectId} issues={issues} />
    </div>
  );
}

function IssueList({
  tab,
  projectId,
  issues,
}: {
  tab: Tab;
  projectId: string | null;
  issues: Issue[];
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
      {issues.map((issue) => (
        <li key={issue.identifier} className="issue">
          <span
            className="dot"
            style={{ background: issue.state?.color || "#888" }}
          />
          <div>
            <div className="row1">
              <span className="ident">{issue.identifier}</span>
              <a href={issue.url} target="_blank" rel="noreferrer">
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
      ))}
    </ul>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button className={active ? "active" : ""} onClick={onClick}>
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

function pickIssues(
  viewer: Viewer | null,
  tab: Tab,
  projectId: string | null
): Issue[] {
  if (!viewer) return [];
  if (tab === "mine") {
    return viewer.assignedIssues?.nodes ?? [];
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
    return all
      .filter((i) => i.project?.id === projectId)
      .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  }
  return all.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
}
