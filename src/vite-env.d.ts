/// <reference types="vite/client" />

import type { AppSettings } from './lib/appSettings'
import type { AnalysisRequest, AnalysisResult, CockpitAccountState, PickedScreenshot } from './lib/contracts'

declare global {
  interface Window {
    cockpitShot: {
      getCurrentAccount: () => Promise<CockpitAccountState | null>
      pickScreenshot: () => Promise<PickedScreenshot | null>
      importClipboardImage: () => Promise<PickedScreenshot | null>
      applyDesktopPreferences: (
        payload: Pick<AppSettings, 'enableGlobalClipboardShortcut' | 'enableTrayIcon'>,
      ) => Promise<Pick<AppSettings, 'enableGlobalClipboardShortcut' | 'enableTrayIcon'>>
      saveShareCard: (dataUrl: string, defaultFileName?: string) => Promise<string | null>
      analyzeScreenshot: (payload: AnalysisRequest) => Promise<AnalysisResult>
      onCurrentAccountChange: (listener: (value: CockpitAccountState | null) => void) => () => void
      onClipboardImageImported: (listener: (value: PickedScreenshot) => void) => () => void
      onClipboardImportFailed: (listener: (message: string) => void) => () => void
    }
  }
}

export {}
