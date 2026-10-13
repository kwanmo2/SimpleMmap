import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import JSZip from 'jszip'
import { DOMParser, type Element } from '@xmldom/xmldom'
import { validateXML } from 'xmllint-wasm'

export const SAMPLES_DIR = join(import.meta.dirname, '..', 'samples')
export const sampleNames = readdirSync(SAMPLES_DIR).filter((f) => f.endsWith('.mmap')).sort()
export const loadSample = (name: string) => new Uint8Array(readFileSync(join(SAMPLES_DIR, name)))

const XSD_FILES: Record<string, string> = {
  Application: 'MindManagerApplication.xsd',
  Core: 'MindManagerCore.xsd',
  Primitive: 'MindManagerPrimitive.xsd',
  Delta: 'MindManagerDelta.xsd',
}

/** .mmap 안의 Document.xml을 같은 파일에 번들된 MindManager XSD로 검증한다 */
export async function validateMmap(bytes: Uint8Array): Promise<string[]> {
  const zip = await JSZip.loadAsync(bytes)
  const xsd: Record<string, string> = {}
  for (const file of Object.values(XSD_FILES)) {
    const raw = await zip.file(`xsd/${file}`)!.async('string')
    // 원격 schemaLocation을 로컬 파일 이름으로 치환
    xsd[file] = raw.replace(
      /schemaLocation="http:\/\/schemas\.mindjet\.com\/MindManager\/(\w+)\/2003"/g,
      (_, k: string) => `schemaLocation="${XSD_FILES[k]}"`,
    )
  }
  const result = await validateXML({
    xml: [{ fileName: 'Document.xml', contents: await zip.file('Document.xml')!.async('string') }],
    schema: [{ fileName: XSD_FILES.Application, contents: xsd[XSD_FILES.Application] }],
    preload: ['Core', 'Primitive', 'Delta'].map((k) => ({ fileName: XSD_FILES[k], contents: xsd[XSD_FILES[k]] })),
  })
  return result.errors.map((e) => e.rawMessage)
}

export async function documentXml(bytes: Uint8Array): Promise<string> {
  const zip = await JSZip.loadAsync(bytes)
  return zip.file('Document.xml')!.async('string')
}

export const parseXml = (xml: string) => new DOMParser().parseFromString(xml, 'text/xml')

/** 속성 순서·네임스페이스 선언 위치에 무관한 정규화 표현 */
export function canonical(xml: string): string {
  const out: string[] = []
  const visit = (el: Element, depth: number) => {
    const attrs: string[] = []
    for (let i = 0; i < el.attributes.length; i++) {
      const a = el.attributes[i]
      if (a.name === 'xmlns' || a.name.startsWith('xmlns:')) continue
      attrs.push(`{${a.namespaceURI ?? ''}}${a.localName}=${a.value}`)
    }
    out.push(`${' '.repeat(depth)}{${el.namespaceURI}}${el.localName} ${attrs.sort().join(' ')}`)
    for (let c = el.firstChild; c; c = c.nextSibling) {
      if (c.nodeType === 1) visit(c as Element, depth + 1)
      else if (c.nodeType === 3 || c.nodeType === 4) out.push(`${' '.repeat(depth + 1)}#${c.nodeValue}`)
    }
  }
  visit(parseXml(xml).documentElement!, 0)
  return out.join('\n')
}

export async function entriesEqual(a: Uint8Array, b: Uint8Array, skip: string[] = []) {
  const [za, zb] = await Promise.all([JSZip.loadAsync(a), JSZip.loadAsync(b)])
  for (const [name, fa] of Object.entries(za.files)) {
    if (fa.dir || skip.includes(name)) continue
    const fb = zb.files[name]
    if (!fb) return false
    if (!Buffer.from(await fb.async('uint8array')).equals(Buffer.from(await fa.async('uint8array')))) return false
  }
  return true
}
