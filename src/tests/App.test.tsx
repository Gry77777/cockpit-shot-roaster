import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/features/shareCard/renderShareCard', () => ({
  renderShareCardPngDataUrl: vi.fn().mockResolvedValue('data:image/png;base64,AAAA'),
}))

import App from '@/App'
import type { AnalysisResult, PickedScreenshot } from '@/lib/contracts'

function mockCockpitBridge() {
  const clipboardImportedListeners: Array<(value: PickedScreenshot) => void> = []
  const clipboardFailedListeners: Array<(message: string) => void> = []

  const bridge = {
    getCurrentAccount: vi.fn().mockResolvedValue({
      email: 'demo@codex.dev',
    }),
    pickScreenshot: vi.fn().mockResolvedValue(null),
    importClipboardImage: vi.fn().mockResolvedValue(null),
    analyzeScreenshot: vi.fn(),
    saveShareCard: vi.fn(),
    onCurrentAccountChange: vi.fn(() => () => {}),
    onClipboardImageImported: vi.fn((listener: (value: PickedScreenshot) => void) => {
      clipboardImportedListeners.push(listener)
      return () => {}
    }),
    onClipboardImportFailed: vi.fn((listener: (message: string) => void) => {
      clipboardFailedListeners.push(listener)
      return () => {}
    }),
  }

  window.cockpitShot = bridge

  return {
    bridge,
    clipboardImportedListeners,
    clipboardFailedListeners,
  }
}

function createAnalysisResult(overrides?: Partial<AnalysisResult>): AnalysisResult {
  return {
    roast: '这张图的气氛像是灵魂刚上线，但情绪缓存还没同步完。',
    summary: '画面主体是一张表情偏空白的人物特写，重点在眼神和停顿感，整体像一个瞬间的情绪卡顿。',
    titles: ['这眼神像刚加载完人生', '情绪上线了，但进度条没满', '看起来很平静，其实内存已经占满'],
    ...overrides,
  }
}

async function dismissOnboardingIfPresent() {
  const onboardingDialog = screen.queryByRole('dialog', { name: /第一次打开/ })
  if (!onboardingDialog) {
    return
  }

  fireEvent.click(within(onboardingDialog).getByRole('button', { name: '知道了，开始用' }))

  await waitFor(() => {
    expect(screen.queryByRole('dialog', { name: /第一次打开/ })).not.toBeInTheDocument()
  })
}

function mockFileReader(dataUrl: string) {
  vi.spyOn(FileReader.prototype, 'readAsDataURL').mockImplementation(function mockReadAsDataURL(this: FileReader) {
    Object.defineProperty(this, 'result', {
      configurable: true,
      value: dataUrl,
    })
    this.onload?.(new ProgressEvent('load'))
  })
}

function createDroppedFile(path: string) {
  const file = new File(['demo'], 'shot.png', { type: 'image/png' }) as File & { path?: string }
  Object.defineProperty(file, 'path', {
    configurable: true,
    value: path,
  })
  return file
}

async function dropImage(path = 'C:\\shots\\demo.png') {
  const droppedFile = createDroppedFile(path)
  fireEvent.drop(screen.getByLabelText('截图拖放区'), {
    dataTransfer: {
      files: [droppedFile],
      items: [],
    },
  })

  await waitFor(() => {
    expect(screen.getAllByText(path).length).toBeGreaterThan(0)
  })
}

describe('App', () => {
  afterEach(() => {
    cleanup()
    window.localStorage.clear()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('renders the Chinese desktop shell and current Codex account', async () => {
    mockCockpitBridge()

    render(<App />)

    expect(screen.getByRole('heading', { name: '截图吐槽机' })).toBeInTheDocument()
    expect(screen.getByText('把截图变成一段能直接发出去的结果')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '偏好设置' })).toBeInTheDocument()

    await waitFor(() => {
      expect(screen.getByText('demo@codex.dev')).toBeInTheDocument()
    })
  })

  it('imports a clipboard screenshot through the desktop button', async () => {
    const { bridge } = mockCockpitBridge()
    bridge.importClipboardImage.mockResolvedValue({
      path: 'C:\\clipboard\\shot.png',
      previewDataUrl: 'data:image/png;base64,clipboard-preview',
    })

    render(<App />)
    await dismissOnboardingIfPresent()

    fireEvent.click(screen.getByRole('button', { name: '导入剪贴板' }))

    await waitFor(() => {
      expect(bridge.importClipboardImage).toHaveBeenCalledTimes(1)
      expect(screen.getAllByText('C:\\clipboard\\shot.png').length).toBeGreaterThan(0)
    })
  })

  it('saves settings and auto analyzes imported screenshots with the chosen default tone', async () => {
    mockCockpitBridge()
    mockFileReader('data:image/png;base64,dragged-preview')
    window.cockpitShot.analyzeScreenshot = vi.fn().mockResolvedValue(createAnalysisResult())

    render(<App />)
    await dismissOnboardingIfPresent()

    fireEvent.click(screen.getByRole('button', { name: '偏好设置' }))

    const settingsDialog = screen.getByRole('dialog', { name: '把常用操作提前配好' })
    fireEvent.click(within(settingsDialog).getByRole('button', { name: /温柔/ }))
    fireEvent.click(within(settingsDialog).getByRole('button', { name: /已关闭保留手动点击开始分析/ }))
    fireEvent.click(within(settingsDialog).getByRole('button', { name: '保存设置' }))

    await dropImage()

    await waitFor(() => {
      expect(window.cockpitShot.analyzeScreenshot).toHaveBeenCalledWith(
        expect.objectContaining({
          imagePath: 'C:\\shots\\demo.png',
          tone: 'gentle',
        }),
      )
    })
  })

  it('supports rewriting an existing result with a stronger roast pass', async () => {
    mockCockpitBridge()
    mockFileReader('data:image/png;base64,dragged-preview')
    const initialResult = createAnalysisResult()
    const rewrittenResult = createAnalysisResult({
      roast: '这一版明显更冲，像把原吐槽拿去加了双倍锐度。',
    })
    window.cockpitShot.analyzeScreenshot = vi.fn().mockResolvedValueOnce(initialResult).mockResolvedValueOnce(rewrittenResult)

    render(<App />)
    await dismissOnboardingIfPresent()
    await dropImage()

    fireEvent.click(screen.getByRole('button', { name: '开始分析' }))

    await waitFor(() => {
      expect(screen.getAllByText(initialResult.roast).length).toBeGreaterThan(0)
      expect(screen.getByRole('button', { name: '更毒一点' })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: '更毒一点' }))

    await waitFor(() => {
      expect(window.cockpitShot.analyzeScreenshot).toHaveBeenLastCalledWith(
        expect.objectContaining({
          rewriteMode: 'spicier',
          previousResult: initialResult,
        }),
      )
      expect(screen.getAllByText(rewrittenResult.roast).length).toBeGreaterThan(0)
    })
  })

  it('supports restoring the previous rewritten result version', async () => {
    mockCockpitBridge()
    mockFileReader('data:image/png;base64,dragged-preview')
    const initialResult = createAnalysisResult()
    const rewrittenResult = createAnalysisResult({
      roast: '第二版已经更狠了，像把原吐槽重新磨了一遍刀。',
    })
    window.cockpitShot.analyzeScreenshot = vi.fn().mockResolvedValueOnce(initialResult).mockResolvedValueOnce(rewrittenResult)

    render(<App />)
    await dismissOnboardingIfPresent()
    await dropImage()

    fireEvent.click(screen.getByRole('button', { name: '开始分析' }))

    await waitFor(() => {
      expect(screen.getAllByText(initialResult.roast).length).toBeGreaterThan(0)
    })

    fireEvent.click(screen.getByRole('button', { name: '更毒一点' }))

    await waitFor(() => {
      expect(screen.getAllByText(rewrittenResult.roast).length).toBeGreaterThan(0)
      expect(screen.getByRole('button', { name: '回到上一版' })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: '回到上一版' }))

    await waitFor(() => {
      expect(screen.getAllByText(initialResult.roast).length).toBeGreaterThan(0)
    })
  })

  it('supports using ctrl enter to start analysis after a screenshot is ready', async () => {
    mockCockpitBridge()
    mockFileReader('data:image/png;base64,dragged-preview')
    window.cockpitShot.analyzeScreenshot = vi.fn().mockResolvedValue(createAnalysisResult())

    render(<App />)
    await dismissOnboardingIfPresent()
    await dropImage()

    fireEvent.keyDown(window, { key: 'Enter', ctrlKey: true })

    await waitFor(() => {
      expect(window.cockpitShot.analyzeScreenshot).toHaveBeenCalledTimes(1)
    })
  })

  it('exports the square share card variant after switching templates', async () => {
    mockCockpitBridge()
    mockFileReader('data:image/png;base64,dragged-preview')
    window.cockpitShot.analyzeScreenshot = vi.fn().mockResolvedValue(createAnalysisResult())
    window.cockpitShot.saveShareCard = vi.fn().mockResolvedValue('C:\\exports\\shot-roaster-square.png')

    render(<App />)
    await dismissOnboardingIfPresent()
    await dropImage()

    fireEvent.click(screen.getByRole('button', { name: '开始分析' }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '导出分享卡' })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: '方卡' }))
    fireEvent.click(screen.getByRole('button', { name: '导出分享卡' }))

    await waitFor(() => {
      expect(window.cockpitShot.saveShareCard).toHaveBeenCalledWith(expect.any(String), expect.stringContaining('square'))
    })
  })

  it('copies the generated share card to the clipboard', async () => {
    mockCockpitBridge()
    mockFileReader('data:image/png;base64,dragged-preview')
    window.cockpitShot.analyzeScreenshot = vi.fn().mockResolvedValue(createAnalysisResult())

    const write = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: vi.fn().mockResolvedValue(undefined),
        write,
      },
    })

    class MockClipboardItem {
      constructor(readonly data: Record<string, Blob>) {}
    }

    vi.stubGlobal('ClipboardItem', MockClipboardItem)

    render(<App />)
    await dismissOnboardingIfPresent()
    await dropImage()

    fireEvent.click(screen.getByRole('button', { name: '开始分析' }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '复制分享卡' })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: '复制分享卡' }))

    await waitFor(() => {
      expect(write).toHaveBeenCalledTimes(1)
    })
  })

  it('shows actionable timeout guidance and can focus the API key field', async () => {
    mockCockpitBridge()
    mockFileReader('data:image/png;base64,dragged-preview')
    window.cockpitShot.analyzeScreenshot = vi.fn().mockRejectedValue(new Error('请求超时了，当前认证链路没有及时返回结果。'))

    render(<App />)
    await dismissOnboardingIfPresent()
    await dropImage()

    fireEvent.click(screen.getByRole('button', { name: '开始分析' }))

    await waitFor(() => {
      expect(screen.getByText('这次请求超时了。')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: '改填 API Key' })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: '改填 API Key' }))

    expect(screen.getByPlaceholderText('可留空；如果系统里已经设置 OPENAI_API_KEY')).toHaveFocus()
  })
})
