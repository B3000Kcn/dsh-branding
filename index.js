import z from '@deepseek-ai/schemastery'
import { IMAGE_PATTERN, MAX_DATA_URL_LENGTH } from './src/images.js'
import { MIN_SCALE, MAX_SCALE, SCALE_STEP, DEFAULT_SCALE, MIN_OFFSET, MAX_OFFSET, OFFSET_STEP, DEFAULT_OFFSET } from './src/options.js'
import { installTitleShell } from './src/host/title-shell.js'

export const name = 'dsh-branding'
const image = () => z.string().max(MAX_DATA_URL_LENGTH).pattern(IMAGE_PATTERN).default('').volatile()
export const Config = z.object({
  favicon: image(),
  lightBanner: image(),
  darkBanner: image(),
  lightBannerScale: z.number().min(MIN_SCALE).max(MAX_SCALE).step(SCALE_STEP).default(DEFAULT_SCALE).volatile(),
  darkBannerScale: z.number().min(MIN_SCALE).max(MAX_SCALE).step(SCALE_STEP).default(DEFAULT_SCALE).volatile(),
  lightBannerOffset: z.number().min(MIN_OFFSET).max(MAX_OFFSET).step(OFFSET_STEP).default(DEFAULT_OFFSET).volatile(),
  darkBannerOffset: z.number().min(MIN_OFFSET).max(MAX_OFFSET).step(OFFSET_STEP).default(DEFAULT_OFFSET).volatile(),
  lightHeroScale: z.number().min(MIN_SCALE).max(MAX_SCALE).step(SCALE_STEP).default(DEFAULT_SCALE).volatile(),
  darkHeroScale: z.number().min(MIN_SCALE).max(MAX_SCALE).step(SCALE_STEP).default(DEFAULT_SCALE).volatile(),
  lightHeroOffset: z.number().min(MIN_OFFSET).max(MAX_OFFSET).step(OFFSET_STEP).default(DEFAULT_OFFSET).volatile(),
  darkHeroOffset: z.number().min(MIN_OFFSET).max(MAX_OFFSET).step(OFFSET_STEP).default(DEFAULT_OFFSET).volatile(),
  appName: z.string().max(120).default('').volatile(),
})
export const inject = ['settings']

/** Expose images through the authenticated, persistent DSH settings form. */
export function apply(ctx, config) {
  ctx.effect(() => ctx.settings.configure({ auto: false }, ctx.fiber))
  installTitleShell(ctx, config)
}
