import { contextBridge, ipcRenderer } from 'electron'
import type { AnalysisRequest, AnalysisResult, CockpitAccountState, PickedScreenshot } from '@/lib/contracts'
import type { AppSettings } from '@/lib/appSettings'

contextBridge.exposeInMainWorld('cockpitShot', {
  getCurrentAccount: (): Promise<CockpitAccountState | null> => ipcRenderer.invoke('cockpit:get-current-account'),
  pickScreenshot: (): Promise<PickedScreenshot | null> => ipcRenderer.invoke('dialog:pick-screenshot'),
  importClipboardImage: (): Promise<PickedScreenshot | null> => ipcRenderer.invoke('clipboard:import-image'),
  applyDesktopPreferences: (payload: Pick<AppSettings, 'enableGlobalClipboardShortcut' | 'enableTrayIcon'>) =>
    ipcRenderer.invoke('desktop:apply-preferences', payload),
  saveShareCard: (dataUrl: string, defaultFileName?: string): Promise<string | null> =>
    ipcRenderer.invoke('dialog:save-share-card', { dataUrl, defaultFileName }),
  analyzeScreenshot: (payload: AnalysisRequest): Promise<AnalysisResult> =>
    ipcRenderer.invoke('analyzer:analyze-screenshot', payload),
  onCurrentAccountChange: (listener: (value: CockpitAccountState | null) => void) => {
    const wrapped = (_event: Electron.IpcRendererEvent, value: CockpitAccountState | null) => listener(value)
    ipcRenderer.on('cockpit:current-account-changed', wrapped)

    return () => {
      ipcRenderer.removeListener('cockpit:current-account-changed', wrapped)
    }
  },
  onClipboardImageImported: (listener: (value: PickedScreenshot) => void) => {
    const wrapped = (_event: Electron.IpcRendererEvent, value: PickedScreenshot) => listener(value)
    ipcRenderer.on('clipboard:image-imported', wrapped)

    return () => {
      ipcRenderer.removeListener('clipboard:image-imported', wrapped)
    }
  },
  onClipboardImportFailed: (listener: (message: string) => void) => {
    const wrapped = (_event: Electron.IpcRendererEvent, message: string) => listener(message)
    ipcRenderer.on('clipboard:image-import-failed', wrapped)

    return () => {
      ipcRenderer.removeListener('clipboard:image-import-failed', wrapped)
    }
  },
})
