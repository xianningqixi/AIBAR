import type { ImageGenProvider } from '@/api/types'

const PUBLIC_IMAGE_PROVIDERS = new Set<ImageGenProvider>(['openai', 'pollinations'])

const SOFTEN_RULES: Array<[RegExp, string]> = [
  [/\b(nude|naked|topless|bottomless|undressed)\b/gi, 'tastefully framed'],
  [/\b(genitals?|penis|vagina|vulva|clitoris|nipples?|explicit breasts?)\b/gi, 'off-frame intimate detail'],
  [/\b(sex|intercourse|penetration|oral sex|fellatio|cunnilingus|masturbat\w*)\b/gi, 'intimate tension'],
  [/\b(orgasm|aroused|lustful|pornographic|erotic)\b/gi, 'charged emotion'],
  [/\b(cum|semen|saliva|bodily fluids?|wetness|slick|dripping)\b/gi, 'glossy highlights'],
  [/\b(panties|underwear|lingerie pulled aside|exposed underwear)\b/gi, 'delicate clothing details'],
  [/\b(spread legs?|exposed skin)\b/gi, 'dramatic pose'],
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
  'explicit nudity',
  'genitalia',
  'pornographic content',
  'graphic sex acts',
  'body fluids',
  'underage',
]

export function shouldSoftenImagePrompt(provider: ImageGenProvider): boolean {
  return PUBLIC_IMAGE_PROVIDERS.has(provider)
}

export function softenNsfwForImageModel(prompt: string): string {
  let text = String(prompt || '')
  for (const [pattern, replacement] of SOFTEN_RULES) {
    text = text.replace(pattern, replacement)
  }
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
