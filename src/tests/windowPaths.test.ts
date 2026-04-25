// @vitest-environment node

import { describe, expect, it } from 'vitest'
import { resolveWindowAssetPaths } from '../../electron/services/windowPaths'

describe('resolveWindowAssetPaths', () => {
  it('uses the project root when Electron is launched from dist-electron', () => {
    const result = resolveWindowAssetPaths('H:\\A Little Game\\cockpit-shot-roaster\\dist-electron')

    expect(result).toEqual({
      appRoot: 'H:\\A Little Game\\cockpit-shot-roaster',
      htmlPath: 'H:\\A Little Game\\cockpit-shot-roaster\\dist\\index.html',
      preloadPath: 'H:\\A Little Game\\cockpit-shot-roaster\\dist-electron\\preload.mjs',
    })
  })
})
