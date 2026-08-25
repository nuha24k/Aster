/// <reference types="vite/client" />

declare module "*.css" {
  const content: { [className: string]: string };
  export default content;
}

interface ElectronAPI {
  isElectron?: boolean;
  rpc: <T = any>(method: string, params?: Record<string, unknown>) => Promise<T>;
  onMenu: (callback: (id: string) => void) => () => void;
  onNotification: (callback: (msg: any) => void) => () => void;
  openFolderDialog: () => Promise<string | null>;
  openFileDialog: () => Promise<string | null>;
  saveFileDialog: (defaultName?: string) => Promise<string | null>;
  openInFinder: (path: string) => Promise<void>;
}

interface Window {
  electronAPI?: ElectronAPI;
}
