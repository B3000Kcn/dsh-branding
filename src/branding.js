import { createFavicon } from './favicon.js'
import { createSidebarMark } from './mark.js'
import { createHeroBanner } from './hero.js'
import { isImageData } from './images.js'
import { STYLES, scaleStyles, heroScaleStyles } from './styles.js'
import { DEFAULT_SCALE, isBannerScale, DEFAULT_OFFSET, isBannerOffset } from './options.js'

/** Coordinate accepted settings, actual DSH theme, and reversible browser effects. */
export function installBranding({ ctx, React, document, form }) {
  const favicon = createFavicon(document)
  const style = document.createElement('style')
  const listeners = new Set()
  let warning = ''
  let bannerUrl = ''
  let bannerGeneration = 0
  let removeBanner
  const report = (message, expected) => {
    if (expected !== undefined && warning !== expected) return
    if (message === warning) return
    warning = message
    for (const listener of listeners) listener()
  }
  const mark = createSidebarMark({ ctx, React, report })
  const hero = createHeroBanner({ ctx, React, report })
  function sync() {
    const state = form.getSnapshot()
    const config = state.status === 'ready' ? state.value : undefined
    const icon = config?.favicon ?? ''
    const key = ctx.theme.getTheme().active.colorScheme === 'dark' ? 'darkBanner' : 'lightBanner'
    const heroKey = key === 'darkBanner' ? 'darkHero' : 'lightHero'
    const banner = config?.[key] ?? ''
    const scale = config?.[`${key}Scale`] ?? DEFAULT_SCALE
    const offset = config?.[`${key}Offset`] ?? DEFAULT_OFFSET
    const heroScale = config?.[`${heroKey}Scale`] ?? DEFAULT_SCALE
    const heroOffset = config?.[`${heroKey}Offset`] ?? DEFAULT_OFFSET
    const validHero = isImageData(banner) && isBannerScale(heroScale) && isBannerOffset(heroOffset)
    const valid = isImageData(icon) && isImageData(banner) && isBannerScale(scale) && isBannerOffset(offset) && validHero
    const css = STYLES + scaleStyles(isBannerScale(scale) ? scale : DEFAULT_SCALE, isBannerOffset(offset) ? offset : DEFAULT_OFFSET)
      + heroScaleStyles(isBannerScale(heroScale) ? heroScale : DEFAULT_SCALE, isBannerOffset(heroOffset) ? heroOffset : DEFAULT_OFFSET)
    if (style.textContent !== css) style.textContent = css
    favicon.set(isImageData(icon) ? icon : '')
    mark.set(isImageData(icon) ? icon : '')
    const next = isImageData(banner) && isBannerScale(scale) && isBannerOffset(offset) ? banner : ''
    if (next !== bannerUrl) {
      const epoch = ++bannerGeneration
      removeBanner?.()
      removeBanner = undefined
      bannerUrl = next
      report('')
      if (next) {
        const Banner = () => React.createElement('img', {
          className: 'dsh-branding-banner', src: next, alt: '', draggable: false,
          onError: () => {
            if (epoch !== bannerGeneration) return
            bannerGeneration++
            removeBanner?.()
            removeBanner = undefined
            bannerUrl = ''
            report('横幅无法加载，已恢复原图，请重新上传。')
          },
        })
        try {
          removeBanner = ctx.slots.inject('sidebar.brand.name', () => ctx.slots.register({
            name: 'sidebar.brand.name', priority: -1,
          }, Banner))
        } catch (error) {
          bannerUrl = ''
          report(`横幅插槽不可用：${error.message}`)
        }
      }
    }
    hero.set(validHero ? banner : '')
    if (!valid) report('品牌配置无效，已恢复对应的原图，请检查图片、缩放和位移设置。')
    else if (warning.startsWith('品牌配置无效')) report('')
  }
  ctx.effect(() => {
    style.textContent = STYLES
    document.head.append(style)
    return () => style.remove()
  })
  ctx.effect(() => form.subscribe(sync))
  ctx.on('theme/change', sync)
  ctx.effect(() => () => { bannerGeneration++; removeBanner?.(); hero.dispose(); mark.dispose(); favicon.dispose(); listeners.clear() })
  sync()
  return {
    subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener) },
    getSnapshot: () => warning,
  }
}
