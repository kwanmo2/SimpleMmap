import JSZip from 'jszip'
import { DOMParser, XMLSerializer, type Document, type Element } from '@xmldom/xmldom'
import { childElements, path } from './dom'
import type { MindMap, Topic, TopicImage } from './model'

/** ZIP 엔트리 원본 정보 — 저장 시 순서/날짜/코멘트까지 그대로 재현한다 */
export interface ZipEntry {
  name: string
  dir: boolean
  date: Date
  comment: string | null
  data: Uint8Array | null
}

/** 저장에 필요한 원본 정보. 편집 코드에서는 직접 다루지 않는다. */
export interface Backing {
  dom: Document
  /** OId → ap:Topic 요소 */
  elements: Map<string, Element>
  entries: ZipEntry[]
  zipComment: string | null
  /** 마지막으로 읽거나 쓴 Document.xml 바이트 (무변경 저장 시 그대로 사용) */
  documentBytes: Uint8Array
  /** 마지막으로 읽거나 쓴 시점의 토픽 OId 집합 (삭제 감지용) */
  knownIds: Set<string>
}

export interface MmapFile {
  map: MindMap
  backing: Backing
}

export const DOCUMENT_ENTRY = 'Document.xml'

export async function readMmap(data: ArrayBuffer | Uint8Array): Promise<MmapFile> {
  const zip = await JSZip.loadAsync(data)
  const entries: ZipEntry[] = []
  for (const [name, f] of Object.entries(zip.files)) {
    entries.push({
      name,
      dir: f.dir,
      date: f.date,
      comment: f.comment ?? null,
      data: f.dir ? null : await f.async('uint8array'),
    })
  }
  const docEntry = entries.find((e) => e.name === DOCUMENT_ENTRY)
  if (!docEntry?.data) throw new Error('.mmap 파일에 Document.xml이 없습니다')

  const xml = new TextDecoder('utf-8').decode(docEntry.data)
  const dom = new DOMParser().parseFromString(xml, 'text/xml')
  const mapEl = dom.documentElement
  if (!mapEl || mapEl.nodeName !== 'ap:Map') throw new Error(`알 수 없는 루트 요소: ${mapEl?.nodeName}`)
  const rootEl = path(mapEl, 'ap:OneTopic', 'ap:Topic')
  if (!rootEl) throw new Error('중심 토픽(ap:OneTopic/ap:Topic)이 없습니다')

  const elements = new Map<string, Element>()
  const root = readTopic(rootEl, elements)
  return {
    map: { root },
    backing: {
      dom,
      elements,
      entries,
      zipComment: (zip as unknown as { comment?: string }).comment ?? null,
      documentBytes: docEntry.data,
      knownIds: new Set(elements.keys()),
    },
  }
}

function readTopic(el: Element, elements: Map<string, Element>): Topic {
  const id = el.getAttribute('OId')
  if (!id) throw new Error('OId 없는 ap:Topic')
  if (elements.has(id)) throw new Error(`중복 OId: ${id}`)
  elements.set(id, el)

  const viewGroup = childElements(el, 'ap:TopicViewGroup').find((v) => v.getAttribute('ViewIndex') === '0') ?? null
  const collapsedEl = path(viewGroup, 'ap:Collapsed')
  const notesEl = path(el, 'ap:NotesGroup', 'ap:NotesXhtmlData')
  const icons = elementsIn(path(el, 'ap:IconsGroup', 'ap:Icons'), 'ap:Icon')
    .map((i) => i.getAttribute('IconType'))
    .filter((t): t is string => !!t)

  return {
    id,
    text: path(el, 'ap:Text')?.getAttribute('PlainText') ?? '',
    collapsed: collapsedEl?.getAttribute('Collapsed') === 'true',
    notesXhtml: notesEl ? readNotesXhtml(notesEl) : null,
    hyperlink: path(el, 'ap:Hyperlink')?.getAttribute('Url') ?? null,
    icons,
    image: readImage(el),
    children: elementsIn(path(el, 'ap:SubTopics'), 'ap:Topic').map((c) => readTopic(c, elements)),
    floating: elementsIn(path(el, 'ap:FloatingTopics'), 'ap:Topic').map((c) => readTopic(c, elements)),
  }
}

const elementsIn = (container: Element | null, name: string) => (container ? childElements(container, name) : [])

/** ap:NotesXhtmlData 안 <html> 요소의 내부 마크업 */
export function readNotesXhtml(notesEl: Element): string {
  const html = childElements(notesEl).find((c) => c.localName === 'html')
  if (!html) return ''
  const ser = new XMLSerializer()
  let s = ''
  for (let c = html.firstChild; c; c = c.nextSibling) s += ser.serializeToString(c)
  // 직렬화 시 붙는 기본 네임스페이스 선언은 <html>에서 상속되므로 제거
  return s.replace(/ xmlns="http:\/\/www\.w3\.org\/1999\/xhtml"/g, '')
}

function readImage(el: Element): TopicImage | null {
  const image = path(el, 'ap:OneImage', 'ap:Image')
  const data = path(image, 'ap:ImageData')
  const uri = path(data, 'cor:Uri')?.textContent?.trim()
  if (!image || !data || !uri) return null
  const size = path(image, 'ap:ImageSize')
  const num = (v: string | null | undefined) => (v ? Number(v) : null)
  return {
    uri,
    imageType: data.getAttribute('ImageType'),
    width: num(size?.getAttribute('Width')),
    height: num(size?.getAttribute('Height')),
  }
}

/** mmarch://bin/… URI가 가리키는 ZIP 엔트리 데이터 */
export function resolveArchiveUri(file: MmapFile, uri: string): Uint8Array | null {
  const m = /^mmarch:\/\/(.+)$/.exec(uri)
  if (!m) return null
  return file.backing.entries.find((e) => e.name === m[1])?.data ?? null
}
