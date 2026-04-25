import { contextBridge, ipcRenderer } from 'electron'
import type { AnalysisRequest, AnalysisResult, CockpitAccountState, PickedScreenshot } from '@/lib/contracts'

contextBridge.exposeInMainWorld('cockpitShot', {
  getCurrentAccount: (): Promise<CockpitAccountState | null> => ipcRenderer.invoke('cockpit:get-current-account'),
  pickScreenshot: (): Promise<PickedScreenshot | null> => ipcRenderer.invoke('dialog:pick-screenshot'),
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
})
