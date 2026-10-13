import { readFileSync } from 'node:fs'
import JSZip from 'jszip'
import { validateXML } from 'xmllint-wasm'
const zip = await JSZip.loadAsync(readFileSync(process.argv[2]))
const names = { Application: 'MindManagerApplication.xsd', Core: 'MindManagerCore.xsd', Primitive: 'MindManagerPrimitive.xsd', Delta: 'MindManagerDelta.xsd' }
const fix = (s) => s.replace(/schemaLocation="http:\/\/schemas\.mindjet\.com\/MindManager\/(\w+)\/2003"/g, (m, k) => `schemaLocation="${names[k]}"`)
const xsd = {}
for (const n of Object.values(names)) xsd[n] = fix(await zip.file('xsd/' + n).async('string'))
const xml = await zip.file('Document.xml').async('string')
const r = await validateXML({ xml: [{ fileName: 'Document.xml', contents: xml }], schema: [{ fileName: names.Application, contents: xsd[names.Application] }],
  preload: ['Core', 'Primitive', 'Delta'].map(k => ({ fileName: names[k], contents: xsd[names[k]] })) })
console.log(process.argv[2], r.valid, r.errors.slice(0, 5).map(e => e.rawMessage))
