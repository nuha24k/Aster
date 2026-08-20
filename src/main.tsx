import React from "react";
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

// Monaco ships with the app: @monaco-editor/react would otherwise pull it from
// a CDN at runtime, leaving the editor blank whenever ASTER is offline.
self.MonacoEnvironment = {
  getWorker(_workerId: string, label: string) {
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
  },
};
loader.config({ monaco });

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
