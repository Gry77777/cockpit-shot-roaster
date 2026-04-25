import { describe, expect, it } from 'vitest'
import { buildShareCardSvg } from '@/lib/shareCard/shareCard'

describe('buildShareCardSvg', () => {
  it('includes the screenshot, Chinese copy, titles, and account identity', () => {
    const svg = buildShareCardSvg({
      previewDataUrl: 'data:image/png;base64,preview-demo',
      toneLabel: '毒舌',
      accountEmail: 'demo@codex.dev',
      roast: '这张图像刚开机的大脑。',
      summary: '主角表情很平，平到有点好笑。',
      titles: ['刚开机的表情', '眼神在线情绪离线', '不是高冷是没加载完'],
    })

    expect(svg).toContain('截图吐槽机')
    expect(svg).toContain('这张图像刚开机的大脑。')
    expect(svg).toContain('demo@codex.dev')
    expect(svg).toContain('眼神在线情绪离线')
    expect(svg).toContain('data:image/png;base64,preview-demo')
  })
})
