import { readdir, readFile } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import { bundleClient } from './bundle.mjs'

const root = fileURLToPath(new URL('../', import.meta.url))
const execute = promisify(execFile)
async function walk(path) {
  for (const item of await readdir(path, { withFileTypes: true })) {
    const child = `${path}/${item.name}`
    if (item.name.startsWith('.')) continue
    if (item.isDirectory()) await walk(child)
    else if (/\.m?js$/.test(item.name)) await execute(process.execPath, ['--check', child])
  }
}
await walk(root)
const manifest = JSON.parse(await readFile(`${root}/package.json`, 'utf8'))
assert.equal(manifest.name, 'dsh-branding')
assert.equal(manifest.exports['./client'], './dist/client.js')
assert.equal(manifest.dsh.client.platform, 'web')
assert.ok(manifest.files.includes('src/images.js'))
assert.ok(manifest.files.includes('src/options.js'))
assert.ok(manifest.files.includes('src/host/title-shell.js'))
assert.ok(!manifest.files.includes('tests'))
let loaded
vm.runInNewContext(await bundleClient(root), { window: { __ModuleLoader__: { load: entry => { loaded = entry } } } })
assert.equal(loaded.id, manifest.name)
const plugin = loaded.factory(name => { assert.equal(name, 'react'); return {} })
assert.equal(typeof plugin.apply, 'function')
assert.deepEqual(Array.from(plugin.inject), ['slots', 'configForms', 'theme', 'sessions', 'layout'])
console.log('Source syntax, manifest and in-memory ModuleLoader bundle OK; no artifacts written.')
