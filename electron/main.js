import { app, BrowserWindow, ipcMain, dialog, Menu, shell } from 'electron';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import net from 'net';
import readline from 'readline';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow = null;
let sidecarProcess = null;
let requestCounter = 0;
const pendingRequests = new Map();

function checkDevServer(urlStr, timeoutMs = 300) {
  return new Promise((resolve) => {
    try {
      const u = new URL(urlStr);
      const socket = new net.Socket();
      let connected = false;
      socket.setTimeout(timeoutMs);
      socket.on('connect', () => {
        connected = true;
        socket.destroy();
      });
      socket.on('error', () => socket.destroy());
      socket.on('timeout', () => socket.destroy());
      socket.on('close', () => resolve(connected));
      socket.connect(Number(u.port) || 80, u.hostname);
    } catch (_) {
      resolve(false);
    }
  });
}

function getSidecarPath() {
  const isDev = !app.isPackaged;
  if (isDev) {
    const binName = process.platform === 'win32' ? 'aster-core.exe' : 'aster-core';
    return path.join(__dirname, '../target/debug', binName);
  } else {
    const binName = process.platform === 'win32' ? 'aster-core.exe' : 'aster-core';
    return path.join(process.resourcesPath, binName);
  }
}

function sendRpcRequest(method, params = {}) {
  return new Promise((resolve, reject) => {
    if (!sidecarProcess || sidecarProcess.killed) {
      return reject(new Error('aster-core sidecar process is not running'));
    }

    requestCounter++;
    const id = requestCounter;
    pendingRequests.set(id, { resolve, reject });

    const req = JSON.stringify({
      jsonrpc: '2.0',
      id,
      method,
      params,
    }) + '\n';

    sidecarProcess.stdin.write(req, (err) => {
      if (err) {
        pendingRequests.delete(id);
        reject(err);
      }
    });
  });
}

function startSidecar() {
  const binPath = getSidecarPath();
  console.log(`[main] Spawning sidecar from: ${binPath}`);

  sidecarProcess = spawn(binPath, [], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, RUST_LOG: 'info' },
  });

  const rl = readline.createInterface({
    input: sidecarProcess.stdout,
    terminal: false,
  });

  rl.on('line', (line) => {
    line = line.trim();
    if (!line) return;

    try {
      const msg = JSON.parse(line);
      if (msg.id !== undefined && pendingRequests.has(msg.id)) {
        const { resolve, reject } = pendingRequests.get(msg.id);
        pendingRequests.delete(msg.id);
        if (msg.error) {
          reject(new Error(msg.error.message || 'RPC Error'));
        } else {
          resolve(msg.result);
        }
      } else if (msg.method) {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('sidecar-notification', msg);
        }
      }
    } catch (e) {
      console.error('[main] Malformed sidecar JSON:', line);
    }
  });

  sidecarProcess.stderr.on('data', (chunk) => {
    console.error('[aster-core stderr]', chunk.toString().trim());
  });

  sidecarProcess.on('exit', (code, signal) => {
    console.log(`[main] Sidecar process exited with code ${code}, signal ${signal}`);
    sidecarProcess = null;
  });

  sendRpcRequest('system/handshake')
    .then((handshake) => {
      console.log('[main] Handshake successful:', handshake);
    })
    .catch((err) => {
      console.error('[main] Handshake failed:', err);
    });
}

function setupNativeMenu() {
  const isMac = process.platform === 'darwin';

  const template = [
    ...(isMac ? [{ label: app.name, submenu: [{ role: 'about' }, { type: 'separator' }, { role: 'quit' }] }] : []),
    {
      label: 'File',
      submenu: [
        {
          label: 'Open Folder...',
          accelerator: 'CmdOrCtrl+O',
          click: () => mainWindow?.webContents.send('menu', 'open_folder'),
        },
        { type: 'separator' },
        {
          label: 'Reveal in Finder / Explorer',
          click: () => mainWindow?.webContents.send('menu', 'reveal_in_finder'),
        },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'View',
      submenu: [
        {
          label: 'Toggle Sidebar',
          accelerator: 'CmdOrCtrl+B',
          click: () => mainWindow?.webContents.send('menu', 'toggle_sidebar'),
        },
        {
          label: 'Terminal',
          accelerator: 'CmdOrCtrl+`',
          click: () => mainWindow?.webContents.send('menu', 'surface_terminal'),
        },
        { role: 'toggleDevTools' },
        { role: 'reload' },
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    title: 'ASTER Workspace',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const devUrl = 'http://localhost:5173';
  const distPath = path.join(__dirname, '../dist/index.html');

  if (!app.isPackaged) {
    mainWindow.webContents.openDevTools();
    checkDevServer(devUrl).then((isDevServerActive) => {
      if (isDevServerActive) {
        console.log(`[main] Connecting to active Vite Dev Server at ${devUrl}`);
        mainWindow.loadURL(devUrl);
      } else {
        console.log(`[main] Vite Dev Server not running at ${devUrl}. Loading dist bundle from ${distPath}`);
        mainWindow.loadFile(distPath);
      }
    });
  } else {
    mainWindow.loadFile(distPath);
  }

  setupNativeMenu();
}

ipcMain.handle('rpc', async (_event, { method, params }) => {
  return sendRpcRequest(method, params);
});

ipcMain.handle('dialog:openFolder', async () => {
  const res = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory', 'createDirectory'],
  });
  if (res.canceled || res.filePaths.length === 0) return null;
  return res.filePaths[0];
});

ipcMain.handle('dialog:openFile', async () => {
  const res = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
  });
  if (res.canceled || res.filePaths.length === 0) return null;
  return res.filePaths[0];
});

ipcMain.handle('dialog:saveFile', async (_event, defaultName) => {
  const res = await dialog.showSaveDialog(mainWindow, {
    defaultPath: defaultName || 'untitled.txt',
  });
  if (res.canceled || !res.filePath) return null;
  return res.filePath;
});

ipcMain.handle('shell:openInFinder', async (_event, folderPath) => {
  if (folderPath) {
    shell.openPath(folderPath);
  }
});

app.whenReady().then(() => {
  startSidecar();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  if (sidecarProcess && !sidecarProcess.killed) {
    console.log('[main] Killing sidecar process on app exit...');
    sidecarProcess.kill('SIGTERM');
  }
});
