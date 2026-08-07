import { describe, expect, it } from 'vitest'
import {
  addImageSafetyNegative,
  shouldSoftenImagePrompt,
  softenImagePromptForProvider,
  softenNsfwForImageModel,
} from './imagePromptSafety'

describe('shouldSoftenImagePrompt', () => {
  it('softens only for public image providers', () => {
    expect(shouldSoftenImagePrompt('openai')).toBe(true)
    expect(shouldSoftenImagePrompt('pollinations')).toBe(true)
    expect(shouldSoftenImagePrompt('novel')).toBe(false)
    expect(shouldSoftenImagePrompt('horde')).toBe(false)
    expect(shouldSoftenImagePrompt('auto')).toBe(false)
  })
})

describe('softenNsfwForImageModel', () => {
  it('rewrites age-ambiguous terms to a clearly adult subject', () => {
    expect(softenNsfwForImageModel('a schoolgirl in uniform')).toBe('a clearly adult woman in uniform')
    expect(softenNsfwForImageModel('young girl portrait')).toBe('clearly adult woman portrait')
    expect(softenNsfwForImageModel('underage look')).toBe('clearly adult woman look')
  })

  it('rewrites explicit nudity and acts into safe visual language', () => {
    expect(softenNsfwForImageModel('nude on the bed')).toBe('tastefully framed on the bed')
    expect(softenNsfwForImageModel('implied sex scene')).toBe('implied cinematic tension scene')
    expect(softenNsfwForImageModel('NSFW atmosphere')).toBe('dramatic cinematic mood atmosphere')
    expect(softenNsfwForImageModel('seductive gaze')).toBe('restrained adult allure gaze')
  })

  it('is case-insensitive and respects word boundaries', () => {
    expect(softenNsfwForImageModel('NUDE portrait')).toBe('tastefully framed portrait')
    expect(softenNsfwForImageModel('denuded trees in winter')).toBe('denuded trees in winter')
    expect(softenNsfwForImageModel('a dangerous road')).toBe('a dangerous road')
    expect(softenNsfwForImageModel('danger ahead')).toBe('tension ahead')
  })

  it('applies the more specific rule before the generic one', () => {
    expect(softenNsfwForImageModel('sheer stockings')).toBe('dark fashion tights')
    expect(softenNsfwForImageModel('sheer dark stockings')).toBe('dark fashion tights')
    expect(softenNsfwForImageModel('black stockings')).toBe('black fashion tights')
    expect(softenNsfwForImageModel('without explicit detail')).toBe('with restrained framing')
    expect(softenNsfwForImageModel('explicit lighting notes')).toBe('restrained lighting notes')
  })

  it('does not rewrite the output of an earlier rule with a later rule', () => {
    // 占位符保护：规则 4 的产出不会再被 \bintimate\b 规则二次改写
    expect(softenNsfwForImageModel('genitals visible')).toBe('off-frame tasteful detail visible')
    expect(softenNsfwForImageModel('an intimate moment')).toBe('an private moment')
  })

  it('cleans up whitespace and comma artifacts after replacement', () => {
    expect(softenNsfwForImageModel('nude ,  cinematic')).toBe('tastefully framed, cinematic')
    expect(softenNsfwForImageModel('  spaced   out  ')).toBe('spaced out')
  })

  it('leaves safe prompts unchanged', () => {
    const safe = 'a mature adult woman in a tailored coat, soft window light, shallow depth of field'
    expect(softenNsfwForImageModel(safe)).toBe(safe)
    expect(softenNsfwForImageModel('')).toBe('')
  })

  it('is idempotent: a second pass does not transform the output again', () => {
    const prompt = [
      'nude teen schoolgirl, seductive and intimate, NSFW, sheer stockings,',
      'genitals, spread legs, parted lips, flushed, disheveled, explicit close view',
    ].join(' ')
    const once = softenNsfwForImageModel(prompt)
    const twice = softenNsfwForImageModel(once)

    expect(twice).toBe(once)
    expect(once).not.toMatch(/nude|teen|schoolgirl|seductive|intimate|NSFW|stockings|genitals|explicit/i)
  })
})

describe('softenImagePromptForProvider', () => {
  it('softens for public providers and passes through for local ones', () => {
    expect(softenImagePromptForProvider('nude portrait', 'openai')).toBe('tastefully framed portrait')
    expect(softenImagePromptForProvider('nude portrait', 'pollinations')).toBe('tastefully framed portrait')
    expect(softenImagePromptForProvider('nude portrait', 'novel')).toBe('nude portrait')
    expect(softenImagePromptForProvider('nude portrait', 'horde')).toBe('nude portrait')
  })
})

describe('addImageSafetyNegative', () => {
  it('returns the negative prompt untouched for non-public providers', () => {
    expect(addImageSafetyNegative('lowres', 'novel')).toBe('lowres')
    expect(addImageSafetyNegative('', 'horde')).toBe('')
  })

  it('appends the full safety list to an empty negative prompt without a leading comma', () => {
    const merged = addImageSafetyNegative('', 'openai')
    expect(merged.startsWith('minor-looking, childlike, schoolgirl')).toBe(true)
    expect(merged.endsWith('vulgar pose')).toBe(true)
    expect(merged).toContain('explicit nudity')
    expect(merged).toContain('underage')
  })

  it('keeps the existing negative prompt in front of the appended terms', () => {
    const merged = addImageSafetyNegative('lowres, blurry', 'pollinations')
    expect(merged.startsWith('lowres, blurry, minor-looking')).toBe(true)
  })

  it('skips terms already present, matching case-insensitively', () => {
    const merged = addImageSafetyNegative('UNDERAGE, Childlike, lowres', 'openai')
    expect(merged.match(/underage/gi)).toHaveLength(1)
    expect(merged.match(/childlike/gi)).toHaveLength(1)
    expect(merged).toContain('minor-looking')
  })

  it('matches by substring, so an embedded mention also suppresses the term', () => {
    const merged = addImageSafetyNegative('no underage-looking faces', 'openai')
    expect(merged.match(/underage/gi)).toHaveLength(1)
  })

  it('is idempotent: applying it twice adds nothing new', () => {
    const once = addImageSafetyNegative('lowres, blurry', 'openai')
    expect(addImageSafetyNegative(once, 'openai')).toBe(once)

    const fromEmpty = addImageSafetyNegative('', 'openai')
    expect(addImageSafetyNegative(fromEmpty, 'openai')).toBe(fromEmpty)
  })
})
