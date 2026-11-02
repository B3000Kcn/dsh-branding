import { IMAGE_ACCEPT, readImage } from './images.js'
import { DEFAULT_SCALE, MIN_SCALE, MAX_SCALE, SCALE_STEP, DEFAULT_OFFSET, MIN_OFFSET, MAX_OFFSET, OFFSET_STEP } from './options.js'

/** Register image uploads, independent clear actions, and previews in a dedicated page. */
export function installSettings({ ctx, React, form, status }) {
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
