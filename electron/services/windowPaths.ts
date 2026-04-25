import { basename, dirname, join } from 'path'

export function resolveWindowAssetPaths(appPath: string) {
  const appRoot = basename(appPath) === 'dist-electron' ? dirname(appPath) : appPath

  return {
    appRoot,
    htmlPath: join(appRoot, 'dist', 'index.html'),
    preloadPath: join(appRoot, 'dist-electron', 'preload.mjs'),
  }
}
