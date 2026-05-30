// Rust 側コマンドの薄いラッパー。型を付けたかっただけのファイル。

import { invoke } from "@tauri-apps/api/core";
import type { LinearResponse } from "./types";

export const tokenExists = (): Promise<boolean> =>
  invoke<boolean>("token_exists");

export const saveToken = (token: string): Promise<void> =>
  invoke<void>("save_token", { token });

/** トークンが有効か Linear API で検証（Keychain には触らない） */
export type ValidateTokenResult = {
  ok: boolean;
  /** Rust 側のフィールド名は viewer_name (serde 既定) */
  viewer_name?: string | null;
  error?: string | null;
};
export const validateToken = (token: string): Promise<ValidateTokenResult> =>
  invoke<ValidateTokenResult>("validate_token", { token });

export const deleteToken = (): Promise<void> => invoke<void>("delete_token");

/**
 * Linear API を叩いて生の JSON 文字列を受け取る。
 * パースは呼び出し側で行う（エラー JSON が混ざることがあるため）。
 *
 * @param excludeTypes 除外するワークフロー state.type のリスト
 *   既知の値: "backlog" | "unstarted" | "started" | "completed" | "canceled"
 */
export const fetchLinear = async (
  excludeTypes: string[] = ["completed", "canceled"]
): Promise<LinearResponse> => {
  const text = await invoke<string>("fetch_linear", { excludeTypes });
  return JSON.parse(text) as LinearResponse;
};

/** workflow state 一覧（編集モード用）を取得 */
export type StatesResponse = {
  data?: {
    viewer?: {
      teamMemberships: {
        nodes: Array<{
          team: {
            id: string;
            states: { nodes: Array<{ id: string; name: string; color: string; type: string; position?: number }> };
          };
        }>;
      };
    };
  };
  errors?: Array<{ message: string }>;
};
export const fetchStates = async (): Promise<StatesResponse> => {
  const text = await invoke<string>("fetch_states");
  return JSON.parse(text) as StatesResponse;
};

/** 外部ブラウザで URL を開く（Tauri WebView 内では開かない） */
export const openUrl = (url: string): Promise<void> =>
  invoke<void>("open_url", { url });

/** Issue のワークフロー状態を更新 */
export const updateIssueState = async (
  issueId: string,
  stateId: string
): Promise<{ success: boolean }> => {
  const text = await invoke<string>("update_issue_state", { issueId, stateId });
  const parsed = JSON.parse(text);
  if (parsed.errors) {
    throw new Error(parsed.errors[0]?.message ?? "API error");
  }
  return { success: parsed?.data?.issueUpdate?.success ?? false };
};
