// Phase 0: .mmap 샘플 분석 — ZIP 엔트리, 요소/속성 목록, ap:Topic 자식 요소 순서를 출력한다.
// 사용법: node scripts/inspect-mmap.ts tests/fixtures/*.mmap
import { readFileSync } from 'node:fs'
import JSZip from 'jszip'
import { DOMParser, type Element } from '@xmldom/xmldom'

const elements = new Map<string, Set<string>>()
const topicChildOrder = new Map<string, Set<string>>()

function walk(el: Element) {
  const attrs = elements.get(el.nodeName) ?? new Set<string>()
  for (let i = 0; i < el.attributes.length; i++) attrs.add(el.attributes[i].name)
  elements.set(el.nodeName, attrs)
  const childNames: string[] = []
  for (let c = el.firstChild; c; c = c.nextSibling) {
    if (c.nodeType !== 1) continue
    childNames.push(c.nodeName)
    walk(c as Element)
  }
  const prev = topicChildOrder.get(el.nodeName) ?? new Set<string>()
  if (childNames.length > 1) prev.add(childNames.join(' > '))
  topicChildOrder.set(el.nodeName, prev)
}

for (const file of process.argv.slice(2)) {
  const zip = await JSZip.loadAsync(readFileSync(file))
  console.log(`\n=== ${file}`)
  for (const [name, entry] of Object.entries(zip.files)) {
    if (!entry.dir) console.log(`  entry: ${name}`)
  }
  const xml = await zip.file('Document.xml')?.async('string')
  if (!xml) { console.log('  (Document.xml 없음)'); continue }
  const doc = new DOMParser().parseFromString(xml, 'text/xml')
  const root = doc.documentElement!
  console.log(`  root: ${root.nodeName}`)
  for (let i = 0; i < root.attributes.length; i++) {
    console.log(`    ${root.attributes[i].name}=${root.attributes[i].value}`)
  }
  walk(root)
}

console.log('\n=== 요소 / 속성')
for (const [name, attrs] of [...elements].sort()) console.log(`${name}: ${[...attrs].join(', ')}`)
console.log('\n=== ap:Topic 자식 요소 순서 (관찰된 패턴)')
for (const seq of topicChildOrder.get('ap:Topic') ?? []) console.log(`  ${seq}`)
