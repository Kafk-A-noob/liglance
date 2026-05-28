// Rust 側コマンドの薄いラッパー。型を付けたかっただけのファイル。

import { invoke } from "@tauri-apps/api/core";
import type { LinearResponse } from "./types";

export const tokenExists = (): Promise<boolean> =>
  invoke<boolean>("token_exists");

export const saveToken = (token: string): Promise<void> =>
  invoke<void>("save_token", { token });

export const deleteToken = (): Promise<void> => invoke<void>("delete_token");

/**
 * Linear API を叩いて生の JSON 文字列を受け取る。
 * パースは呼び出し側で行う（エラー JSON が混ざることがあるため）。
 */
export const fetchLinear = async (): Promise<LinearResponse> => {
  const text = await invoke<string>("fetch_linear");
  return JSON.parse(text) as LinearResponse;
};
