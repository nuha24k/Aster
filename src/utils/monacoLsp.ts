import * as monaco from "monaco-editor";
import { safeInvoke } from "./tauri";
import { subscribeNotification } from "../api/client";

interface LspNotificationPayload {
  server_id: string;
  method: string;
  params: any;
}

const activeServersByLanguage: Record<string, string> = {};
let isLspListenerInitialized = false;
let _unlistenFn: (() => void) | null = null;
let isProvidersRegistered = false;

export async function disposeLspBridge(): Promise<void> {
  if (_unlistenFn) {
    _unlistenFn();
    _unlistenFn = null;
  }
  isLspListenerInitialized = false;
}

function mapSeverity(sev?: number): monaco.MarkerSeverity {
  switch (sev) {
    case 1: return monaco.MarkerSeverity.Error;
    case 2: return monaco.MarkerSeverity.Warning;
    case 3: return monaco.MarkerSeverity.Info;
    case 4: return monaco.MarkerSeverity.Hint;
    default: return monaco.MarkerSeverity.Error;
  }
}

/**
 * Initialize global LSP listener for server notifications (e.g. publishDiagnostics)
 */
export async function initLspBridge(): Promise<void> {
  if (isLspListenerInitialized) return;
  isLspListenerInitialized = true;

  _unlistenFn = subscribeNotification((payload: LspNotificationPayload) => {
    if (!payload) return;
    const { method, params } = payload;

    if (method === "textDocument/publishDiagnostics" && params && params.uri) {
      try {
        const uri = monaco.Uri.parse(params.uri);
        const model = monaco.editor.getModel(uri);
        if (model) {
          const markers: monaco.editor.IMarkerData[] = (params.diagnostics || []).map((d: any) => ({
            severity: mapSeverity(d.severity),
            message: d.message,
            startLineNumber: d.range.start.line + 1,
            startColumn: d.range.start.character + 1,
            endLineNumber: d.range.end.line + 1,
            endColumn: d.range.end.character + 1,
            code: d.code ? String(d.code) : undefined,
            source: d.source || "LSP",
          }));
          monaco.editor.setModelMarkers(model, "lsp", markers);
        }
      } catch (err) {
        console.error("Error setting LSP markers:", err);
      }
    }
  });

  registerMonacoLspProviders();
}

/**
 * Start or connect an LSP server process for the specified language & workspace
 */
export async function ensureLspServer(language: string, rootPath: string): Promise<string | null> {
  if (!rootPath || !language) return null;
  const langKey = language.toLowerCase();
  if (activeServersByLanguage[langKey]) {
    return activeServersByLanguage[langKey];
  }

  try {
    const serverId = await safeInvoke<string>("lsp_start_server", { language, rootPath });
    if (serverId) {
      activeServersByLanguage[langKey] = serverId;
      return serverId;
    }
  } catch (err) {
    console.warn(`LSP server for '${language}' not active:`, err);
  }
  return null;
}

export async function lspNotifyOpen(filePath: string, language?: string, content?: string, rootPath?: string): Promise<void> {
  if (!language || !rootPath) return;
  const serverId = await ensureLspServer(language, rootPath);
  if (!serverId) return;

  const fileUri = monaco.Uri.file(filePath).toString();
  await safeInvoke("lsp_send_notification", {
    serverId,
    method: "textDocument/didOpen",
    params: {
      textDocument: {
        uri: fileUri,
        languageId: language,
        version: 1,
        text: content || "",
      },
    },
  }).catch(() => {});
}

export async function lspNotifyChange(filePath: string, language?: string, content?: string, _rootPath?: string): Promise<void> {
  if (!language) return;
  const serverId = activeServersByLanguage[language.toLowerCase()];
  if (!serverId) return;

  const fileUri = monaco.Uri.file(filePath).toString();
  await safeInvoke("lsp_send_notification", {
    serverId,
    method: "textDocument/didChange",
    params: {
      textDocument: {
        uri: fileUri,
        version: Date.now(),
      },
      contentChanges: [
        {
          text: content,
        },
      ],
    },
  }).catch(() => {});
}

export async function lspNotifySave(filePath: string, language?: string): Promise<void> {
  if (!language) return;
  const serverId = activeServersByLanguage[language.toLowerCase()];
  if (!serverId) return;

  const fileUri = monaco.Uri.file(filePath).toString();
  await safeInvoke("lsp_send_notification", {
    serverId,
    method: "textDocument/didSave",
    params: {
      textDocument: {
        uri: fileUri,
      },
    },
  }).catch(() => {});
}

function registerMonacoLspProviders(): void {
  if (isProvidersRegistered) return;
  isProvidersRegistered = true;

  // Hover Provider
  monaco.languages.registerHoverProvider(["typescript", "javascript", "rust", "python", "go", "json"], {
    async provideHover(model, position) {
      const ext = model.uri.path.split(".").pop() || "";
      const lang = model.getLanguageId();
      const serverId = activeServersByLanguage[lang.toLowerCase()] || activeServersByLanguage[ext.toLowerCase()];
      if (!serverId) return null;

      try {
        const res = await safeInvoke<any>("lsp_send_request", {
          serverId,
          method: "textDocument/hover",
          params: {
            textDocument: { uri: model.uri.toString() },
            position: { line: position.lineNumber - 1, character: position.column - 1 },
          },
        });
        if (res && res.result && res.result.contents) {
          const contents = res.result.contents;
          if (typeof contents === "string") {
            return { contents: [{ value: contents }] };
          }
          if (Array.isArray(contents)) {
            return { contents: contents.map((c: any) => ({ value: typeof c === "string" ? c : c.value })) };
          }
          if (contents.value) {
            return { contents: [{ value: contents.value }] };
          }
        }
      } catch {}
      return null;
    },
  });

  // Definition Provider (Go To Definition)
  monaco.languages.registerDefinitionProvider(["typescript", "javascript", "rust", "python", "go", "json"], {
    async provideDefinition(model, position) {
      const ext = model.uri.path.split(".").pop() || "";
      const lang = model.getLanguageId();
      const serverId = activeServersByLanguage[lang.toLowerCase()] || activeServersByLanguage[ext.toLowerCase()];
      if (!serverId) return null;

      try {
        const res = await safeInvoke<any>("lsp_send_request", {
          serverId,
          method: "textDocument/definition",
          params: {
            textDocument: { uri: model.uri.toString() },
            position: { line: position.lineNumber - 1, character: position.column - 1 },
          },
        });
        if (res && res.result) {
          const result = res.result;
          const locs = Array.isArray(result) ? result : [result];
          return locs.map((loc: any) => ({
            uri: monaco.Uri.parse(loc.uri || loc.targetUri),
            range: {
              startLineNumber: (loc.range || loc.targetSelectionRange).start.line + 1,
              startColumn: (loc.range || loc.targetSelectionRange).start.character + 1,
              endLineNumber: (loc.range || loc.targetSelectionRange).end.line + 1,
              endColumn: (loc.range || loc.targetSelectionRange).end.character + 1,
            },
          }));
        }
      } catch {}
      return null;
    },
  });

  // Completion Provider
  monaco.languages.registerCompletionItemProvider(["typescript", "javascript", "rust", "python", "go", "json"], {
    async provideCompletionItems(model, position) {
      const ext = model.uri.path.split(".").pop() || "";
      const lang = model.getLanguageId();
      const serverId = activeServersByLanguage[lang.toLowerCase()] || activeServersByLanguage[ext.toLowerCase()];
      if (!serverId) return { suggestions: [] };

      try {
        const res = await safeInvoke<any>("lsp_send_request", {
          serverId,
          method: "textDocument/completion",
          params: {
            textDocument: { uri: model.uri.toString() },
            position: { line: position.lineNumber - 1, character: position.column - 1 },
          },
        });
        if (res && res.result) {
          const items = Array.isArray(res.result) ? res.result : res.result.items || [];
          const suggestions: monaco.languages.CompletionItem[] = items.map((item: any) => ({
            label: item.label,
            kind: item.kind || monaco.languages.CompletionItemKind.Text,
            insertText: item.insertText || item.label,
            detail: item.detail,
            documentation: item.documentation ? (typeof item.documentation === "string" ? item.documentation : item.documentation.value) : undefined,
            range: {
              startLineNumber: position.lineNumber,
              endLineNumber: position.lineNumber,
              startColumn: position.column,
              endColumn: position.column,
            },
          }));
          return { suggestions };
        }
      } catch {}
      return { suggestions: [] };
    },
  });
}
