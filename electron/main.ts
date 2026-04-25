import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import { existsSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { analyzeScreenshot } from './services/analyzerService'
import { readCurrentAccountFile, watchCurrentAccountFile } from './services/cockpitAccountService'
import { resolveWindowAssetPaths } from './services/windowPaths'

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
    title: '截图吐槽机',
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

  window.once('ready-to-show', () => {
    window.show()
  })

  if (process.env.VITE_DEV_SERVER_URL) {
    void window.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    void window.loadFile(htmlPath)
  }

  return window
}

app.whenReady().then(() => {
  ipcMain.handle('cockpit:get-current-account', async () => readCurrentAccountFile())

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

  const stopWatchingAccount = watchCurrentAccountFile((value: Awaited<ReturnType<typeof readCurrentAccountFile>>) => {
    for (const window of BrowserWindow.getAllWindows()) {
      window.webContents.send('cockpit:current-account-changed', value)
    }
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow()
    }
  })

  app.on('before-quit', () => {
    stopWatchingAccount()
  })
})

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

function resolveWindowIconPath(appRoot: string) {
  const appIcon = join(appRoot, 'build', 'icon.png')
  return existsSync(appIcon) ? appIcon : undefined
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
