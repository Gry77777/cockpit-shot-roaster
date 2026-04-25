import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from '@/App'

function mockCockpitBridge() {
  window.cockpitShot = {
    getCurrentAccount: vi.fn().mockResolvedValue({
      email: 'demo@codex.dev',
    }),
    pickScreenshot: vi.fn().mockResolvedValue(null),
    analyzeScreenshot: vi.fn(),
    saveShareCard: vi.fn(),
    onCurrentAccountChange: vi.fn(() => () => {}),
  }
}

describe('App', () => {
  afterEach(() => {
    window.localStorage.clear()
    vi.restoreAllMocks()
  })

  it('renders the polished Chinese desktop shell and current Codex account', async () => {
    mockCockpitBridge()

    render(<App />)

    expect(screen.getByRole('heading', { name: '截图吐槽机' })).toBeInTheDocument()
    expect(screen.getByText('把截图变成一句能发出去的梗')).toBeInTheDocument()
    expect(screen.getByText('桌面安装版')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '选择截图' })).toBeInTheDocument()

    await waitFor(() => {
      expect(screen.getByText('demo@codex.dev')).toBeInTheDocument()
    })
  })

  it('accepts a dropped image file and updates the preview stage', async () => {
    mockCockpitBridge()

    vi.spyOn(FileReader.prototype, 'readAsDataURL').mockImplementation(function mockReadAsDataURL(this: FileReader) {
      Object.defineProperty(this, 'result', {
        configurable: true,
        value: 'data:image/png;base64,dragged-preview',
      })
      this.onload?.(new ProgressEvent('load'))
    })

    render(<App />)

    const droppedFile = new File(['demo'], 'drop-image.png', { type: 'image/png' }) as File & { path?: string }
    Object.defineProperty(droppedFile, 'path', {
      configurable: true,
      value: 'C:\\shots\\drop-image.png',
    })

    const [dropZone] = screen.getAllByLabelText('截图拖放区')

    fireEvent.drop(dropZone, {
      dataTransfer: {
        files: [droppedFile],
      },
    })

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: '截图已进入舞台' })).toBeInTheDocument()
    })

    expect(screen.getByText('C:\\shots\\drop-image.png')).toBeInTheDocument()
  })

  it('shows an export share card action after analysis finishes', async () => {
    mockCockpitBridge()
    window.cockpitShot.analyzeScreenshot = vi.fn().mockResolvedValue({
      roast: '这表情像刚开机的大脑。',
      summary: '一张过分平静的动漫角色截图。',
      titles: ['刚开机的大脑', '眼神在线情绪离线', '不是高冷是没加载完'],
    })

    vi.spyOn(FileReader.prototype, 'readAsDataURL').mockImplementation(function mockReadAsDataURL(this: FileReader) {
      Object.defineProperty(this, 'result', {
        configurable: true,
        value: 'data:image/png;base64,dragged-preview',
      })
      this.onload?.(new ProgressEvent('load'))
    })

    render(<App />)

    const droppedFile = new File(['demo'], 'drop-image.png', { type: 'image/png' }) as File & { path?: string }
    Object.defineProperty(droppedFile, 'path', {
      configurable: true,
      value: 'C:\\shots\\drop-image.png',
    })

    const [dropZone] = screen.getAllByLabelText('截图拖放区')
    fireEvent.drop(dropZone, {
      dataTransfer: {
        files: [droppedFile],
      },
    })

    const [analyzeButton] = screen.getAllByRole('button', { name: '开始分析' })
    fireEvent.click(analyzeButton)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '导出分享卡' })).toBeInTheDocument()
    })
  })
})
