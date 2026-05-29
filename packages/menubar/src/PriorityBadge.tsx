import { priorityMeta } from "./utils";

/**
 * 優先度バッジ（Linear 本家のアイコン体系に近い表現）
 *  - Urgent: 赤地に "!"
 *  - High/Medium/Low: 3 本の積み上げバー。filled の本数だけ色付き、残りは薄く
 *  - No priority: null（描画しない）
 */
export function PriorityBadge({ priority }: { priority: number }) {
  const meta = priorityMeta(priority);
  if (!meta) return null;

  if (meta.kind === "urgent") {
    return (
      <span
        className="priority-urgent"
        style={{ color: meta.color }}
        title={meta.label}
      >
        !
      </span>
    );
  }

  return (
    <span className="priority-bars" title={meta.label} style={{ color: meta.color }}>
      <span className={"bar bar-1" + (meta.filled >= 1 ? " on" : "")} />
      <span className={"bar bar-2" + (meta.filled >= 2 ? " on" : "")} />
      <span className={"bar bar-3" + (meta.filled >= 3 ? " on" : "")} />
    </span>
  );
}
