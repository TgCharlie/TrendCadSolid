'use strict';

const { app, BrowserWindow, ipcMain, shell } = require('electron');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const GITHUB_REPOSITORY = process.env.TRENDCAD_GITHUB_REPOSITORY || 'TgCharlie/TrendCadSolid';
const RELEASE_API_URL = `https://api.github.com/repos/${GITHUB_REPOSITORY}/releases/latest`;
let mainWindow;
let staticServer;
let staticPort;

const CONTENT_TYPES = {
  '.css': 'text/css',
  '.dxf': 'application/dxf',
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.wasm': 'application/wasm'
};

function startStaticServer() {
  return new Promise((resolve, reject) => {
    staticServer = http.createServer((request, response) => {
      let pathname;
      try { pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname); }
      catch { response.writeHead(400); response.end(); return; }
      const file = path.resolve(__dirname, `.${pathname === '/' ? '/index.html' : pathname}`);
      if (!file.startsWith(__dirname + path.sep)) { response.writeHead(403); response.end(); return; }
      fs.readFile(file, (error, data) => {
        if (error) { response.writeHead(404); response.end('Not found'); return; }
        response.writeHead(200, { 'Content-Type': CONTENT_TYPES[path.extname(file)] || 'text/plain', 'Cache-Control': 'no-store' });
        response.end(data);
      });
    });
    staticServer.once('error', reject);
    staticServer.listen(0, '127.0.0.1', () => resolve(staticServer.address().port));
  });
}

function createWindow(port) {
  mainWindow = new BrowserWindow({
    width: 1500,
    height: 950,
    minWidth: 1050,
    minHeight: 700,
    backgroundColor: '#10171c',
    title: 'TrendCad Solid',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      preload: path.join(__dirname, 'preload.cjs')
    }
  });

  mainWindow.loadURL(`http://127.0.0.1:${port}/index.html`);
  mainWindow.on('closed', () => { mainWindow = null; });
}

function parseVersion(version) {
  const match = String(version || '').trim().replace(/^v/i, '').match(/^(\d+)(?:\.(\d+))?(?:\.(\d+))?/);
  return match ? [Number(match[1]), Number(match[2] || 0), Number(match[3] || 0)] : null;
}

function compareVersions(left, right) {
  const a = parseVersion(left) || [0, 0, 0];
  const b = parseVersion(right) || [0, 0, 0];
  for (let i = 0; i < 3; i += 1) {
    if (a[i] !== b[i]) return a[i] > b[i] ? 1 : -1;
  }
  return 0;
}

async function fetchLatestRelease() {
  const response = await fetch(RELEASE_API_URL, {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': `TrendCad-Solid/${app.getVersion()}`
    }
  });
  if (!response.ok) {
    throw new Error(`GitHub returned ${response.status}. Create a public release before checking for updates.`);
  }
  const release = await response.json();
  const latestVersion = String(release.tag_name || '').replace(/^v/i, '');
  if (!parseVersion(latestVersion)) throw new Error('The latest GitHub release has no valid version tag.');
  return {
    currentVersion: app.getVersion(),
    latestVersion,
    updateAvailable: compareVersions(latestVersion, app.getVersion()) > 0,
    releaseName: release.name || `TrendCad Solid v${latestVersion}`,
    releaseUrl: release.html_url,
    assets: Array.isArray(release.assets) ? release.assets.map(asset => ({ name: asset.name, url: asset.browser_download_url, size: asset.size })) : [],
    repository: GITHUB_REPOSITORY,
    publishedAt: release.published_at || null
  };
}

function isSafeExternalUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && (url.hostname === 'github.com' || url.hostname.endsWith('.github.com'));
  } catch {
    return false;
  }
}

ipcMain.handle('app:get-info', () => ({
  version: app.getVersion(),
  repository: GITHUB_REPOSITORY,
  isPackaged: app.isPackaged,
  platform: process.platform,
  arch: process.arch
}));

ipcMain.handle('app:check-for-updates', async () => {
  try {
    return await fetchLatestRelease();
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error), currentVersion: app.getVersion(), repository: GITHUB_REPOSITORY };
  }
});

ipcMain.handle('app:open-release', async (_event, url) => {
  if (!isSafeExternalUrl(url)) throw new Error('Only GitHub release links can be opened.');
  await shell.openExternal(url);
  return true;
});

app.whenReady().then(async () => {
  staticPort = await startStaticServer();
  createWindow(staticPort);
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(staticPort); });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => { if (staticServer) staticServer.close(); });
