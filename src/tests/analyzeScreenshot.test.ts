import { describe, expect, it } from 'vitest'
import { buildAnalysisPrompt, parseAnalysisResponse } from '@/lib/openai/analyzeScreenshot'

describe('buildAnalysisPrompt', () => {
  it('forces simplified Chinese output and includes the active codex account', () => {
    const result = buildAnalysisPrompt({
      imagePath: 'C:\\shots\\demo.png',
      tone: 'work',
      activeEmail: 'worker@example.com',
    })

    expect(result.instructions).toContain('简体中文')
    expect(result.userPrompt).toContain('worker@example.com')
    expect(result.userPrompt).toContain('工作复盘')
  })
})

describe('parseAnalysisResponse', () => {
  it('extracts roast output from valid JSON text', () => {
    const result = parseAnalysisResponse(
      '{"roast":"Too many tabs open.","summary":"A cluttered productivity dashboard.","titles":["Tab chaos","Desk report","Context overload"]}',
    )

    expect(result).toEqual({
      roast: 'Too many tabs open.',
      summary: 'A cluttered productivity dashboard.',
      titles: ['Tab chaos', 'Desk report', 'Context overload'],
    })
  })
})
