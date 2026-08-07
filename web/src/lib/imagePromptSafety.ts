import type { ImageGenProvider } from '@/api/types'

const PUBLIC_IMAGE_PROVIDERS = new Set<ImageGenProvider>(['openai', 'pollinations'])

const SOFTEN_RULES: Array<[RegExp, string]> = [
  [/\b(teen|teenage|schoolgirl|student girl|young girl|loli|childlike|minor-looking|underage)\b/gi, 'clearly adult woman'],
  [/\b(nude|naked|topless|bottomless|undressed)\b/gi, 'tastefully framed'],
  [/\b(transparent clothing|see-through clothing|wet transparent clothing|wardrobe malfunction)\b/gi, 'layered opaque clothing'],
  // 替换词不得含任何后续规则的触发词（如 intimate/explicit），否则会被二次改写
  [/\b(genitals?|penis|vagina|vulva|clitoris|nipples?|explicit breasts?)\b/gi, 'off-frame tasteful detail'],
  [/\b(sex|intercourse|penetration|oral sex|fellatio|cunnilingus|masturbat\w*)\b/gi, 'cinematic tension'],
  [/\b(orgasm|aroused|lustful|pornographic|erotic|seductive|provocative|sexy)\b/gi, 'restrained adult allure'],
  [/\b(cum|semen|saliva|bodily fluids?|wetness|slick|dripping)\b/gi, 'glossy highlights'],
  [/\b(panties|underwear|lingerie pulled aside|exposed underwear)\b/gi, 'delicate clothing details'],
  [/\b(body part close-?up|breast close-?up|thigh close-?up|hip close-?up|low angle body shot)\b/gi, 'balanced portrait composition'],
  [/\b(spread legs?|exposed skin)\b/gi, 'stable cinematic pose'],
  [/\b(NSFW|explicit adult content|graphic sexual content)\b/gi, 'dramatic cinematic mood'],
  [/\bsuggestive\b/gi, 'dramatic'],
  [/\bintimate\b/gi, 'private'],
  [/\bdanger\b/gi, 'tension'],
  [/\bwithout explicit detail\b/gi, 'with restrained framing'],
  [/\bexplicit\b/gi, 'restrained'],
  [/\bsheer\s+(dark\s+)?stockings?\b/gi, 'dark fashion tights'],
  [/\bstockings?\b/gi, 'fashion tights'],
  [/\bparted lips\b/gi, 'tense expression'],
  [/\bflushed\b/gi, 'warmly lit'],
  [/\bdisheveled\b/gi, 'wind-tossed'],
  [/\bfoot is abruptly pulled upward by an off-screen hand\b/gi, 'she loses balance in a sudden motion'],
  [/\bblack leather-shoed foot\b/gi, 'black leather shoe'],
]

const SAFETY_NEGATIVE = [
  'minor-looking',
  'childlike',
  'schoolgirl',
  'student uniform fetish',
  'explicit nudity',
  'genitalia',
  'pornographic content',
  'graphic sex acts',
  'body fluids',
  'underage',
  'transparent clothing',
  'wardrobe malfunction',
  'body-part close-up',
  'low-angle fetish shot',
  'vulgar pose',
]

export function shouldSoftenImagePrompt(provider: ImageGenProvider): boolean {
  return PUBLIC_IMAGE_PROVIDERS.has(provider)
}

export function softenNsfwForImageModel(prompt: string): string {
  let text = String(prompt || '')
  // 单遍语义：先用占位符保护每条规则的产出，全部规则跑完再回填，
  // 后面的规则只能匹配原文，不能改写前面规则的替换词。
  const produced: string[] = []
  for (const [pattern, replacement] of SOFTEN_RULES) {
    text = text.replace(pattern, () => {
      const token = `\uE000${produced.length}\uE000`
      produced.push(replacement)
      return token
    })
  }
  text = text.replace(/\uE000(\d+)\uE000/g, (_, index: string) => produced[Number(index)])
  return text
    .replace(/\s+,/g, ',')
    .replace(/,\s*,/g, ',')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

export function softenImagePromptForProvider(prompt: string, provider: ImageGenProvider): string {
  return shouldSoftenImagePrompt(provider) ? softenNsfwForImageModel(prompt) : prompt
}

export function addImageSafetyNegative(negativePrompt: string, provider: ImageGenProvider): string {
  if (!shouldSoftenImagePrompt(provider)) return negativePrompt
  const existing = String(negativePrompt || '').trim()
  const lower = existing.toLowerCase()
  const extra = SAFETY_NEGATIVE.filter((term) => !lower.includes(term.toLowerCase()))
  return [existing, extra.join(', ')].filter(Boolean).join(', ')
}
