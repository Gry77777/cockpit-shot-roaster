import type { RoastTone } from './contracts'

export const APP_SETTINGS_KEY = 'cockpit-shot-roaster-settings'
export const ONBOARDING_DISMISSED_KEY = 'cockpit-shot-roaster-onboarding-dismissed'

export interface AppSettings {
  defaultTone: RoastTone
  autoAnalyzeAfterImport: boolean
}

export const defaultAppSettings: AppSettings = {
  defaultTone: 'roast',
  autoAnalyzeAfterImport: false,
}

export function loadAppSettings(): AppSettings {
  try {
    const raw = getStorage()?.getItem(APP_SETTINGS_KEY)
    if (!raw) {
      return defaultAppSettings
    }

    const parsed = JSON.parse(raw) as Partial<AppSettings>

    return {
      defaultTone: isRoastTone(parsed.defaultTone) ? parsed.defaultTone : defaultAppSettings.defaultTone,
      autoAnalyzeAfterImport:
        typeof parsed.autoAnalyzeAfterImport === 'boolean'
          ? parsed.autoAnalyzeAfterImport
          : defaultAppSettings.autoAnalyzeAfterImport,
    }
  } catch {
    return defaultAppSettings
  }
}

export function saveAppSettings(settings: AppSettings) {
  getStorage()?.setItem(APP_SETTINGS_KEY, JSON.stringify(settings))
}

export function hasDismissedOnboarding() {
  try {
    return getStorage()?.getItem(ONBOARDING_DISMISSED_KEY) === 'true'
  } catch {
    return false
  }
}

export function dismissOnboardingPreference() {
  getStorage()?.setItem(ONBOARDING_DISMISSED_KEY, 'true')
}

export function resetOnboardingPreference() {
  getStorage()?.removeItem(ONBOARDING_DISMISSED_KEY)
}

function isRoastTone(value: unknown): value is RoastTone {
  return value === 'roast' || value === 'gentle' || value === 'work'
}

function getStorage() {
  return typeof globalThis.localStorage === 'undefined' ? null : globalThis.localStorage
}
