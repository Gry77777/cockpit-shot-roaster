/// <reference types="vite/client" />

import type { AnalysisRequest, AnalysisResult, CockpitAccountState, PickedScreenshot } from './lib/contracts'

declare global {
  interface Window {
    cockpitShot: {
      getCurrentAccount: () => Promise<CockpitAccountState | null>
      pickScreenshot: () => Promise<PickedScreenshot | null>
      saveShareCard: (dataUrl: string, defaultFileName?: string) => Promise<string | null>
      analyzeScreenshot: (payload: AnalysisRequest) => Promise<AnalysisResult>
      onCurrentAccountChange: (listener: (value: CockpitAccountState | null) => void) => () => void
    }
  }
}

export {}
