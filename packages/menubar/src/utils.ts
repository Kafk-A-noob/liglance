// 表示まわりのちょっとしたユーティリティ。Übersicht 版と同じ関数。

/**
 * 外部由来の URL を href に渡す前に検証する。
 * javascript: / data: / file: 等のスキームを弾き、安全な http(s) のみ通す。
 * 万一 Linear API の応答に悪意ある URL が混入しても、WebView 内 JS 実行を防ぐ。
 */
export function safeUrl(u: string | null | undefined): string {
  if (!u || typeof u !== "string") return "#";
  return /^https?:\/\//i.test(u) ? u : "#";
}

/** Linear の priority(0-4) → 表示用の色とラベル */
export function priorityMeta(priority: number): {
  color: string;
  short: string;
  label: string;
} | null {
  switch (priority) {
    case 1: return { color: "#ef4444", short: "U", label: "Urgent" };
    case 2: return { color: "#f97316", short: "H", label: "High" };
    case 3: return { color: "#eab308", short: "M", label: "Medium" };
    case 4: return { color: "#6b7280", short: "L", label: "Low" };
    default: return null;
  }
}


/** ISO 日時 → "3h ago" */
export function formatRelative(iso: string): string {
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
 * 文字列から代表的なシークレット形式を *** で塗り潰す。
 * UI にエラーメッセージを生表示するとき、ライブラリが
 * Authorization ヘッダなどをログ出力に混入させていた場合の保険。
 */
export function redactSecrets(s: string): string {
  return s
    .replace(/lin_api_[A-Za-z0-9]{10,}/g, "lin_api_***REDACTED***")
    .replace(/lin_oauth_[A-Za-z0-9]{10,}/g, "lin_oauth_***REDACTED***")
    .replace(/sk-[A-Za-z0-9_-]{20,}/g, "sk-***REDACTED***")
    .replace(/gh[pous]_[A-Za-z0-9]{20,}/g, "gh_***REDACTED***")
    .replace(/xox[baprs]-[A-Za-z0-9-]{10,}/g, "xoxX-***REDACTED***")
    .replace(
      /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g,
      "JWT_***REDACTED***"
    );
}

/** timestamp(ms) → "MM/DD HH:mm" 形式で常に日付付き */
export function formatTime(ms: number): string {
  const d = new Date(ms);
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${mo}/${da} ${hh}:${mm}`;
}
