import test from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import { installTabTitle } from '../src/title.js'

const tick = () => new Promise(resolve => setImmediate(resolve))
const selected = title => ({ byId: { topic: { id: 'topic', title, retainedBy: { mainView: 1 } } } })
const none = () => ({ byId: {} })

function source(initial) {
  let snapshot = initial
  const listeners = new Set()
  return {
    getSnapshot: () => snapshot,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener) },
    set(value) { snapshot = value; for (const listener of listeners) listener() },
    silent(value) { snapshot = value },
    notify() { for (const listener of listeners) listener() },
    count: () => listeners.size,
  }
}

function fixture({
  title = 'DeepSeek Harness', appName = '', sessions = none(), panel = null,
  status = 'ready', bootstrap, nativeSeed,
} = {}) {
  const dom = new JSDOM('<!doctype html><html><head><title></title></head><body></body></html>')
  const { document } = dom.window
  document.title = title
  for (const [name, value] of [['dsh-branding-app-name', bootstrap], ['dsh-branding-native-title', nativeSeed]]) {
    if (value === undefined) continue
    const meta = document.createElement('meta')
    meta.name = name
    meta.content = value
    document.head.append(meta)
  }
  const form = source({ status, value: { appName } })
  const list = source(sessions)
  const panelInfo = source({ activePanelId: panel })
  const dispose = installTabTitle({ ctx: { sessions: { list }, layout: { panelInfo } }, document, form })
  return {
    document, dom, form, list, panelInfo, dispose,
    config(value, status = 'ready') { form.set({ status, value: { appName: value } }) },
    close() {
      dispose()
      assert.equal(form.count(), 0)
      assert.equal(list.count(), 0)
      assert.equal(panelInfo.count(), 0)
      dom.window.close()
    },
  }
}

test('blank is native; configuration updates and clearing restore the latest native product title', async () => {
  const f = fixture()
  assert.equal(f.document.title, 'DeepSeek Harness')
  f.config('My dashboard')
  assert.equal(f.document.title, 'My dashboard')
  f.config('Another title')
  assert.equal(f.document.title, 'Another title')
  f.document.title = 'Native — translated product'
  await tick()
  assert.equal(f.document.title, 'Another title')
  f.config('')
  assert.equal(f.document.title, 'Native — translated product')
  f.close()
})

test('store-first transitions replace only the product name and preserve topic separators', async () => {
  const f = fixture({ title: 'A — B — DeepSeek Harness', appName: 'Dashboard', sessions: selected('A — B') })
  assert.equal(f.document.title, 'A — B — Dashboard')
  f.list.set(none())
  assert.equal(f.document.title, 'Dashboard')
  f.document.title = 'DeepSeek Harness'
  await tick()
  assert.equal(f.document.title, 'Dashboard')

  f.list.set(selected('Next — research'))
  assert.equal(f.document.title, 'Next — research — Dashboard')
  f.document.title = 'Next — research — DeepSeek Harness'
  await tick()
  assert.equal(f.document.title, 'Next — research — Dashboard')
  f.list.set(selected('Renamed'))
  f.document.title = 'Renamed — DeepSeek Harness'
  await tick()
  assert.equal(f.document.title, 'Renamed — Dashboard')
  f.close()
  assert.equal(f.document.title, 'Renamed — DeepSeek Harness')
})

test('host title effects may arrive before listeners for a newer snapshot', async () => {
  const f = fixture({ title: 'Topic — DeepSeek Harness', appName: 'Dashboard', sessions: selected('Topic') })
  assert.equal(f.document.title, 'Topic — Dashboard')
  f.list.silent(none())
  f.document.title = 'DeepSeek Harness'
  await tick()
  assert.equal(f.document.title, 'Dashboard')
  f.list.notify()
  assert.equal(f.document.title, 'Dashboard')

  f.list.silent(selected('New topic'))
  f.document.title = 'New topic — DeepSeek Harness'
  await tick()
  assert.equal(f.document.title, 'New topic — Dashboard')
  f.list.notify()
  assert.equal(f.document.title, 'New topic — Dashboard')
  f.close()
  assert.equal(f.document.title, 'New topic — DeepSeek Harness')
})

test('global panels display the custom product name and returning restores the custom topic title', async () => {
  const f = fixture({ title: 'Topic — Product', appName: 'Home', sessions: selected('Topic') })
  assert.equal(f.document.title, 'Topic — Home')
  f.panelInfo.set({ activePanelId: 'settings' })
  f.document.title = 'Product'
  await tick()
  assert.equal(f.document.title, 'Home')
  f.panelInfo.set({ activePanelId: null })
  assert.equal(f.document.title, 'Topic — Home')
  f.document.title = 'Topic — Product'
  await tick()
  assert.equal(f.document.title, 'Topic — Home')
  f.close()
  assert.equal(f.document.title, 'Topic — Product')
})

test('unavailable or invalid configuration restores native, and whitespace follows document.title', async () => {
  const f = fixture({ appName: '  Brand   page  ' })
  assert.equal(f.document.title, 'Brand page')
  f.config(null)
  assert.equal(f.document.title, 'DeepSeek Harness')
  f.config('Another')
  assert.equal(f.document.title, 'Another')
  f.config('ignored', 'unavailable')
  assert.equal(f.document.title, 'DeepSeek Harness')
  f.config(' \t\n ')
  assert.equal(f.document.title, 'DeepSeek Harness')
  f.config('Valid')
  assert.equal(f.document.title, 'Valid')
  await tick()
  f.close()
  assert.equal(f.document.title, 'DeepSeek Harness')
})

test('a host title that equals the custom title becomes the new native fallback', async () => {
  const f = fixture({ title: 'Original', appName: 'Same' })
  assert.equal(f.document.title, 'Same')
  // The settings notification can precede the pending title observer callback.
  f.document.title = 'Same'
  f.config('')
  assert.equal(f.document.title, 'Same')
  await tick()
  assert.equal(f.document.title, 'Same')
  f.close()
})

test('a selected topic already present before the host effect later acquires the native product title', async () => {
  const f = fixture({ title: 'Booting', appName: 'Home', sessions: selected('Selected — name') })
  assert.equal(f.document.title, 'Booting')
  f.document.title = 'Selected — name — Product — edition'
  await tick()
  assert.equal(f.document.title, 'Selected — name — Home')
  f.config('')
  assert.equal(f.document.title, 'Selected — name — Product — edition')
  f.config('Home')
  assert.equal(f.document.title, 'Selected — name — Home')
  f.list.set(none())
  assert.equal(f.document.title, 'Home')
  f.config('')
  assert.equal(f.document.title, 'Product — edition')
  f.close()
})

test('replacement of the title element and the head tracks the new native title', async () => {
  const f = fixture({ appName: 'Home' })
  const title = f.document.createElement('title')
  title.textContent = 'Replacement product'
  f.document.querySelector('title').replaceWith(title)
  await tick()
  assert.equal(f.document.title, 'Home')
  f.config('')
  assert.equal(f.document.title, 'Replacement product')

  f.config('Home again')
  const head = f.document.createElement('head')
  const next = f.document.createElement('title')
  next.textContent = 'New head product'
  head.append(next)
  f.document.documentElement.replaceChild(head, f.document.head)
  await tick()
  assert.equal(f.document.title, 'Home again')
  f.close()
  assert.equal(f.document.title, 'New head product')
})

test('own title writes do not loop and unloading never overwrites a newer foreign title', async () => {
  const f = fixture()
  let changes = 0
  const observer = new f.dom.window.MutationObserver(() => { changes += 1 })
  observer.observe(f.document.head, { childList: true, characterData: true, subtree: true })
  f.config('Home')
  await tick()
  const once = changes
  assert.ok(once > 0)
  await tick()
  await tick()
  assert.equal(changes, once)

  // The host writes immediately before unload, before its mutation is delivered.
  f.document.title = 'Host changed just now'
  f.dispose()
  await tick()
  assert.equal(f.document.title, 'Host changed just now')
  assert.equal(f.form.count(), 0)
  assert.equal(f.list.count(), 0)
  assert.equal(f.panelInfo.count(), 0)
  observer.disconnect()
  f.dom.window.close()
})

test('untitled retained sessions use the product name, while an empty-string topic keeps the separator', () => {
  const f = fixture({ title: 'Product', appName: 'Home', sessions: selected(undefined) })
  assert.equal(f.document.title, 'Home')
  f.list.set(selected(''))
  assert.equal(f.document.title, '— Home')
  f.close()
  assert.equal(f.document.title, '— Product')
})

test('an empty native product title is restored and retains native topic formatting', () => {
  const f = fixture({ title: '', appName: 'Home' })
  assert.equal(f.document.title, 'Home')
  f.list.set(selected('Topic'))
  assert.equal(f.document.title, 'Topic — Home')
  f.list.set(none())
  assert.equal(f.document.title, 'Home')
  f.close()
  assert.equal(f.document.title, '')
})

test('the complete topic text survives repeated native and custom brand names and separators', async () => {
  const topic = 'Workspace — DeepSeek Harness — Workspace'
  const product = 'DeepSeek Harness — Workspace edition'
  const native = `${topic} — ${product}`
  const f = fixture({ title: native, appName: 'Workspace', sessions: selected(topic) })
  assert.equal(f.document.title, `${topic} — Workspace`)
  f.config('Another — Brand')
  assert.equal(f.document.title, `${topic} — Another — Brand`)
  f.document.title = native
  await tick()
  assert.equal(f.document.title, `${topic} — Another — Brand`)
  f.config('')
  assert.equal(f.document.title, native)
  f.config('Workspace')
  assert.equal(f.document.title, `${topic} — Workspace`)
  f.close()
  assert.equal(f.document.title, native)
})

test('rapid configuration changes and topic switches never cache our custom suffix as native', async () => {
  const f = fixture({ title: 'First — Product — edition', appName: 'One', sessions: selected('First') })
  assert.equal(f.document.title, 'First — One')
  f.config('Two')
  f.list.set(selected('Second — draft'))
  f.config('Three')
  assert.equal(f.document.title, 'Second — draft — Three')

  // React may write its cleanup product and its new topic after those changes.
  f.document.title = 'Product — edition'
  await tick()
  assert.equal(f.document.title, 'Second — draft — Three')
  f.document.title = 'Second — draft — Product — edition'
  f.config('Four')
  assert.equal(f.document.title, 'Second — draft — Four')
  f.config('')
  assert.equal(f.document.title, 'Second — draft — Product — edition')
  f.close()
})

test('invalid or unavailable configuration while a topic is selected restores the native full title', async () => {
  const f = fixture({ title: 'Topic — Native — build', appName: 'Brand', sessions: selected('Topic') })
  assert.equal(f.document.title, 'Topic — Brand')
  f.config(42)
  assert.equal(f.document.title, 'Topic — Native — build')
  f.config('Brand')
  assert.equal(f.document.title, 'Topic — Brand')
  f.config('ignored', 'unavailable')
  assert.equal(f.document.title, 'Topic — Native — build')
  f.config(' \n ')
  assert.equal(f.document.title, 'Topic — Native — build')
  await tick()
  f.close()
})

test('unloading during a topic switch restores the new native title before the host effect', () => {
  const f = fixture({ title: 'First — Product', appName: 'Brand', sessions: selected('First') })
  f.list.set(selected('Second — still text'))
  assert.equal(f.document.title, 'Second — still text — Brand')
  f.close()
  assert.equal(f.document.title, 'Second — still text — Product')
})

test('host product changes while a topic is selected are used when the custom name is cleared', async () => {
  const f = fixture({ title: 'Topic — First product', appName: 'Brand', sessions: selected('Topic') })
  f.document.title = 'Topic — Updated — product'
  await tick()
  assert.equal(f.document.title, 'Topic — Brand')
  f.config('')
  assert.equal(f.document.title, 'Topic — Updated — product')
  f.close()
})

test('a delayed previous topic whose name extends the current one cannot corrupt the product name', async () => {
  const f = fixture({
    title: 'Research — urgent — Product', appName: 'Brand', sessions: selected('Research — urgent'),
  })
  f.list.set(selected('Research'))
  assert.equal(f.document.title, 'Research — Brand')
  f.document.title = 'Research — urgent — Product'
  await tick()
  assert.equal(f.document.title, 'Research — Brand')
  f.config('')
  assert.equal(f.document.title, 'Research — Product')
  f.close()
})

test('a delayed title for an intermediate topic is ignored after rapid navigation', async () => {
  const f = fixture({ title: 'Initial — Product', appName: 'Brand', sessions: selected('Initial') })
  f.list.set(selected('Research — urgent'))
  f.list.set(selected('Research'))
  f.document.title = 'Research — urgent — Product'
  await tick()
  assert.equal(f.document.title, 'Research — Brand')
  f.config('')
  assert.equal(f.document.title, 'Research — Product')
  f.close()
})

test('a changed product may itself end in the previous product name', async () => {
  const f = fixture({ title: 'Research — Product', appName: 'Brand', sessions: selected('Research') })
  f.document.title = 'Research — Labs — Product'
  await tick()
  assert.equal(f.document.title, 'Research — Brand')
  f.config('')
  assert.equal(f.document.title, 'Research — Labs — Product')
  f.close()
})

test('a bare native product beginning with the topic is not mistaken for a complete topic title', async () => {
  const f = fixture({ title: 'Topic — Topic — edition', appName: 'Brand', sessions: selected('Topic') })
  assert.equal(f.document.title, 'Topic — Brand')
  // The native effect's cleanup writes the product name by itself.
  f.document.title = 'Topic — edition'
  await tick()
  assert.equal(f.document.title, 'Topic — Brand')
  f.config('')
  assert.equal(f.document.title, 'Topic — Topic — edition')
  f.close()
})

test('a native selected title equal to our current output is remembered before clearing', () => {
  const f = fixture({ title: 'Topic — Original', appName: 'Brand', sessions: selected('Topic') })
  assert.equal(f.document.title, 'Topic — Brand')
  // This native update equals the custom output and is still pending delivery.
  f.document.title = 'Topic — Brand'
  f.config('')
  assert.equal(f.document.title, 'Topic — Brand')
  f.close()
})

test('bootstrap name covers loading and unavailable views, while ready values take precedence', async () => {
  const f = fixture({
    title: 'Viewer & Brand', bootstrap: 'Viewer & Brand', nativeSeed: 'Native — product', status: 'loading',
  })
  assert.equal(f.document.title, 'Viewer & Brand')
  f.config('ignored', 'unavailable')
  assert.equal(f.document.title, 'Viewer & Brand')
  f.config('Accepted name')
  assert.equal(f.document.title, 'Accepted name')
  f.config('')
  assert.equal(f.document.title, 'Native — product')
  await tick()
  assert.equal(f.document.title, 'Native — product', 'an accepted empty value does not fall back to the bootstrap name')
  f.close()
  assert.equal(f.document.title, 'Native — product')
})

test('viewer without settings uses the bootstrap name with the full selected topic and restores native on unload', async () => {
  const topic = 'DeepSeek Harness — research'
  const f = fixture({
    title: 'Viewer <brand>', bootstrap: 'Viewer <brand>', nativeSeed: 'DeepSeek Harness — edition',
    status: 'unavailable', sessions: selected(topic),
  })
  assert.equal(f.document.title, `${topic} — Viewer <brand>`)
  f.document.title = `${topic} — DeepSeek Harness — edition`
  await tick()
  assert.equal(f.document.title, `${topic} — Viewer <brand>`)
  f.close()
  assert.equal(f.document.title, `${topic} — DeepSeek Harness — edition`)
})

test('a ready empty setting restores the native selected title before any host effect', async () => {
  const topic = 'Topic — text'
  for (const title of ['Bootstrap', `${topic} — Bootstrap`]) {
    const f = fixture({ title, bootstrap: 'Bootstrap', nativeSeed: 'Native — product', sessions: selected(topic) })
    assert.equal(f.document.title, `${topic} — Native — product`)
    await tick()
    assert.equal(f.document.title, `${topic} — Native — product`)
    f.close()
  }
})

test('after a ready snapshot, loading or unavailable never revive the bootstrap name', () => {
  const f = fixture({
    title: 'Bootstrap', bootstrap: 'Bootstrap', nativeSeed: 'Native — product',
    status: 'loading', sessions: selected('Topic'),
  })
  assert.equal(f.document.title, 'Topic — Bootstrap')
  f.config('')
  assert.equal(f.document.title, 'Topic — Native — product')
  f.config('ignored', 'unavailable')
  assert.equal(f.document.title, 'Topic — Native — product')
  f.config('ignored', 'loading')
  assert.equal(f.document.title, 'Topic — Native — product')

  f.config('New owner name')
  assert.equal(f.document.title, 'Topic — New owner name')
  f.config('ignored', 'unavailable')
  assert.equal(f.document.title, 'Topic — Native — product')
  f.config('New owner name')
  f.config('ignored', 'loading')
  assert.equal(f.document.title, 'Topic — Native — product')
  f.close()
})

test('bootstrap metadata is read once and its own writes do not loop', async () => {
  const f = fixture({ title: 'Native', bootstrap: 'Bootstrap', nativeSeed: 'Native', status: 'unavailable' })
  assert.equal(f.document.title, 'Bootstrap')
  let changes = 0
  const observer = new f.dom.window.MutationObserver(() => { changes += 1 })
  observer.observe(f.document.querySelector('title'), { childList: true, subtree: true, characterData: true })
  f.document.querySelector('meta[name="dsh-branding-app-name"]').content = 'Changed later'
  f.document.title = 'Native'
  await tick()
  assert.equal(f.document.title, 'Bootstrap')
  const after = changes
  assert.ok(after > 0)
  await tick()
  await tick()
  assert.equal(changes, after)
  f.config('', 'unavailable')
  assert.equal(f.document.title, 'Bootstrap')
  f.config('')
  assert.equal(f.document.title, 'Native')
  observer.disconnect()
  f.close()
})
