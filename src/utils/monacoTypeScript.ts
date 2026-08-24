import * as monaco from "monaco-editor";
import { invoke } from "@tauri-apps/api/core";

export interface FileContentDto {
  path: string;
  content: string;
}

let extraLibDisposables: monaco.IDisposable[] = [];

function getTsLanguages() {
  return (monaco.languages as any).typescript;
}

function stripJsonComments(jsonString: string): string {
  return jsonString
    .replace(/\\"|"(?:\\"|[^"])*"|(\/\/.*|\/\*[\s\S]*?\*\/)/g, (m, g1) => (g1 ? "" : m))
    .replace(/,\s*([}\]])/g, "$1");
}

function mapScriptTarget(target?: string): number {
  const ts = getTsLanguages();
  if (!target || !ts?.ScriptTarget) return 7; // ES2020
  switch (target.toLowerCase()) {
    case "es3": return ts.ScriptTarget.ES3 ?? 0;
    case "es5": return ts.ScriptTarget.ES5 ?? 1;
    case "es6":
    case "es2015": return ts.ScriptTarget.ES2015 ?? 2;
    case "es2016": return ts.ScriptTarget.ES2016 ?? 3;
    case "es2017": return ts.ScriptTarget.ES2017 ?? 4;
    case "es2018": return ts.ScriptTarget.ES2018 ?? 5;
    case "es2019": return ts.ScriptTarget.ES2019 ?? 6;
    case "es2020": return ts.ScriptTarget.ES2020 ?? 7;
    case "es2021": return ts.ScriptTarget.ES2021 ?? 8;
    case "es2022": return ts.ScriptTarget.ES2022 ?? 9;
    case "esnext": return ts.ScriptTarget.ESNext ?? 99;
    default: return ts.ScriptTarget.ES2020 ?? 7;
  }
}

function mapModuleKind(mod?: string): number {
  const ts = getTsLanguages();
  if (!mod || !ts?.ModuleKind) return 99; // ESNext
  switch (mod.toLowerCase()) {
    case "commonjs": return ts.ModuleKind.CommonJS ?? 1;
    case "amd": return ts.ModuleKind.AMD ?? 2;
    case "umd": return ts.ModuleKind.UMD ?? 3;
    case "system": return ts.ModuleKind.System ?? 4;
    case "es6":
    case "es2015": return ts.ModuleKind.ES2015 ?? 5;
    case "es2020": return ts.ModuleKind.ES2020 ?? 6;
    case "esnext": return ts.ModuleKind.ESNext ?? 99;
    default: return ts.ModuleKind.ESNext ?? 99;
  }
}

function mapJsxEmit(jsx?: string): number {
  const ts = getTsLanguages();
  if (!jsx || !ts?.JsxEmit) return 4; // ReactJSX
  switch (jsx.toLowerCase()) {
    case "react": return ts.JsxEmit.React ?? 2;
    case "react-jsx":
    case "react-jsxdev": return ts.JsxEmit.ReactJSX ?? 4;
    case "preserve": return ts.JsxEmit.Preserve ?? 1;
    case "react-native": return ts.JsxEmit.React ?? 2;
    default: return ts.JsxEmit.ReactJSX ?? 4;
  }
}

function mapModuleResolution(modRes?: string): number {
  const ts = getTsLanguages();
  if (!modRes || !ts?.ModuleResolutionKind) return 2; // NodeJs
  switch (modRes.toLowerCase()) {
    case "classic": return ts.ModuleResolutionKind.Classic ?? 1;
    case "node":
    case "nodejs": return ts.ModuleResolutionKind.NodeJs ?? 2;
    case "node16":
    case "nodenext":
    case "bundler":
      return ts.ModuleResolutionKind.Bundler ?? ts.ModuleResolutionKind.NodeJs ?? 2;
    default:
      return ts.ModuleResolutionKind.NodeJs ?? 2;
  }
}

const FALLBACK_REACT_JSX_TYPES = `
import * as React from 'react';

declare global {
  namespace JSX {
    interface Element extends React.ReactElement<any, any> {}
    interface ElementClass extends React.Component<any> {
      render(): React.ReactNode;
    }
    interface ElementAttributesProperty { props: {}; }
    interface ElementChildrenAttribute { children: {}; }
    interface IntrinsicAttributes extends React.Attributes {}
    interface IntrinsicClassAttributes<T> extends React.ClassAttributes<T> {}
    interface IntrinsicElements {
      [elemName: string]: any;
    }
  }
}
`;

/**
 * Configure Monaco TypeScript Language Service for the current active workspace.
 */
export async function configureMonacoTypeScriptForWorkspace(rootPath: string): Promise<void> {
  if (!rootPath) return;

  const ts = getTsLanguages();
  if (!ts) {
    console.warn("Monaco TypeScript language service is not available yet.");
    return;
  }

  // Clear previous workspace extra libs
  for (const disp of extraLibDisposables) {
    disp.dispose();
  }
  extraLibDisposables = [];

  // Default baseline compiler options matching modern React/TS development
  let compilerOptions: Record<string, any> = {
    target: mapScriptTarget("es2020"),
    module: mapModuleKind("esnext"),
    moduleResolution: mapModuleResolution("node"),
    jsx: mapJsxEmit("react-jsx"),
    allowJs: true,
    allowSyntheticDefaultImports: true,
    esModuleInterop: true,
    resolveJsonModule: true,
    skipLibCheck: true,
    strict: true,
    baseUrl: monaco.Uri.file(rootPath).path,
    paths: {},
    lib: ["es2020", "dom", "dom.iterable"],
  };

  // Try reading workspace tsconfig.json
  try {
    const tsconfigPath = `${rootPath.replace(/[/\\]$/, "")}/tsconfig.json`;
    const content = await invoke<string>("read_file_content", { path: tsconfigPath });
    if (content) {
      const stripped = stripJsonComments(content);
      const parsed = JSON.parse(stripped);
      if (parsed && parsed.compilerOptions) {
        const opts = parsed.compilerOptions;
        if (opts.target) compilerOptions.target = mapScriptTarget(opts.target);
        if (opts.module) compilerOptions.module = mapModuleKind(opts.module);
        if (opts.jsx) compilerOptions.jsx = mapJsxEmit(opts.jsx);
        if (opts.moduleResolution) compilerOptions.moduleResolution = mapModuleResolution(opts.moduleResolution);
        if (typeof opts.allowJs === "boolean") compilerOptions.allowJs = opts.allowJs;
        if (typeof opts.allowSyntheticDefaultImports === "boolean") compilerOptions.allowSyntheticDefaultImports = opts.allowSyntheticDefaultImports;
        if (typeof opts.esModuleInterop === "boolean") compilerOptions.esModuleInterop = opts.esModuleInterop;
        if (typeof opts.resolveJsonModule === "boolean") compilerOptions.resolveJsonModule = opts.resolveJsonModule;
        if (typeof opts.skipLibCheck === "boolean") compilerOptions.skipLibCheck = opts.skipLibCheck;
        if (typeof opts.strict === "boolean") compilerOptions.strict = opts.strict;

        if (opts.baseUrl) {
          const resolvedBase = opts.baseUrl.startsWith("/") || opts.baseUrl.includes(":")
            ? opts.baseUrl
            : `${rootPath.replace(/[/\\]$/, "")}/${opts.baseUrl.replace(/^\.\//, "")}`;
          compilerOptions.baseUrl = monaco.Uri.file(resolvedBase).path;
        }

        if (opts.paths && typeof opts.paths === "object") {
          const formattedPaths: Record<string, string[]> = {};
          for (const [key, patterns] of Object.entries(opts.paths)) {
            if (Array.isArray(patterns)) {
              formattedPaths[key] = patterns.map((p) => {
                if (p.startsWith("./") || p.startsWith("../")) {
                  return `${rootPath.replace(/[/\\]$/, "")}/${p.replace(/^\.\//, "")}`;
                }
                return p;
              });
            }
          }
          compilerOptions.paths = formattedPaths;
        }

        if (Array.isArray(opts.lib)) {
          compilerOptions.lib = opts.lib.map((l: string) => l.toLowerCase());
        }
      }
    }
  } catch {
    // If no tsconfig.json or parse error, default options will be used
  }

  // Set TypeScript defaults
  ts.typescriptDefaults.setCompilerOptions(compilerOptions);
  if (ts.javascriptDefaults) {
    ts.javascriptDefaults.setCompilerOptions(compilerOptions);
  }

  // Diagnostics must REMAIN ACTIVE (do not disable validation)
  ts.typescriptDefaults.setDiagnosticsOptions({
    noSemanticValidation: false,
    noSyntaxValidation: false,
    onlyVisible: false,
  });

  // Enable eager model sync so Monaco worker indexes all workspace models
  ts.typescriptDefaults.setEagerModelSync(true);

  // Load workspace node_modules type definitions (.d.ts files)
  let hasReactTypes = false;
  try {
    const typeFiles = await invoke<FileContentDto[]>("get_workspace_type_defs", { rootPath });
    for (const file of typeFiles) {
      if (file.path.includes("@types/react")) {
        hasReactTypes = true;
      }
      const uri = monaco.Uri.file(file.path).toString();
      const disp = ts.typescriptDefaults.addExtraLib(file.content, uri);
      extraLibDisposables.push(disp);
      if (ts.javascriptDefaults) {
        const dispJs = ts.javascriptDefaults.addExtraLib(file.content, uri);
        extraLibDisposables.push(dispJs);
      }
    }
  } catch (err) {
    console.error("Failed to load workspace type defs:", err);
  }

  // Fallback JSX/React definitions if node_modules/@types/react is not installed
  if (!hasReactTypes) {
    const fallbackUri = monaco.Uri.file(`${rootPath}/__aster_fallback_react.d.ts`).toString();
    const fallbackDisp = ts.typescriptDefaults.addExtraLib(FALLBACK_REACT_JSX_TYPES, fallbackUri);
    extraLibDisposables.push(fallbackDisp);
  }

  // Load workspace source files (.ts and .tsx) into Monaco models for cross-file navigation
  try {
    const sourceFiles = await invoke<FileContentDto[]>("get_workspace_source_files", { rootPath });
    for (const src of sourceFiles) {
      const uri = monaco.Uri.file(src.path);
      let existingModel = monaco.editor.getModel(uri);
      if (!existingModel) {
        monaco.editor.createModel(src.content, "typescript", uri);
      } else if (existingModel.getValue() !== src.content) {
        existingModel.setValue(src.content);
      }
    }
  } catch (err) {
    console.error("Failed to load workspace source files:", err);
  }
}
