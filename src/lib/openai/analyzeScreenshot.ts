import type { AnalysisRequest, AnalysisResult, RewriteMode } from '@/lib/contracts'

interface AnalysisPromptBundle {
  instructions: string
  userPrompt: string
}

const toneGuide: Record<AnalysisRequest['tone'], string> = {
  roast: '请用尖锐但带玩笑感的方式吐槽，像互联网嘴替，但不要低俗。',
  gentle: '请用温和、轻松、带一点幽默感的方式表达。',
  work: '请按工作复盘的语气来写，结论明确、重点清楚。',
}

const rewriteGuide: Record<RewriteMode, string> = {
  spicier: '请在不偏离图片内容的前提下，把吐槽再提一档，梗感更强一点。',
  shorter: '请整体压缩表达，让吐槽、总结和标题都更短更利落。',
  headline: '请保留意思不变，但把标题改得更有传播感、更像能拿去直接发出去的标题。',
}

export function buildAnalysisPrompt(request: AnalysisRequest): AnalysisPromptBundle {
  if (!request.imagePath.trim()) {
    throw new Error('Image path is required.')
  }

  const accountLine = request.activeEmail ? `当前 Codex 账号：${request.activeEmail}` : '当前 Codex 账号：未知'
  const basePrompt = [toneGuide[request.tone], accountLine]

  if (request.rewriteMode && request.previousResult) {
    return {
      instructions:
        '你必须只输出严格 JSON，不要输出 Markdown，不要输出额外解释。JSON 必须包含 roast、summary、titles 三个键。titles 必须是长度恰好为 3 的字符串数组。所有字段都必须使用简体中文表达。',
      userPrompt: [
        ...basePrompt,
        rewriteGuide[request.rewriteMode],
        '请参考这张截图和上一版结果，在同一语气下输出一版更适合直接分享的新结果。',
        `上一版一句吐槽：${request.previousResult.roast}`,
        `上一版正经总结：${request.previousResult.summary}`,
        `上一版分享标题：${request.previousResult.titles.join(' | ')}`,
      ].join('\n'),
    }
  }

  return {
    instructions:
      '你必须只输出严格 JSON，不要输出 Markdown，不要输出额外解释。JSON 必须包含 roast、summary、titles 三个键。titles 必须是长度恰好为 3 的字符串数组。所有字段都必须使用简体中文表达，即使截图内容是英文、日文或其他语言，也必须用简体中文总结和吐槽。',
    userPrompt: [...basePrompt, '请分析这张截图，抓住最显眼、最值得吐槽或总结的点来输出结果。'].join('\n'),
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
