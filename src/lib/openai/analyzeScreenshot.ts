import type { AnalysisRequest, AnalysisResult } from '@/lib/contracts'

interface AnalysisPromptBundle {
  instructions: string
  userPrompt: string
}

const toneGuide: Record<AnalysisRequest['tone'], string> = {
  roast: '请用尖锐但带玩笑感的方式吐槽，像互联网嘴替，但不要低俗。',
  gentle: '请用温和、轻松、带一点幽默感的方式表达。',
  work: '请按工作复盘的语气来写，结论明确、重点清楚。',
}

export function buildAnalysisPrompt(request: AnalysisRequest): AnalysisPromptBundle {
  if (!request.imagePath.trim()) {
    throw new Error('Image path is required.')
  }

  const accountLine = request.activeEmail ? `当前 Codex 账号：${request.activeEmail}` : '当前 Codex 账号：未知'

  return {
    instructions:
      '你必须只输出严格 JSON，不要输出 Markdown，不要输出额外解释。JSON 必须包含 roast、summary、titles 三个键。titles 必须是长度恰好为 3 的字符串数组。所有字段都必须使用简体中文表达，即使截图内容是英文、日文或其他语言，也必须用简体中文总结和吐槽。',
    userPrompt: [toneGuide[request.tone], accountLine, '请分析这张截图，抓住最显眼、最值得吐槽或总结的点来输出结果。'].join(
      '\n',
    ),
  }
}

export function parseAnalysisResponse(rawText: string): AnalysisResult {
  const parsed = JSON.parse(rawText) as Partial<AnalysisResult>

  if (
    typeof parsed.roast !== 'string' ||
    typeof parsed.summary !== 'string' ||
    !Array.isArray(parsed.titles) ||
    parsed.titles.length !== 3 ||
    parsed.titles.some((value) => typeof value !== 'string')
  ) {
    throw new Error('Model output did not match the expected roast JSON shape.')
  }

  return {
    roast: parsed.roast,
    summary: parsed.summary,
    titles: parsed.titles,
  }
}
