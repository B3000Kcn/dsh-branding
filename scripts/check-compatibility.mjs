/** Check pinned local source objects, without starting or changing either host. */
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'

const execute = promisify(execFile)
const harness = fileURLToPath(new URL('../../../deepseek-harness/', import.meta.url))
export const RELEASES = [
  ['0.2.1-rc.2', '687f282e8625c6b8d11ff58211a90524be2e4317'],
  ['0.2.2-alpha.2', 'f3803c96974ad4a94195fb97e5c637e9c2a3afe3'],
]
export async function source(commit, path) {
  return (await execute('git', ['show', `${commit}:${path}`], { cwd: harness, maxBuffer: 4 * 1024 * 1024 })).stdout
}
for (const [version, commit] of RELEASES) {
  assert.equal(JSON.parse(await source(commit, 'package.json')).version, version)
  const expect = async (path, fragments) => {
    const text = await source(commit, path)
    for (const fragment of fragments) assert.ok(text.includes(fragment), `${version}: ${path}: ${fragment}`)
    return text
  }
  await expect('packages/client/ui-sidebar/src/client/index.ts', [
    "'sidebar.brand.name': { kind: 'single', scope: 'root' }",
    "'sidebar.brand.mark': { kind: 'single', scope: 'root' }",
  ])
  await expect('packages/client/ui-sidebar/src/client/contract/slots.ts', [
    'interface SidebarBrandMarkOwnerProps', 'size: number',
  ])
  await expect('packages/client/ui-conversation/src/client/contract/slots.ts', [
    "'conversation.hero.brand.mark': { kind: 'single'; scope: 'root'", 'interface HeroBrandMarkOwnerProps',
  ])
  const hero = await expect('packages/client/ui-conversation/src/client/skeleton/EmptyHero.tsx', [
    "renderSlot('conversation.hero.brand.mark'", 'fallback: <HeroFish hovering={hovering}',
  ])
  assert.match(hero, /renderSlot\('conversation\.hero\.brand\.mark'[\s\S]*?<\/span>\s*<span className=\{css\.titleGroup\}>/)
  const sidebar = await expect('packages/client/ui-sidebar/src/client/SidebarRoot.tsx', [
    "renderSlot('sidebar.brand.name'", "renderSlot('sidebar.brand.mark'", 'toggleSidebar()',
    '<div className={css.logoRow} data-window-drag>',
  ])
  assert.match(sidebar, /<span className=\{css\.brandMark\}>[\s\S]*?<\/span>\s*<span className=\{css\.brandName\}>/)
  await expect('packages/client/ui-renderer/src/client/scoped-slots.tsx', [
    "const ANCHOR_STYLE = { display: 'contents' } as const", '<Anchor data-slot={slotKey}',
  ])
  await expect('packages/client/ui-renderer/src/client/registry.ts', [
    'inject(key: keyof SlotMap & string, callback:', 'idempotent disposer',
  ])
  await expect('packages/client/ui-brand-official/src/client/index.ts', ["name: 'sidebar.brand.name'"])
  await expect('packages/client/ui-theme/src/client/index.ts', [
    'getTheme(): ThemeSnapshot', "'theme/change'(snapshot: ThemeSnapshot): void", "colorScheme: 'light' | 'dark'",
  ])
  await expect('packages/client/ui-settings/src/client/config-form-types.ts', [
    'writable: boolean', 'revision: number | undefined', 'expectedRevision?: number',
  ])
  await expect('packages/client/ui-settings/src/client/config-form.ts', ["op: 'set', path: [field]", 'this.mutate('])
  await expect('packages/client/ui-layout/src/client/DocumentTitle.tsx', [
    'info.activePanelId === null', 'session.retainedBy.mainView ?? 0', 'title === undefined ? productTitle',
    'document.title = productTitle',
  ])
  await expect('packages/client/ui-layout/src/client/service.ts', ['readonly panelInfo: HostObservable<PanelInfo>'])
  await expect('packages/host/webserver/src/index.ts', [
    'tapIndex(transform: (html: string) => string): () => void', 'this.indexTaps.push(transform)',
    'renderIndex(html: string',
  ])
  await expect('packages/host/frontend-static/src/index.ts', ['webServer.renderIndex('])
  await expect('packages/api/session-controller/src/client/sessions/service.ts', ['readonly list: SnapshotStore<SessionListState>'])
  await expect('apps/web/index.html', ['rel="icon"', 'favicon.svg', 'favicon-dark.svg'])
  console.log(`${version}: sidebar/hero slots, CSS anchors, actual theme, persistent settings and native favicons OK`)
}
