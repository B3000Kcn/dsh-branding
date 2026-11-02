import { writeFile, mkdir, copyFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { bundleClient } from './bundle.mjs'

// Release step: run only after the user approves creating release artifacts.
const root = fileURLToPath(new URL('../', import.meta.url))
const output = await bundleClient(root)
await mkdir(new URL('../.backups/build/', import.meta.url), { recursive: true })
try {
  await copyFile(new URL('../dist/client.js', import.meta.url), new URL(`../.backups/build/client-${Date.now()}.js`, import.meta.url))
} catch (error) {
  if (error.code !== 'ENOENT') throw error
}
await mkdir(new URL('../dist/', import.meta.url), { recursive: true })
await writeFile(new URL('../dist/client.js', import.meta.url), output)
console.log(`Built ${Buffer.byteLength(output)} bytes`)
