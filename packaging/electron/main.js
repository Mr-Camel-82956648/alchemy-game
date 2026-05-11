const fs = require('fs');
const path = require('path');
const { app, BrowserWindow } = require('electron');
const {
  launchBackend,
  launchStaticServer,
  stopService,
} = require('./scripts/run-backend');
const { resolveEntryUrl } = require('./scripts/resolve-entry');

const runtime = {
  backendHost: process.env.PACKAGING_BACKEND_HOST || '127.0.0.1',
  backendPort: Number(process.env.PACKAGING_BACKEND_PORT || 18001),
  staticHost: process.env.PACKAGING_STATIC_HOST || '127.0.0.1',
  staticPort: Number(process.env.PACKAGING_STATIC_PORT || 8000),
  startupTimeoutMs: Number(process.env.PACKAGING_STARTUP_TIMEOUT_MS || 30000),
};

let mainWindow = null;
let backendService = null;
let staticService = null;
let shuttingDown = false;

function resolveRuntimeRoot() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'runtime', 'app');
  }
  return path.resolve(__dirname, '..', '..');
}

async function shutdownServices() {
  if (shuttingDown) return;
  shuttingDown = true;

  await Promise.allSettled([
    stopService(staticService),
    stopService(backendService),
  ]);
}

function createWindow(entryUrl) {
  const iconPath = path.join(__dirname, 'assets', 'icon.ico');

  mainWindow = new BrowserWindow({
    width: 1366,
    height: 840,
    show: false,
    icon: fs.existsSync(iconPath) ? iconPath : undefined,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.loadURL(entryUrl);
}

async function bootstrap() {
  const runtimeRoot = resolveRuntimeRoot();
  const backendDir = path.join(runtimeRoot, 'backend');

  process.stdout.write(
    `[desktop] mode=${app.isPackaged ? 'packaged' : 'dev'} runtimeRoot=${runtimeRoot}\n`
  );

  backendService = await launchBackend({
    backendDir,
    host: runtime.backendHost,
    port: runtime.backendPort,
    timeoutMs: runtime.startupTimeoutMs,
  });

  staticService = await launchStaticServer({
    serveDir: runtimeRoot,
    host: runtime.staticHost,
    port: runtime.staticPort,
    timeoutMs: runtime.startupTimeoutMs,
  });

  const entryUrl = resolveEntryUrl({
    host: runtime.staticHost,
    port: runtime.staticPort,
    entryPath: '/',
  });
  createWindow(entryUrl);
}

app.whenReady().then(async () => {
  try {
    await bootstrap();
  } catch (err) {
    console.error('[desktop] bootstrap failed:', err);
    await shutdownServices();
    app.exit(1);
  }
});

app.on('before-quit', (event) => {
  if (!shuttingDown) {
    event.preventDefault();
    shutdownServices().finally(() => app.exit(0));
  }
});

app.on('window-all-closed', () => {
  app.quit();
});

app.on('activate', () => {
  if (!mainWindow) return;
  if (BrowserWindow.getAllWindows().length === 0) {
    mainWindow.show();
  }
});
