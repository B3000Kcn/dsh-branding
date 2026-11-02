/* Generated from src/. */
window.__ModuleLoader__.load({id:'dsh-branding',factory(require){
const factories={"src/client.js":function(local) {
const { installBranding } = local("src/branding.js");

const { installSettings } = local("src/settings.js");

const { installTabTitle } = local("src/title.js");

/** Standalone Web plugin for the host's favicon and sidebar banners. */
function makePlugin(require) {
  const React = require('react')
  return {
    inject: ['slots', 'configForms', 'theme', 'sessions', 'layout'],
    apply(ctx) {
      const form = ctx.configForms.get('dsh-branding')
      const status = installBranding({ ctx, React, document, form })
      ctx.effect(() => installTabTitle({ ctx, document, form }))
      installSettings({ ctx, React, form, status })
    },
  }
}

return {makePlugin};
},
"src/branding.js":function(local) {
const { createFavicon } = local("src/favicon.js");

const { createSidebarMark } = local("src/mark.js");

const { createHeroBanner } = local("src/hero.js");

const { isImageData } = local("src/images.js");

const { STYLES, scaleStyles, heroScaleStyles } = local("src/styles.js");

const { DEFAULT_SCALE, isBannerScale, DEFAULT_OFFSET, isBannerOffset } = local("src/options.js");

/** Coordinate accepted settings, actual DSH theme, and reversible browser effects. */
function installBranding({ ctx, React, document, form }) {
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

return {installBranding};
},
"src/favicon.js":function(local) {
/** Temporarily replace every native tab icon and restore the same nodes on clear/unload. */
function createFavicon(document) {
  let custom
  let originals = []
  function restore() {
    custom?.remove()
    custom = undefined
    for (const { node, anchor } of originals) {
      if (anchor.parentNode) anchor.replaceWith(node)
    }
    originals = []
  }
  return {
    set(url) {
      if (!url) { restore(); return }
      if (!custom) {
        originals = [...document.head.querySelectorAll('link')]
          .filter(node => node.rel.toLowerCase().split(/\s+/).includes('icon'))
          .map(node => {
            const anchor = document.createComment('dsh-branding: original favicon')
            node.replaceWith(anchor)
            return { node, anchor }
          })
        custom = document.createElement('link')
        custom.rel = 'icon'
        custom.dataset.dshBranding = ''
        document.head.append(custom)
      }
      custom.type = url.slice(5, url.indexOf(';'))
      if (custom.href !== url) custom.href = url
    },
    dispose: restore,
  }
}

return {createFavicon};
},
"src/mark.js":function(local) {
/** Use the configured favicon in native sidebar mark slots without changing their controls. */
function createSidebarMark({ ctx, React, report }) {
  let current = ''
  let remove
  let generation = 0
  function dispose() {
    generation++
    remove?.()
    remove = undefined
    current = ''
  }
  return {
    set(url) {
      if (url === current) return
      dispose()
      current = url
      if (!url) return
      const epoch = generation
      const Mark = ({ size = 24 } = {}) => React.createElement('img', {
        className: 'dsh-branding-mark', src: url, alt: '', draggable: false,
        width: size, height: size,
        onError: () => {
          if (epoch !== generation) return
          dispose()
          report('侧栏图标无法加载，已恢复原图，请重新上传 favicon。')
        },
      })
      try {
        remove = ctx.slots.inject('sidebar.brand.mark', () => {
          try {
            return ctx.slots.register({ name: 'sidebar.brand.mark', priority: -1 }, Mark)
          } catch (error) {
            report(`侧栏图标插槽不可用：${error.message}`)
            return () => {}
          }
        })
      } catch (error) {
        dispose()
        report(`侧栏图标插槽不可用：${error.message}`)
      }
    },
    dispose,
  }
}

return {createSidebarMark};
},
"src/hero.js":function(local) {
/** Replace native hero artwork while the VCP Agent portal owns its visible occurrence. */
function createHeroBanner({ ctx, React, report }) {
  let current = ''
  let remove
  let generation = 0
  let failure = ''
  const fail = message => { failure = message; report(message) }
  const clearFailure = () => { if (failure) { report('', failure); failure = '' } }
  function dispose() {
    generation++
    remove?.()
    remove = undefined
    current = ''
  }
  return {
    set(url) {
      if (!url) clearFailure()
      if (url === current) return
      dispose()
      current = url
      if (!url) return
      const epoch = generation
      const Banner = () => React.createElement('img', {
        className: 'dsh-branding-hero-banner', src: url, alt: '', draggable: false,
        onLoad: () => { if (epoch === generation) clearFailure() },
        onError: () => {
          if (epoch !== generation) return
          dispose()
          fail('主界面横幅无法加载，已恢复原图，请重新上传。')
        },
      })
      try {
        remove = ctx.slots.inject('conversation.hero.brand.mark', () => {
          try {
            return ctx.slots.register({ name: 'conversation.hero.brand.mark', priority: -1 }, Banner)
          } catch (error) {
            fail(`主界面横幅插槽不可用：${error.message}`)
            return () => {}
          }
        })
      } catch (error) {
        dispose()
        fail(`主界面横幅插槽不可用：${error.message}`)
      }
    },
    dispose,
  }
}

return {createHeroBanner};
},
"src/images.js":function(local) {
/** Uploaded images stay in the settings document, without external asset routes. */
const MAX_FILE_BYTES = 512 * 1024
const MAX_DATA_URL_LENGTH = Math.ceil(MAX_FILE_BYTES / 3) * 4 + 80
const IMAGE_PATTERN = /^(?:|data:image\/(?:png|jpeg|webp|gif|svg\+xml|x-icon|vnd\.microsoft\.icon);base64,[A-Za-z0-9+/]+={0,2})$/
const IMAGE_ACCEPT = 'image/png,image/jpeg,image/webp,image/gif,image/svg+xml,image/x-icon,image/vnd.microsoft.icon,.ico'

/** Check persisted image data before assigning it to an image or favicon URL. */
function isImageData(value) {
  return typeof value === 'string' && value.length <= MAX_DATA_URL_LENGTH && IMAGE_PATTERN.test(value)
}

/** Read and decode an upload without inserting its contents as HTML or SVG markup. */
async function readImage(file, env = globalThis) {
  if (!file || file.size <= 0 || file.size > MAX_FILE_BYTES) throw new Error('请选择不超过 512 KiB 的图片。')
  let type = file.type.toLowerCase()
  if (!type && /\.ico$/i.test(file.name)) type = 'image/x-icon'
  if (!/^image\/(?:png|jpeg|webp|gif|svg\+xml|x-icon|vnd\.microsoft\.icon)$/.test(type)) {
    throw new Error('支持 PNG、JPEG、WebP、GIF、SVG 和 ICO。')
  }
  const data = await new Promise((resolve, reject) => {
    const reader = new env.FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(new Error('读取图片失败。'))
    reader.onabort = () => reject(new Error('读取图片已取消。'))
    reader.readAsDataURL(file)
  })
  // Some browsers omit the MIME type of ICO files in FileReader output.
  const url = typeof data === 'string' ? data.replace(/^data:[^;,]*;base64,/, `data:${type};base64,`) : ''
  if (!isImageData(url) || !url) throw new Error('图片数据无效或过大。')
  await new Promise((resolve, reject) => {
    const picture = new env.Image()
    picture.onload = () => {
      const width = picture.naturalWidth
      const height = picture.naturalHeight
      if (width <= 0 || height <= 0 || width > 16384 || height > 16384 || width * height > 32 * 1024 * 1024) {
        reject(new Error('图片尺寸无效或过大，请缩小后重试。'))
      } else resolve()
    }
    picture.onerror = () => reject(new Error('图片无法解码，请更换文件。'))
    picture.src = url
  })
  return url
}

return {MAX_FILE_BYTES,MAX_DATA_URL_LENGTH,IMAGE_PATTERN,IMAGE_ACCEPT,isImageData,readImage};
},
"src/styles.js":function(local) {
const bannerPath = '[data-slot="sidebar.brand.name"] > .dsh-branding-banner'
const bannerRow = `[data-window-drag]:has(> :is(button, span) > span > span > ${bannerPath})`
// Agent heroes live beside the brand anchor. Its hidden image must not alter their layout.
const heroBox = 'span:has(> [data-slot="conversation.hero.brand.mark"] > .dsh-branding-hero-banner):not(:has(> .dsh-vcp-agent-portal > .dsh-vcp-agent-hero))'

const STYLES = `
/* Hide the adjacent native mark only while our full banner occupies the name slot.
   The collapsed rail has no name slot and retains its native expand control. */
span:has(> [data-slot="sidebar.brand.mark"]):has(+ span > [data-slot="sidebar.brand.name"] > .dsh-branding-banner) { display: none; }
/* Center in the space remaining after the native toggle, including its caption-row variant. */
${bannerRow} { --dsh-branding-base-height: 60px; position: relative; height: calc(var(--dsh-branding-base-height) * max(1, var(--dsh-branding-scale, 1))); }
html[data-windows-titlebar] ${bannerRow} { --dsh-branding-base-height: 40px; }
${bannerRow} > :is(button, span):first-child { position: absolute; inset: 0 36px 0 0; height: auto; padding: 0; display: flex; align-items: center; justify-content: center; overflow: hidden; transform: translateX(var(--dsh-branding-offset, 0px)); }
${bannerRow}:not(:has(> :is(button, span):first-child + button)) > :is(button, span):first-child { inset: 0; }
html[data-windows-titlebar] ${bannerRow} > :is(button, span):first-child { inset: 0 0 0 36px; }
${bannerRow} > :is(button, span):first-child > span { width: 100%; height: 100%; justify-content: center; gap: 0; transform: none; }
${bannerRow} > :is(button, span):first-child > span > span:has(> ${bannerPath}) { width: 100%; height: 100%; justify-content: center; }
.dsh-branding-banner { display: block; width: 100%; height: var(--dsh-branding-base-height); flex: none; min-width: 0; max-width: none; object-fit: contain; object-position: center; transform: scale(var(--dsh-branding-scale, 1)); pointer-events: none; }
.dsh-branding-mark { display: block; flex: none; object-fit: contain; pointer-events: none; }
${heroBox} { width: min(480px, 100%); min-width: 0; height: calc(80px * max(1, var(--dsh-branding-hero-scale, 1))); overflow: hidden; }
${heroBox} + span { display: none; }
.dsh-branding-hero-banner { display: block; width: 100%; height: 80px; flex: none; object-fit: contain; object-position: center; transform: translateX(var(--dsh-branding-hero-offset, 0px)) scale(var(--dsh-branding-hero-scale, 1)); pointer-events: none; }
.dsh-branding-settings { display: grid; gap: 16px; color: var(--dsw-alias-label-primary); }
.dsh-branding-settings h3, .dsh-branding-settings p { margin: 0; }
.dsh-branding-settings fieldset { display: grid; gap: 10px; min-width: 0; border: 1px solid var(--dsw-alias-border-l2); border-radius: 8px; padding: 12px; }
.dsh-branding-preview { display: flex; align-items: center; justify-content: center; min-height: 72px; padding: 12px; border-radius: 6px; overflow: hidden; }
.dsh-branding-preview img { display: block; max-width: 100%; max-height: 120px; width: auto; height: auto; object-fit: contain; }
.dsh-branding-preview[data-scheme="light"] { background: #f7f8fa; color: #242629; }
.dsh-branding-preview[data-scheme="dark"] { background: #202225; color: #e5e7eb; }
.dsh-branding-actions { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; }
.dsh-branding-settings input[type="text"] { width: 100%; box-sizing: border-box; }
.dsh-branding-settings [role="alert"] { color: var(--dsw-alias-status-warning-foreground, #c66a13); }
`

/** Apply the selected mode's validated zoom and pixel offset. */
function scaleStyles(scale, offset = 0) {
  return `${bannerRow} { --dsh-branding-scale: ${scale / 100}; --dsh-branding-offset: ${offset}px; }`
}

/** Hero positioning is independent of sidebar positioning, including on theme changes. */
function heroScaleStyles(scale, offset = 0) {
  return `${heroBox} { --dsh-branding-hero-scale: ${scale / 100}; --dsh-branding-hero-offset: ${offset}px; }`
}

return {STYLES,scaleStyles,heroScaleStyles};
},
"src/options.js":function(local) {
/** Banner zoom is persisted as a percentage in ten-point steps. */
const SCALE_STEP = 10
const MIN_SCALE = 10
const MAX_SCALE = 300
const DEFAULT_SCALE = 100

/** Horizontal offsets use screen pixels independently of banner zoom. */
const OFFSET_STEP = 5
const MIN_OFFSET = -200
const MAX_OFFSET = 200
const DEFAULT_OFFSET = 0

/** Check percentages read from the settings transport before using them in CSS. */
function isBannerScale(value) {
  return Number.isInteger(value) && value >= MIN_SCALE && value <= MAX_SCALE && value % SCALE_STEP === 0
}

/** Check persisted offsets before assigning them to the banner's CSS translation. */
function isBannerOffset(value) {
  return Number.isInteger(value) && value >= MIN_OFFSET && value <= MAX_OFFSET && value % OFFSET_STEP === 0
}

return {SCALE_STEP,MIN_SCALE,MAX_SCALE,DEFAULT_SCALE,OFFSET_STEP,MIN_OFFSET,MAX_OFFSET,DEFAULT_OFFSET,isBannerScale,isBannerOffset};
},
"src/settings.js":function(local) {
const { IMAGE_ACCEPT, readImage } = local("src/images.js");

const { DEFAULT_SCALE, MIN_SCALE, MAX_SCALE, SCALE_STEP, DEFAULT_OFFSET, MIN_OFFSET, MAX_OFFSET, OFFSET_STEP } = local("src/options.js");

/** Register image uploads, independent clear actions, and previews in a dedicated page. */
function installSettings({ ctx, React, form, status }) {
  const h = React.createElement
  const fields = [
    ['favicon', '网页 favicon', 'light'],
    ['lightBanner', '日间横幅', 'light', 'lightHero', '日间主界面横幅'],
    ['darkBanner', '夜间横幅', 'dark', 'darkHero', '夜间主界面横幅'],
  ]
  function TitleInput({ value, onSave, disabled }) {
    const [draft, setDraft] = React.useState(value)
    React.useEffect(() => { setDraft(value) }, [value])
    return h('input', { type: 'text', maxLength: 120, value: draft, disabled,
      placeholder: '留空使用 dsh 原名称', 'aria-label': '标签页应用名称',
      onChange: event => setDraft(event.target.value),
      onBlur: () => { if (draft !== value) onSave(draft) },
      onKeyDown: event => { if (event.key === 'Enter') { event.preventDefault(); event.currentTarget.blur() } },
    })
  }
  function Settings() {
    const state = React.useSyncExternalStore(listener => form.subscribe(listener), () => form.getSnapshot())
    const warning = React.useSyncExternalStore(status.subscribe, status.getSnapshot)
    const [busy, setBusy] = React.useState(false)
    const [message, setMessage] = React.useState('')
    const mounted = React.useRef(false)
    const pending = React.useRef(false)
    React.useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
    async function saveValue(key, resolveValue) {
      if (pending.current) return
      const before = form.getSnapshot()
      if (before.status !== 'ready' || !before.writable) return
      pending.current = true
      setBusy(true)
      setMessage('')
      try {
        const value = await resolveValue(before.value)
        if (!mounted.current) return
        const accepted = await form.mutate([{ op: 'set', path: [key], value }], before.revision)
        if (mounted.current) setMessage(accepted ? '已保存。' : '未保存，配置可能已被其他页面修改或当前无写入权限，请重试。')
      } catch (error) {
        if (mounted.current) setMessage(error.message || String(error))
      } finally {
        pending.current = false
        if (mounted.current) setBusy(false)
      }
    }
    const save = (key, file) => saveValue(key, () => file ? readImage(file) : '')
    return h('section', { className: 'dsh-branding-settings' },
      h('h3', null, '品牌设置'),
      h('p', null, '未设置的项目保留 dsh 原图。自定义 favicon 同时用于标签页和侧栏顶部图标。横幅跟随 dsh 实际日夜模式，各自独立；支持 PNG、JPEG、WebP、GIF、SVG、ICO，单张最多 512 KiB。'),
      h('p', null, '侧栏横幅默认在扣除侧栏按钮占位后的区域居中，非 VCP 主界面的横幅使用相同图片。两处可按日夜模式分别以 10% 步进缩放、5px 步进左右移动。超出侧栏的部分会裁切。设置保存到当前 DSH 宿主，连接同一宿主的浏览器共享。'),
      state.status === 'ready' && state.value && h('fieldset', { disabled: busy || !state.writable },
        h('legend', null, '标签页应用名称'),
        h(TitleInput, { value: state.value.appName ?? '', disabled: busy || !state.writable,
          onSave: value => { void saveValue('appName', () => value) } }),
        h('p', null, '失去焦点或按 Enter 保存。所有 dsh 页面均生效：主页显示自定义名称，选中话题后显示“话题名称 — 自定义名称”。留空恢复原名称。')),
      state.status !== 'ready' || !state.value
        ? h('p', { role: 'status' }, state.status === 'unavailable' ? '插件配置不可用，请检查连接和插件状态。' : '正在读取配置…')
        : fields.map(([key, label, scheme, heroKey, heroLabel]) => h('fieldset', { key, disabled: busy || !state.writable },
          h('legend', null, label),
          h('div', { className: 'dsh-branding-preview', 'data-scheme': scheme,
            style: key === 'favicon' ? undefined : { height: Math.max(72, 60 * (state.value[`${key}Scale`] ?? DEFAULT_SCALE) / 100) } },
            state.value[key] ? h('img', { src: state.value[key], alt: `${label}预览`,
              style: key === 'favicon' ? { width: 32, height: 32 }
                : { width: '100%', height: 60, maxHeight: 'none', transform: `translateX(${state.value[`${key}Offset`] ?? DEFAULT_OFFSET}px) scale(${(state.value[`${key}Scale`] ?? DEFAULT_SCALE) / 100})` },
            }) : h('span', null, '未设置，使用 dsh 原图')),
          h('div', { className: 'dsh-branding-actions' },
            h('label', null, '上传图片 ', h('input', { type: 'file', accept: IMAGE_ACCEPT, onChange: event => {
              const file = event.target.files?.[0]
              event.target.value = ''
              if (file) void save(key, file)
            } })),
            h('button', { type: 'button', disabled: !state.value[key], onClick: () => { void save(key) } }, '清空，恢复原图')),
          key !== 'favicon' && h('div', { className: 'dsh-branding-actions' },
            h('span', null, '侧栏横幅缩放'),
            h('button', { type: 'button', 'aria-label': `${label}缩小`,
              disabled: (state.value[`${key}Scale`] ?? DEFAULT_SCALE) <= MIN_SCALE,
              onClick: () => { void saveValue(`${key}Scale`, value => Math.max(MIN_SCALE, (value[`${key}Scale`] ?? DEFAULT_SCALE) - SCALE_STEP)) },
            }, '−'),
            h('output', { 'aria-label': `${label}缩放比例` }, `${state.value[`${key}Scale`] ?? DEFAULT_SCALE}%`),
            h('button', { type: 'button', 'aria-label': `${label}放大`,
              disabled: (state.value[`${key}Scale`] ?? DEFAULT_SCALE) >= MAX_SCALE,
              onClick: () => { void saveValue(`${key}Scale`, value => Math.min(MAX_SCALE, (value[`${key}Scale`] ?? DEFAULT_SCALE) + SCALE_STEP)) },
            }, '＋'),
            h('button', { type: 'button', onClick: () => { void saveValue(`${key}Scale`, () => DEFAULT_SCALE) } }, '重置为 100%')),
          key !== 'favicon' && h('div', { className: 'dsh-branding-actions' },
            h('span', null, '侧栏左右位移'),
            h('button', { type: 'button', 'aria-label': `${label}左移`,
              disabled: (state.value[`${key}Offset`] ?? DEFAULT_OFFSET) <= MIN_OFFSET,
              onClick: () => { void saveValue(`${key}Offset`, value => Math.max(MIN_OFFSET, (value[`${key}Offset`] ?? DEFAULT_OFFSET) - OFFSET_STEP)) },
            }, '←'),
            h('output', { 'aria-label': `${label}水平位移` }, `${(state.value[`${key}Offset`] ?? DEFAULT_OFFSET) > 0 ? '+' : ''}${state.value[`${key}Offset`] ?? DEFAULT_OFFSET}px`),
            h('button', { type: 'button', 'aria-label': `${label}右移`,
              disabled: (state.value[`${key}Offset`] ?? DEFAULT_OFFSET) >= MAX_OFFSET,
              onClick: () => { void saveValue(`${key}Offset`, value => Math.min(MAX_OFFSET, (value[`${key}Offset`] ?? DEFAULT_OFFSET) + OFFSET_STEP)) },
            }, '→'),
            h('button', { type: 'button', onClick: () => { void saveValue(`${key}Offset`, () => DEFAULT_OFFSET) } }, '重置居中')),
          key !== 'favicon' && h('div', { className: 'dsh-branding-actions' },
            h('span', null, '主界面横幅缩放'),
            h('button', { type: 'button', 'aria-label': `${heroLabel}缩小`,
              disabled: (state.value[`${heroKey}Scale`] ?? DEFAULT_SCALE) <= MIN_SCALE,
              onClick: () => { void saveValue(`${heroKey}Scale`, value => Math.max(MIN_SCALE, (value[`${heroKey}Scale`] ?? DEFAULT_SCALE) - SCALE_STEP)) },
            }, '−'),
            h('output', { 'aria-label': `${heroLabel}缩放比例` }, `${state.value[`${heroKey}Scale`] ?? DEFAULT_SCALE}%`),
            h('button', { type: 'button', 'aria-label': `${heroLabel}放大`,
              disabled: (state.value[`${heroKey}Scale`] ?? DEFAULT_SCALE) >= MAX_SCALE,
              onClick: () => { void saveValue(`${heroKey}Scale`, value => Math.min(MAX_SCALE, (value[`${heroKey}Scale`] ?? DEFAULT_SCALE) + SCALE_STEP)) },
            }, '＋'),
            h('button', { type: 'button', 'aria-label': `${heroLabel}重置缩放`, onClick: () => { void saveValue(`${heroKey}Scale`, () => DEFAULT_SCALE) } }, '重置为 100%')),
          key !== 'favicon' && h('div', { className: 'dsh-branding-actions' },
            h('span', null, '主界面左右位移'),
            h('button', { type: 'button', 'aria-label': `${heroLabel}左移`,
              disabled: (state.value[`${heroKey}Offset`] ?? DEFAULT_OFFSET) <= MIN_OFFSET,
              onClick: () => { void saveValue(`${heroKey}Offset`, value => Math.max(MIN_OFFSET, (value[`${heroKey}Offset`] ?? DEFAULT_OFFSET) - OFFSET_STEP)) },
            }, '←'),
            h('output', { 'aria-label': `${heroLabel}水平位移` }, `${(state.value[`${heroKey}Offset`] ?? DEFAULT_OFFSET) > 0 ? '+' : ''}${state.value[`${heroKey}Offset`] ?? DEFAULT_OFFSET}px`),
            h('button', { type: 'button', 'aria-label': `${heroLabel}右移`,
              disabled: (state.value[`${heroKey}Offset`] ?? DEFAULT_OFFSET) >= MAX_OFFSET,
              onClick: () => { void saveValue(`${heroKey}Offset`, value => Math.min(MAX_OFFSET, (value[`${heroKey}Offset`] ?? DEFAULT_OFFSET) + OFFSET_STEP)) },
            }, '→'),
            h('button', { type: 'button', 'aria-label': `${heroLabel}重置位移`, onClick: () => { void saveValue(`${heroKey}Offset`, () => DEFAULT_OFFSET) } }, '重置居中')))),
      state.status === 'ready' && !state.writable && h('p', null, '当前连接没有配置写入权限。'),
      h('p', { role: 'status' }, busy ? '正在保存设置…' : message),
      warning && h('p', { role: 'alert' }, warning))
  }
  return ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section', id: 'dsh-branding', order: 54, label: '品牌设置',
  }, Settings))
}

return {installSettings};
},
"src/title.js":function(local) {
/** Match the whitespace normalization applied by the browser's document.title getter. */
function titleText(value) {
  return value.replace(/[\t\n\f\r ]+/g, ' ').replace(/^ | $/g, '')
}

/** Project the same current Session title and panel choice used by DSH DocumentTitle. */
function projection(ctx) {
  const panel = ctx.layout.panelInfo.getSnapshot()
  const sessions = ctx.sessions.list.getSnapshot()
  if (!panel || panel.activePanelId === undefined || !sessions?.byId || typeof sessions.byId !== 'object') return undefined
  if (panel.activePanelId !== null) return { title: undefined }
  const row = Object.values(sessions.byId).find(item => (item?.retainedBy?.mainView ?? 0) > 0)
  if (row?.title !== undefined && typeof row.title !== 'string') return undefined
  return { title: row?.title }
}

/** Recover the product part only when the entire known Session-title prefix matches. */
function productFromSessionTitle(value, title) {
  const prefix = titleText(`${title} —`)
  if (value === prefix) return ''
  if (value.startsWith(`${prefix} `)) return value.slice(prefix.length + 1)
  return undefined
}

/** Replace the product name in the projected tab title while retaining the Session title. */
function installTabTitle({ ctx, document, form }) {
  const Observer = document.defaultView.MutationObserver
  let previous = projection(ctx)
  const meta = name => document.head?.querySelector(`meta[name="${name}"]`)?.getAttribute('content') ?? undefined
  const bootstrap = meta('dsh-branding-app-name')
  const nativeSeed = meta('dsh-branding-native-title')
  const bootstrapName = bootstrap === undefined ? '' : titleText(bootstrap)
  let nativeProduct = nativeSeed === undefined ? undefined : titleText(nativeSeed)
  let nativeSession
  let owned
  let stopped = false
  let formReady = false
  let observedHead
  const cleanups = []
  const retiredNative = []

  // The Host may have already placed its custom name in the first HTML title.
  // Keep that value owned so an accepted empty setting can restore the native title.
  if (bootstrapName) {
    const initial = document.title
    const projected = previous?.title === undefined ? bootstrapName : titleText(`${previous.title} — ${bootstrapName}`)
    if ((initial === bootstrapName || initial === projected) && initial !== nativeTitle(previous)) owned = initial
  }

  function relevant(records) {
    return records.some(record => {
      const target = record.target.nodeType === 3 ? record.target.parentElement : record.target
      if (target?.localName === 'title' && target.parentNode === document.head) return true
      if (record.type !== 'childList' || record.target !== document.head) return false
      return [...record.addedNodes, ...record.removedNodes].some(node => node.nodeType === 1 && node.localName === 'title')
    })
  }

  const headObserver = new Observer(records => { if (relevant(records)) reconcile(true) })
  const rootObserver = new Observer(() => {
    if (attachHead()) reconcile(true)
  })

  function attachHead() {
    if (observedHead === document.head) return false
    headObserver.disconnect()
    observedHead = document.head
    if (observedHead) headObserver.observe(observedHead, { childList: true, subtree: true, characterData: true })
    return true
  }

  function pendingTitleChange() {
    const changed = relevant(headObserver.takeRecords())
    rootObserver.takeRecords()
    return attachHead() || changed
  }

  function nativeTitle(current) {
    if (nativeProduct === undefined) return undefined
    return current?.title === undefined ? nativeProduct : titleText(`${current.title} — ${nativeProduct}`)
  }

  function rememberRetired(current) {
    if (previous?.title === undefined || previous.title === current?.title) return
    const value = nativeTitle(previous)
    if (value === undefined || retiredNative.includes(value)) return
    retiredNative.push(value)
    if (retiredNative.length > 16) retiredNative.shift()
  }

  function remember(value, current) {
    if (!current || !document.head?.querySelector('title')) return
    if (current.title !== undefined) {
      // The host effect may briefly restore the bare product title during cleanup.
      if (value === nativeProduct) return
      // A prior topic title may arrive after selection has already advanced.
      if (nativeSession && current.title !== nativeSession.title && value === nativeSession.value) return
      if (retiredNative.includes(value) && value !== nativeTitle(current)) return
      let title = current.title
      let product = productFromSessionTitle(value, title)
      if (product === undefined && previous?.title !== undefined) {
        title = previous.title
        product = productFromSessionTitle(value, title)
      }
      if (product !== undefined) {
        nativeProduct = product
        nativeSession = { title, value }
      }
      return
    }
    // The Session store may notify before React replaces the previous topic title.
    if (previous?.title !== undefined) {
      const previousTitle = nativeTitle(previous)
      if (previousTitle !== undefined && value === previousTitle) return
      if (nativeProduct === undefined) {
        const product = productFromSessionTitle(value, previous.title)
        if (product !== undefined) { nativeProduct = product; return }
      }
    }
    nativeProduct = value
  }

  function write(value) {
    if (document.title !== value) {
      document.title = value
      // These records are ours. Consuming them prevents a mutation feedback loop.
      headObserver.takeRecords()
    }
    return document.title
  }

  function restore(current) {
    if (owned !== undefined && document.title === owned) {
      const value = nativeTitle(current)
      if (value !== undefined) write(value)
    }
    owned = undefined
  }

  function reconcile(external = false) {
    if (stopped) return
    external = pendingTitleChange() || external
    const current = projection(ctx)
    const value = document.title
    rememberRetired(current)
    if (external || (owned !== undefined && value !== owned)) owned = undefined
    if (owned === undefined) remember(value, current)
    const state = form.getSnapshot()
    if (state?.status === 'ready') formReady = true
    const configured = state?.status === 'ready'
      ? typeof state.value?.appName === 'string' ? titleText(state.value.appName) : ''
      : formReady ? '' : bootstrapName
    if (!current || !configured) {
      restore(current)
    } else if (nativeProduct !== undefined) {
      const desired = current.title === undefined ? configured : titleText(`${current.title} — ${configured}`)
      if (document.title !== desired) {
        const written = write(desired)
        if (written === desired) owned = written
      }
    }
    previous = current
  }

  try {
    attachHead()
    if (document.documentElement) rootObserver.observe(document.documentElement, { childList: true })
    cleanups.push(form.subscribe(reconcile))
    cleanups.push(ctx.sessions.list.subscribe(reconcile))
    cleanups.push(ctx.layout.panelInfo.subscribe(reconcile))
    reconcile()
  } catch (error) {
    for (const dispose of cleanups.reverse()) dispose()
    headObserver.disconnect()
    rootObserver.disconnect()
    throw error
  }

  return () => {
    if (stopped) return
    // Apply any host write waiting in the observer queue before releasing ownership.
    const external = pendingTitleChange()
    const current = projection(ctx)
    rememberRetired(current)
    if (external || (owned !== undefined && document.title !== owned)) {
      owned = undefined
      remember(document.title, current)
    }
    stopped = true
    for (const dispose of cleanups.reverse()) dispose()
    headObserver.disconnect()
    rootObserver.disconnect()
    restore(current)
  }
}

return {installTabTitle};
}};
const cache=Object.create(null);
const local=id=>cache[id]??(cache[id]=factories[id](local));
return local("src/client.js").makePlugin(require);
}});
