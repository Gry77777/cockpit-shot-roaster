import { app, BrowserWindow, clipboard, dialog, globalShortcut, ipcMain, Menu, Tray } from 'electron'
import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { analyzeScreenshot } from './services/analyzerService'
import { readCurrentAccountFile, watchCurrentAccountFile } from './services/cockpitAccountService'
import { resolveWindowAssetPaths } from './services/windowPaths'

const CLIPBOARD_IMPORT_SHORTCUT = 'CommandOrControl+Shift+V'
const CLIPBOARD_EMPTY_MESSAGE = '剪贴板里还没有可用图片。先截一张图，再按全局快捷键。'
const APP_NAME = '截图吐槽机'

let mainWindow: BrowserWindow | null = null
let appTray: Tray | null = null

interface DesktopPreferences {
  enableGlobalClipboardShortcut: boolean
  enableTrayIcon: boolean
}

let desktopPreferences: DesktopPreferences = {
  enableGlobalClipboardShortcut: true,
  enableTrayIcon: true,
}

const hasSingleInstanceLock = app.requestSingleInstanceLock()

if (!hasSingleInstanceLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    const window = ensureMainWindow()
    revealWindow(window)
  })
}

function createMainWindow() {
  const appRoot = app.getAppPath()
  const { htmlPath, preloadPath } = resolveWindowAssetPaths(appRoot)
  const iconPath = resolveWindowIconPath(appRoot)

  const window = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1220,
    minHeight: 820,
    show: false,
    backgroundColor: '#080b10',
    title: APP_NAME,
    titleBarStyle: process.platform === 'win32' ? 'hidden' : 'hiddenInset',
    titleBarOverlay:
      process.platform === 'win32'
        ? {
            color: '#0a0d11',
            symbolColor: '#f7f4ec',
            height: 42,
          }
        : false,
    autoHideMenuBar: true,
    icon: iconPath,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  mainWindow = window

  window.once('ready-to-show', () => {
    window.show()
  })

  window.on('closed', () => {
    if (mainWindow === window) {
      mainWindow = null
    }
  })

  if (process.env.VITE_DEV_SERVER_URL) {
    void window.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    void window.loadFile(htmlPath)
  }

  return window
}

if (hasSingleInstanceLock) {
  app.whenReady().then(() => {
  ipcMain.handle('cockpit:get-current-account', async () => readCurrentAccountFile())
  ipcMain.handle('desktop:apply-preferences', async (_event, payload: Partial<DesktopPreferences>) => {
    desktopPreferences = {
      enableGlobalClipboardShortcut:
        typeof payload.enableGlobalClipboardShortcut === 'boolean'
          ? payload.enableGlobalClipboardShortcut
          : desktopPreferences.enableGlobalClipboardShortcut,
      enableTrayIcon:
        typeof payload.enableTrayIcon === 'boolean' ? payload.enableTrayIcon : desktopPreferences.enableTrayIcon,
    }

    syncDesktopIntegrations()
    return desktopPreferences
  })

  ipcMain.handle('dialog:pick-screenshot', async () => {
    const result = await dialog.showOpenDialog({
      title: '选择要吐槽的截图',
      buttonLabel: '导入截图',
      properties: ['openFile'],
      filters: [
        {
          name: 'Images',
          extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'],
        },
      ],
    })

    if (result.canceled || result.filePaths.length === 0) {
      return null
    }

    const filePath = result.filePaths[0]
    const previewDataUrl = await readImagePreview(filePath)

    return {
      path: filePath,
      previewDataUrl,
    }
  })

  ipcMain.handle('analyzer:analyze-screenshot', async (_event, payload) => analyzeScreenshot(payload))

  ipcMain.handle('clipboard:import-image', async () => readClipboardScreenshot())

  ipcMain.handle('dialog:save-share-card', async (_event, payload: { dataUrl: string; defaultFileName?: string }) => {
    const saveResult = await dialog.showSaveDialog({
      title: '导出分享卡',
      buttonLabel: '保存图片',
      defaultPath: payload.defaultFileName || 'shot-roaster-share-card.png',
      filters: [
        {
          name: 'PNG Image',
          extensions: ['png'],
        },
      ],
    })

    if (saveResult.canceled || !saveResult.filePath) {
      return null
    }

    const base64 = payload.dataUrl.split(',')[1]
    if (!base64) {
      throw new Error('分享卡数据无效。')
    }

    await writeFile(saveResult.filePath, Buffer.from(base64, 'base64'))
    return saveResult.filePath
  })

  createMainWindow()
  syncDesktopIntegrations()

  const stopWatchingAccount = watchCurrentAccountFile((value: Awaited<ReturnType<typeof readCurrentAccountFile>>) => {
    for (const window of BrowserWindow.getAllWindows()) {
      window.webContents.send('cockpit:current-account-changed', value)
    }
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow()
      createTray()
      return
    }

    revealWindow(ensureMainWindow())
  })

  app.on('before-quit', () => {
    stopWatchingAccount()
    globalShortcut.unregisterAll()
  })
  })
}

async function importClipboardImageIntoWindow() {
  const window = ensureMainWindow()
  const picked = await readClipboardScreenshot()

  if (picked) {
    revealWindow(window)
    sendToRenderer(window, 'clipboard:image-imported', picked)
    return
  }

  revealWindow(window)
  sendToRenderer(window, 'clipboard:image-import-failed', CLIPBOARD_EMPTY_MESSAGE)
}

async function readImagePreview(filePath: string) {
  const buffer = await readFile(filePath)
  const extension = filePath.toLowerCase().split('.').pop()
  const mimeType =
    extension === 'jpg' || extension === 'jpeg'
      ? 'image/jpeg'
      : extension === 'webp'
        ? 'image/webp'
        : extension === 'gif'
          ? 'image/gif'
          : 'image/png'

  return `data:${mimeType};base64,${buffer.toString('base64')}`
}

async function readClipboardScreenshot() {
  const image = clipboard.readImage()
  if (image.isEmpty()) {
    return null
  }

  const pngBuffer = image.toPNG()
  const tempDir = join(app.getPath('temp'), 'cockpit-shot-roaster')
  await mkdir(tempDir, { recursive: true })

  const filePath = join(tempDir, `clipboard-${Date.now()}.png`)
  await writeFile(filePath, pngBuffer)

  return {
    path: filePath,
    previewDataUrl: `data:image/png;base64,${pngBuffer.toString('base64')}`,
  }
}

function ensureMainWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    return mainWindow
  }

  return createMainWindow()
}

function createTray() {
  if (appTray) {
    return appTray
  }

  const iconPath = resolveWindowIconPath(app.getAppPath())
  if (!iconPath) {
    return null
  }

  appTray = new Tray(iconPath)
  appTray.setToolTip(APP_NAME)
  appTray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: '打开主窗口',
        click: () => revealWindow(ensureMainWindow()),
      },
      {
        label: '从剪贴板导入截图',
        click: () => {
          void importClipboardImageIntoWindow()
        },
      },
      {
        type: 'separator',
      },
      {
        label: '退出',
        role: 'quit',
      },
    ]),
  )
  appTray.on('click', () => {
    revealWindow(ensureMainWindow())
  })

  return appTray
}

function destroyTray() {
  if (!appTray) {
    return
  }

  appTray.destroy()
  appTray = null
}

function syncDesktopIntegrations() {
  syncGlobalShortcutRegistration()
  syncTrayIcon()
}

function syncGlobalShortcutRegistration() {
  if (desktopPreferences.enableGlobalClipboardShortcut) {
    if (!globalShortcut.isRegistered(CLIPBOARD_IMPORT_SHORTCUT)) {
      globalShortcut.register(CLIPBOARD_IMPORT_SHORTCUT, () => {
        void importClipboardImageIntoWindow()
      })
    }

    return
  }

  globalShortcut.unregister(CLIPBOARD_IMPORT_SHORTCUT)
}

function syncTrayIcon() {
  if (desktopPreferences.enableTrayIcon) {
    createTray()
    return
  }

  destroyTray()
}

function revealWindow(window: BrowserWindow) {
  if (window.isMinimized()) {
    window.restore()
  }

  if (!window.isVisible()) {
    window.show()
  }

  window.focus()
}

function sendToRenderer(window: BrowserWindow, channel: string, payload: unknown) {
  const deliver = () => {
    window.webContents.send(channel, payload)
  }

  if (window.webContents.isLoading()) {
    window.webContents.once('did-finish-load', deliver)
    return
  }

  deliver()
}

function resolveWindowIconPath(appRoot: string) {
  const appIcon = join(appRoot, 'build', 'icon.png')
  return existsSync(appIcon) ? appIcon : undefined
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
