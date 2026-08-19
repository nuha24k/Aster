import { invoke as tauriInvoke } from "@tauri-apps/api/core";

export const isTauriEnvironment = (): boolean => {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
};

export async function safeInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (!isTauriEnvironment()) {
    return Promise.reject(new Error("Running in Web Browser mode. PTY Terminal requires Tauri Desktop App."));
  }
  return tauriInvoke<T>(cmd, args);
}
