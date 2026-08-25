import React, { Component, ErrorInfo, ReactNode } from "react";
import ReactDOM from "react-dom/client";
import * as monaco from "monaco-editor";
import { loader } from "@monaco-editor/react";
import editorWorker from "monaco-editor/editor/editor.worker?worker";
import jsonWorker from "monaco-editor/language/json/json.worker?worker";
import cssWorker from "monaco-editor/language/css/css.worker?worker";
import htmlWorker from "monaco-editor/language/html/html.worker?worker";
import tsWorker from "monaco-editor/language/typescript/ts.worker?worker";
import App from "./App";
import "./index.css";

window.addEventListener("error", (e) => {
  console.error("[Global Window Error]", e.error || e.message);
});

window.addEventListener("unhandledrejection", (e) => {
  console.error("[Unhandled Promise Rejection]", e.reason);
});

// Monaco setup
self.MonacoEnvironment = {
  getWorker(_workerId: string, label: string) {
    try {
      switch (label) {
        case "json": return new jsonWorker();
        case "css":
        case "scss":
        case "less": return new cssWorker();
        case "html":
        case "handlebars":
        case "razor": return new htmlWorker();
        case "typescript":
        case "javascript": return new tsWorker();
        default: return new editorWorker();
      }
    } catch (e) {
      console.warn("Worker creation fallback to main thread:", e);
      return new editorWorker();
    }
  },
};
loader.config({ monaco });

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught Error in Component:", error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center h-screen bg-zinc-950 text-zinc-100 p-8">
          <div className="bg-red-950/80 border border-red-800/80 rounded-lg p-6 max-w-xl shadow-2xl">
            <h2 className="text-lg font-bold text-red-400 mb-2">Application Error Caught</h2>
            <p className="text-xs font-mono bg-black/60 p-3 rounded text-red-300 overflow-auto max-h-48 mb-4">
              {this.state.error?.stack || this.state.error?.message || "Unknown rendering error"}
            </p>
            <button
              onClick={() => window.location.reload()}
              className="bg-red-600 hover:bg-red-500 text-white text-xs px-4 py-2 rounded font-medium transition-colors"
            >
              Reload Application
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
