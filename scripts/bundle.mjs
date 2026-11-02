import { readFile } from 'node:fs/promises'
import { dirname, resolve, relative } from 'node:path'

/** Bundle local ESM sources in memory so checks do not produce release files. */
export async function bundleClient(root) {
  const sources = new Map()
  async function collect(file) {
    const id = relative(root, file).replaceAll('\\', '/')
    if (sources.has(id)) return id
    let source = await readFile(file, 'utf8')
    sources.set(id, '')
    for (const match of [...source.matchAll(/^import\s+\{([^}]+)\}\s+from\s+['"]([^'"]+)['"];?\s*$/gm)]) {
      if (!match[2].startsWith('.')) throw new Error(`Unsupported import: ${match[2]}`)
      const dependency = await collect(resolve(dirname(file), match[2]))
      source = source.replace(match[0], `const {${match[1]}} = local(${JSON.stringify(dependency)});\n`)
    }
    const names = []
    source = source.replace(/^export\s+(async function|function|class|const|let)\s+(\w+)/gm, (_, kind, name) => {
      names.push(name)
      return `${kind} ${name}`
    })
    if (/^\s*(?:import|export)\s/m.test(source)) throw new Error(`Unsupported ESM syntax in ${id}`)
    sources.set(id, `function(local) {\n${source}\nreturn {${names.join(',')}};\n}`)
    return id
  }
  const entry = await collect(resolve(root, 'src/client.js'))
  const factories = [...sources].map(([id, code]) => `${JSON.stringify(id)}:${code}`).join(',\n')
  return `/* Generated from src/. */\nwindow.__ModuleLoader__.load({id:'dsh-branding',factory(require){\nconst factories={${factories}};\nconst cache=Object.create(null);\nconst local=id=>cache[id]??(cache[id]=factories[id](local));\nreturn local(${JSON.stringify(entry)}).makePlugin(require);\n}});\n`
}
