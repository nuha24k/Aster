export const getLanguageFromPath = (filePath: string): string => {
  const ext = filePath.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "ts":
    case "tsx":
      return "typescript";
    case "js":
    case "jsx":
      return "javascript";
    case "json":
      return "json";
    case "rs":
      return "rust";
    case "py":
      return "python";
    case "go":
      return "go";
    case "html":
      return "html";
    case "css":
    case "scss":
      return "css";
    case "md":
    case "markdown":
      return "markdown";
    case "yaml":
    case "yml":
      return "yaml";
    case "toml":
      return "toml";
    case "sql":
      return "sql";
    case "sh":
    case "bash":
    case "zsh":
      return "shell";
    case "xml":
      return "xml";
    default:
      return "plaintext";
  }
};
