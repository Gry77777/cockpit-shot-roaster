export interface CockpitAccountState {
  email: string
  updatedAt?: number
}

export interface PickedScreenshot {
  path: string
  previewDataUrl: string
}

export type RoastTone = 'roast' | 'gentle' | 'work'
export type RewriteMode = 'spicier' | 'shorter' | 'headline'

export interface AnalysisRequest {
  imagePath: string
  tone: RoastTone
  activeEmail?: string | null
  apiKey?: string | null
  rewriteMode?: RewriteMode | null
  previousResult?: AnalysisResult | null
}

export interface AnalysisResult {
  roast: string
  summary: string
  titles: string[]
}
