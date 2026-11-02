import test from 'node:test'
import assert from 'node:assert/strict'
import { installSettings } from '../src/settings.js'
import { MAX_FILE_BYTES } from '../src/images.js'

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL/pAAAAABJRU5ErkJggg=='
const JPEG = 'data:image/jpeg;base64,/9j/2Q=='
const tick = () => new Promise(resolve => setImmediate(resolve))
const file = (overrides = {}) => ({ name: 'banner.png', type: 'image/png', size: 100, ...overrides })

function descendants(node) {
  if (Array.isArray(node)) return node.flatMap(descendants)
  if (!node || typeof node !== 'object') return []
  return [node, ...descendants(node.children)]
}

function fixture(t, options = {}) {
  const originalReader = Object.getOwnPropertyDescriptor(globalThis, 'FileReader')
  const originalImage = Object.getOwnPropertyDescriptor(globalThis, 'Image')
  const readers = []
  const pictures = []
  globalThis.FileReader = class {
    readAsDataURL(selected) { this.file = selected; readers.push(this) }
    succeed(value = PNG) { this.result = value; this.onload() }
  }
  globalThis.Image = class {
    set src(value) { this.url = value; pictures.push(this) }
    succeed(width = 100, height = 24) {
      this.naturalWidth = width
      this.naturalHeight = height
      this.onload()
    }
    fail() { this.onerror() }
  }
  t.after(() => {
    if (originalReader) Object.defineProperty(globalThis, 'FileReader', originalReader)
    else delete globalThis.FileReader
    if (originalImage) Object.defineProperty(globalThis, 'Image', originalImage)
    else delete globalThis.Image
  })

  let snapshot = {
    status: 'ready', writable: true, revision: 7,
    value: { favicon: '', lightBanner: '', darkBanner: '', ...options.value },
    ...options.snapshot,
  }
  const calls = []
  let answer
  const form = {
    getSnapshot: () => snapshot,
    subscribe: () => () => {},
    async mutate(ops, revision) {
      calls.push({ ops: structuredClone(ops), revision })
      if (answer instanceof Error) throw answer
      const accepted = answer ?? revision === snapshot.revision
      if (accepted) {
        const value = { ...snapshot.value }
        for (const op of ops) value[op.path[0]] = op.value
        snapshot = { ...snapshot, value, revision: snapshot.revision + 1 }
      }
      return accepted
    },
  }
  let cursor = 0
  const hooks = []
  let effects = []
  const React = {
    createElement: (type, props, ...children) => ({ type, props: props ?? {}, children }),
    useSyncExternalStore: (_subscribe, getSnapshot) => { cursor += 1; return getSnapshot() },
    useState(initial) {
      const index = cursor++
      hooks[index] ??= { value: initial }
      return [hooks[index].value, value => {
        hooks[index].value = typeof value === 'function' ? value(hooks[index].value) : value
      }]
    },
    useRef(initial) {
      const index = cursor++
      return hooks[index] ??= { current: initial }
    },
    useEffect(effect) {
      const index = cursor++
      if (!hooks[index]) {
        hooks[index] = {}
        effects.push(() => { hooks[index].cleanup = effect() })
      }
    },
  }
  let component
  const ctx = { slots: {
    inject(name, callback) { assert.equal(name, 'settings.section'); return callback() },
    register(spec, render) { assert.equal(spec.id, 'dsh-branding'); component = render; return () => {} },
  } }
  const status = { subscribe: () => () => {}, getSnapshot: () => '' }
  installSettings({ ctx, React, form, status })
  function render() {
    cursor = 0
    return component()
  }
  render()
  for (const effect of effects.splice(0)) effect()
  function field(label) {
    const match = descendants(render()).find(node => node.type === 'fieldset'
      && node.children.some(child => child?.type === 'legend' && child.children[0] === label))
    assert.ok(match, `missing field ${label}`)
    return match
  }
  return {
    calls, pictures, readers, field, render,
    get snapshot() { return snapshot },
    setRevision(revision) { snapshot = { ...snapshot, revision } },
    setAnswer(value) { answer = value },
    choose(label, selected) {
      const input = descendants(field(label)).find(node => node.type === 'input')
      const target = { files: selected ? [selected] : [], value: 'previous selection' }
      input.props.onChange({ target })
      return target
    },
    clear(label) {
      const button = descendants(field(label)).find(node => node.type === 'button')
      button.props.onClick()
    },
    unmount() {
      for (const hook of hooks) hook?.cleanup?.()
      effects = []
    },
  }
}

test('a valid upload is decoded before one field is written with its starting revision', async t => {
  const f = fixture(t, { value: { favicon: JPEG, darkBanner: PNG } })
  const target = f.choose('日间横幅', file())
  assert.equal(target.value, '')
  assert.equal(f.readers.length, 1)
  assert.deepEqual(f.calls, [])
  f.readers[0].succeed()
  await tick()
  assert.equal(f.pictures.length, 1)
  assert.equal(f.pictures[0].url, PNG)
  assert.deepEqual(f.calls, [], 'reading alone does not commit an undecoded image')
  f.pictures[0].succeed()
  await tick()
  assert.deepEqual(f.calls, [{ ops: [{ op: 'set', path: ['lightBanner'], value: PNG }], revision: 7 }])
  assert.deepEqual(f.snapshot.value, { favicon: JPEG, lightBanner: PNG, darkBanner: PNG })
  assert.match(JSON.stringify(f.render()), /已保存/)
})

test('oversized, unsupported, and undecodable uploads leave the previous values untouched', async t => {
  const f = fixture(t, { value: { lightBanner: PNG } })
  f.choose('日间横幅', file({ size: MAX_FILE_BYTES + 1 }))
  await tick()
  assert.match(JSON.stringify(f.render()), /不超过 512 KiB/)
  f.choose('日间横幅', file({ type: 'text/plain' }))
  await tick()
  assert.match(JSON.stringify(f.render()), /支持 PNG/)
  assert.equal(f.readers.length, 0)

  f.choose('日间横幅', file())
  f.readers[0].succeed()
  await tick()
  f.pictures[0].fail()
  await tick()
  assert.match(JSON.stringify(f.render()), /无法解码/)
  assert.deepEqual(f.calls, [])
  assert.equal(f.snapshot.value.lightBanner, PNG)
})

test('a revision change during validation is fenced and a refused save is reported', async t => {
  const f = fixture(t)
  f.choose('网页 favicon', file())
  f.readers[0].succeed()
  await tick()
  f.setRevision(8)
  f.pictures[0].succeed()
  await tick()
  assert.deepEqual(f.calls, [{ ops: [{ op: 'set', path: ['favicon'], value: PNG }], revision: 7 }])
  assert.equal(f.snapshot.value.favicon, '')
  assert.match(JSON.stringify(f.render()), /未保存/)
})

test('read-only settings disable the fields and refuse uploads and clears', async t => {
  const f = fixture(t, { snapshot: { writable: false }, value: { favicon: PNG } })
  assert.equal(f.field('网页 favicon').props.disabled, true)
  assert.match(JSON.stringify(f.render()), /没有配置写入权限/)
  f.choose('网页 favicon', file())
  f.clear('网页 favicon')
  await tick()
  assert.deepEqual(f.calls, [])
  assert.equal(f.readers.length, 0)
  assert.equal(f.snapshot.value.favicon, PNG)
})

test('clearing a banner changes only that field and a transport failure is visible', async t => {
  const f = fixture(t, { value: { favicon: JPEG, lightBanner: PNG, darkBanner: PNG } })
  f.clear('夜间横幅')
  await tick()
  assert.deepEqual(f.calls, [{ ops: [{ op: 'set', path: ['darkBanner'], value: '' }], revision: 7 }])
  assert.deepEqual(f.snapshot.value, { favicon: JPEG, lightBanner: PNG, darkBanner: '' })

  f.setAnswer(new Error('连接失败'))
  f.clear('日间横幅')
  await tick()
  assert.equal(f.snapshot.value.lightBanner, PNG)
  assert.match(JSON.stringify(f.render()), /连接失败/)
})

test('canceling the file picker does not start a read or a write', async t => {
  const f = fixture(t)
  assert.equal(f.choose('网页 favicon').value, '')
  await tick()
  assert.deepEqual(f.calls, [])
  assert.equal(f.readers.length, 0)
})

test('unmounting while an image is decoding prevents a later write', async t => {
  const f = fixture(t)
  f.choose('夜间横幅', file())
  f.readers[0].succeed()
  await tick()
  assert.equal(f.pictures.length, 1)
  f.unmount()
  f.pictures[0].succeed()
  await tick()
  assert.deepEqual(f.calls, [])
})

test('day and night zoom save independent ten-percent steps and reset to 100%', async t => {
  const f = fixture(t)
  const click = (label, action) => descendants(f.field(label)).find(node => node.type === 'button'
    && (node.props['aria-label'] === action || node.children[0] === action)).props.onClick()
  click('日间横幅', '日间横幅放大')
  await tick()
  assert.equal(f.snapshot.value.lightBannerScale, 110)
  assert.equal(f.snapshot.value.darkBannerScale, undefined)
  click('夜间横幅', '夜间横幅缩小')
  await tick()
  assert.equal(f.snapshot.value.darkBannerScale, 90)
  assert.equal(f.snapshot.value.lightBannerScale, 110)
  click('日间横幅', '重置为 100%')
  await tick()
  assert.equal(f.snapshot.value.lightBannerScale, 100)
  assert.equal(f.snapshot.value.darkBannerScale, 90)
  assert.deepEqual(f.calls.map(call => call.ops[0].path), [['lightBannerScale'], ['darkBannerScale'], ['lightBannerScale']])
})

test('zoom controls expose limits and save within 10% to 300%', async t => {
  const f = fixture(t, { value: { lightBannerScale: 10, darkBannerScale: 300 } })
  const lower = descendants(f.field('日间横幅')).find(node => node.props['aria-label'] === '日间横幅缩小')
  const upper = descendants(f.field('夜间横幅')).find(node => node.props['aria-label'] === '夜间横幅放大')
  assert.equal(lower.props.disabled, true)
  assert.equal(upper.props.disabled, true)
  lower.props.onClick()
  await tick()
  upper.props.onClick()
  await tick()
  assert.equal(f.snapshot.value.lightBannerScale, 10)
  assert.equal(f.snapshot.value.darkBannerScale, 300)
})

test('app-name editor saves and clears the existing persisted title field without changing images', async t => {
  const f = fixture(t, { value: { favicon: PNG } })
  const editor = () => descendants(f.render()).find(node => typeof node.type === 'function')
  assert.equal(editor().props.value, '')
  editor().props.onSave('我的工作台')
  await tick()
  assert.equal(f.snapshot.value.appName, '我的工作台')
  editor().props.onSave('')
  await tick()
  assert.equal(f.snapshot.value.appName, '')
  assert.equal(f.snapshot.value.favicon, PNG)
  assert.deepEqual(f.calls.map(call => call.ops[0].path), [['appName'], ['appName']])
})

test('horizontal controls move by five pixels per mode and reset without changing zoom or title', async t => {
  const f = fixture(t, { value: { lightBanner: PNG, darkBanner: PNG, lightBannerScale: 150, appName: '工作台' } })
  const click = (label, action) => descendants(f.field(label)).find(node => node.type === 'button'
    && (node.props['aria-label'] === action || node.children[0] === action)).props.onClick()
  click('日间横幅', '日间横幅左移')
  await tick()
  assert.equal(f.snapshot.value.lightBannerOffset, -5)
  const dayPreview = descendants(f.field('日间横幅')).find(node => node.type === 'img')
  assert.equal(dayPreview.props.style.transform, 'translateX(-5px) scale(1.5)')
  click('夜间横幅', '夜间横幅右移')
  await tick()
  assert.equal(f.snapshot.value.darkBannerOffset, 5)
  const nightOffset = descendants(f.field('夜间横幅')).find(node => node.props['aria-label'] === '夜间横幅水平位移')
  assert.equal(nightOffset.children[0], '+5px')
  click('日间横幅', '重置居中')
  await tick()
  assert.equal(f.snapshot.value.lightBannerOffset, 0)
  assert.equal(f.snapshot.value.darkBannerOffset, 5)
  assert.equal(f.snapshot.value.lightBannerScale, 150)
  assert.equal(f.snapshot.value.appName, '工作台')
  assert.deepEqual(f.calls.map(call => call.ops[0].path), [['lightBannerOffset'], ['darkBannerOffset'], ['lightBannerOffset']])
})

test('horizontal controls enforce both limits and respect read-only settings', async t => {
  const f = fixture(t, { value: { lightBannerOffset: -200, darkBannerOffset: 200 } })
  const left = descendants(f.field('日间横幅')).find(node => node.props['aria-label'] === '日间横幅左移')
  const right = descendants(f.field('夜间横幅')).find(node => node.props['aria-label'] === '夜间横幅右移')
  assert.equal(left.props.disabled, true)
  assert.equal(right.props.disabled, true)
  left.props.onClick()
  await tick()
  right.props.onClick()
  await tick()
  assert.equal(f.snapshot.value.lightBannerOffset, -200)
  assert.equal(f.snapshot.value.darkBannerOffset, 200)
  const readonly = fixture(t, { snapshot: { writable: false } })
  descendants(readonly.field('日间横幅')).find(node => node.props['aria-label'] === '日间横幅右移').props.onClick()
  await tick()
  assert.deepEqual(readonly.calls, [])
})

test('main-interface controls follow sidebar controls and show independent defaults', t => {
  const f = fixture(t, { value: { lightBanner: PNG, darkBanner: PNG, lightBannerScale: 150, lightBannerOffset: 20 } })
  for (const [label, heroLabel] of [['日间横幅', '日间主界面横幅'], ['夜间横幅', '夜间主界面横幅']]) {
    const field = f.field(label)
    const actions = field.children.filter(node => node?.props?.className === 'dsh-branding-actions')
    assert.deepEqual(actions.slice(1).map(row => row.children[0].children[0]), [
      '侧栏横幅缩放', '侧栏左右位移', '主界面横幅缩放', '主界面左右位移',
    ])
    assert.equal(descendants(field).filter(node => node.type === 'input' && node.props.type === 'file').length, 1)
    assert.equal(descendants(field).find(node => node.props['aria-label'] === `${heroLabel}缩放比例`).children[0], '100%')
    assert.equal(descendants(field).find(node => node.props['aria-label'] === `${heroLabel}水平位移`).children[0], '0px')
    assert.ok(descendants(field).find(node => node.props['aria-label'] === `${heroLabel}重置缩放`))
    assert.ok(descendants(field).find(node => node.props['aria-label'] === `${heroLabel}重置位移`))
  }
  assert.equal(descendants(f.field('日间横幅')).find(node => node.type === 'img').props.style.transform, 'translateX(20px) scale(1.5)')
  assert.equal(descendants(f.field('网页 favicon')).some(node => node.props['aria-label']?.includes('主界面横幅')), false)
})

test('main-interface zoom and offset save and reset independently of each other and the sidebar', async t => {
  const f = fixture(t, { value: { lightBanner: PNG, darkBanner: PNG, lightBannerScale: 150, darkBannerOffset: -20, appName: '工作台' } })
  const click = (field, action) => descendants(f.field(field)).find(node => node.type === 'button'
    && node.props['aria-label'] === action).props.onClick()
  for (const [field, action] of [
    ['日间横幅', '日间主界面横幅放大'], ['夜间横幅', '夜间主界面横幅缩小'],
    ['日间横幅', '日间主界面横幅左移'], ['夜间横幅', '夜间主界面横幅右移'],
  ]) {
    click(field, action)
    await tick()
  }
  assert.deepEqual({ lightHeroScale: f.snapshot.value.lightHeroScale, darkHeroScale: f.snapshot.value.darkHeroScale,
    lightHeroOffset: f.snapshot.value.lightHeroOffset, darkHeroOffset: f.snapshot.value.darkHeroOffset },
  { lightHeroScale: 110, darkHeroScale: 90, lightHeroOffset: -5, darkHeroOffset: 5 })
  assert.equal(descendants(f.field('夜间横幅')).find(node => node.props['aria-label'] === '夜间主界面横幅水平位移').children[0], '+5px')
  for (const [field, action] of [
    ['日间横幅', '日间主界面横幅重置缩放'], ['夜间横幅', '夜间主界面横幅重置缩放'],
    ['日间横幅', '日间主界面横幅重置位移'], ['夜间横幅', '夜间主界面横幅重置位移'],
  ]) {
    click(field, action)
    await tick()
  }
  assert.deepEqual(f.calls.map(call => [call.ops[0].path[0], call.ops[0].value, call.revision]), [
    ['lightHeroScale', 110, 7], ['darkHeroScale', 90, 8], ['lightHeroOffset', -5, 9], ['darkHeroOffset', 5, 10],
    ['lightHeroScale', 100, 11], ['darkHeroScale', 100, 12], ['lightHeroOffset', 0, 13], ['darkHeroOffset', 0, 14],
  ])
  assert.equal(f.snapshot.value.lightBannerScale, 150)
  assert.equal(f.snapshot.value.darkBannerOffset, -20)
  assert.equal(f.snapshot.value.lightBanner, PNG)
  assert.equal(f.snapshot.value.darkBanner, PNG)
  assert.equal(f.snapshot.value.appName, '工作台')
  assert.equal(descendants(f.field('日间横幅')).find(node => node.type === 'img').props.style.transform, 'translateX(0px) scale(1.5)')
})

test('main-interface controls enforce limits and refuse writes in read-only mode', async t => {
  const f = fixture(t, { value: { lightHeroScale: 10, darkHeroScale: 300, lightHeroOffset: -200, darkHeroOffset: 200 } })
  for (const [field, action] of [
    ['日间横幅', '日间主界面横幅缩小'], ['夜间横幅', '夜间主界面横幅放大'],
    ['日间横幅', '日间主界面横幅左移'], ['夜间横幅', '夜间主界面横幅右移'],
  ]) {
    const button = descendants(f.field(field)).find(node => node.props['aria-label'] === action)
    assert.equal(button.props.disabled, true)
    button.props.onClick()
    await tick()
  }
  assert.deepEqual(f.calls.map(call => call.ops[0].value), [10, 300, -200, 200])
  const readonly = fixture(t, { snapshot: { writable: false } })
  for (const [field, action] of [
    ['日间横幅', '日间主界面横幅放大'], ['夜间横幅', '夜间主界面横幅缩小'],
    ['日间横幅', '日间主界面横幅左移'], ['夜间横幅', '夜间主界面横幅右移'],
    ['日间横幅', '日间主界面横幅重置缩放'], ['夜间横幅', '夜间主界面横幅重置位移'],
  ]) {
    assert.equal(readonly.field(field).props.disabled, true)
    descendants(readonly.field(field)).find(node => node.props['aria-label'] === action).props.onClick()
  }
  await tick()
  assert.deepEqual(readonly.calls, [])
})

test('main-interface controls report refused and failed saves', async t => {
  const f = fixture(t)
  const button = label => descendants(f.field('日间横幅')).find(node => node.props['aria-label'] === label)
  f.setAnswer(false)
  button('日间主界面横幅放大').props.onClick()
  await tick()
  assert.equal(f.snapshot.value.lightHeroScale, undefined)
  assert.equal(f.calls[0].revision, 7)
  assert.match(JSON.stringify(f.render()), /未保存/)
  f.setAnswer(new Error('连接失败'))
  button('日间主界面横幅左移').props.onClick()
  await tick()
  assert.equal(f.snapshot.value.lightHeroOffset, undefined)
  assert.match(JSON.stringify(f.render()), /连接失败/)
})
