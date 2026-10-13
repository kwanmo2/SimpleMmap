import JSZip from 'jszip'
import { DOMParser, XMLSerializer, type Document, type Element } from '@xmldom/xmldom'
import { apElement, childElements, firstChild, path } from './dom'
import { NS } from './namespaces'
import { notesPreviewText } from './notes'
import { DOCUMENT_ENTRY, readNotesXhtml, type Backing, type MmapFile } from './reader'
import { TOPIC_CHILD_ORDER, insertInOrder } from './schema'
import { walkTopics, type Topic } from './model'

const DIRTY = '0000000000000001'
const GEN = '0000000000000000'
const XML_DECLARATION = '<?xml version="1.0" encoding="UTF-8" standalone="no"?>'

export interface WriteOptions {
  /** 변경이 없어도 Document.xml을 다시 직렬화한다 (테스트용) */
  forceSerialize?: boolean
}

/**
 * 모델을 원본 DOM에 반영하고 .mmap ZIP 바이트를 만든다.
 * 모델이 다루지 않는 요소·속성과 ZIP의 다른 엔트리는 그대로 보존된다.
 */
export async function writeMmap(file: MmapFile, options: WriteOptions = {}): Promise<Uint8Array> {
  const { backing } = file
  const changed = syncDocument(file)

  if (changed || options.forceSerialize) {
    backing.documentBytes = new TextEncoder().encode(serializeDocument(backing.dom))
  }

  const zip = new JSZip()
  for (const e of backing.entries) {
    const opts = { date: e.date, comment: e.comment ?? undefined, createFolders: false }
    if (e.dir) {
      zip.file(e.name, null, { ...opts, dir: true })
    } else {
      const data = e.name === DOCUMENT_ENTRY ? backing.documentBytes : e.data!
      zip.file(e.name, data, { ...opts, binary: true })
    }
  }
  const docEntry = backing.entries.find((e) => e.name === DOCUMENT_ENTRY)!
  docEntry.data = backing.documentBytes

  return zip.generateAsync({
    type: 'uint8array',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
    comment: backing.zipComment ?? undefined,
  })
}

/** 모델 → DOM 반영. DOM이 실제로 바뀌었으면 true */
export function syncDocument(file: MmapFile): boolean {
  const { map, backing } = file
  const ctx = { backing, changed: false }

  const rootEl = path(backing.dom.documentElement, 'ap:OneTopic', 'ap:Topic')!
  const rootModelEl = syncTopic(map.root, ctx)
  if (rootModelEl !== rootEl) throw new Error('중심 토픽은 교체할 수 없습니다')

  const currentIds = new Set<string>()
  for (const t of walkTopics(map.root)) currentIds.add(t.id)
  const deleted = [...backing.knownIds].filter((id) => !currentIds.has(id))
  if (deleted.length) {
    removeReferences(backing.dom, new Set(deleted))
    // 분리된 요소는 elements에 남겨 둔다 — undo로 토픽이 되살아나면 미지원 데이터까지 그대로 복원된다
    ctx.changed = true
  }
  backing.knownIds = currentIds
  return ctx.changed
}

interface SyncContext {
  backing: Backing
  changed: boolean
}

function syncTopic(topic: Topic, ctx: SyncContext): Element {
  const doc = ctx.backing.dom
  let el = ctx.backing.elements.get(topic.id)
  if (!el) {
    el = createTopicElement(doc, topic.id)
    ctx.backing.elements.set(topic.id, el)
    ctx.changed = true
  }

  syncText(el, topic.text, ctx)
  syncCollapsed(el, topic.collapsed, ctx)
  syncNotes(el, topic.notesXhtml, ctx)
  syncHyperlink(el, topic.hyperlink, ctx)
  syncIcons(el, topic.icons, ctx)
  syncTopicList(el, 'ap:SubTopics', topic.children.map((c) => syncTopic(c, ctx)), ctx)
  syncTopicList(el, 'ap:FloatingTopics', topic.floating.map((c) => syncTopic(c, ctx)), ctx)
  return el
}

function createTopicElement(doc: Document, id: string): Element {
  const el = apElement(doc, 'Topic', { Dirty: DIRTY, OId: id, Gen: GEN })
  el.appendChild(apElement(doc, 'TopicViewGroup', { ViewIndex: '0' }))
  const text = apElement(doc, 'Text', { Dirty: DIRTY, PlainText: '', ReadOnly: 'false' })
  text.appendChild(apElement(doc, 'Font'))
  el.appendChild(text)
  return el
}

/** el 아래에 name 요소를 찾고, 없으면 스키마 순서대로 만들어 넣는다 */
function ensureChild(el: Element, name: string, attrs: Record<string, string>, ctx: SyncContext): Element {
  let child = firstChild(el, name)
  if (!child) {
    child = apElement(ctx.backing.dom, name.slice(3), attrs)
    insertInOrder(el, child, TOPIC_CHILD_ORDER)
    ctx.changed = true
  }
  return child
}

function setAttr(el: Element, name: string, value: string, ctx: SyncContext) {
  if (el.getAttribute(name) !== value) {
    el.setAttribute(name, value)
    ctx.changed = true
  }
}

function remove(el: Element | null, ctx: SyncContext) {
  if (el?.parentNode) {
    el.parentNode.removeChild(el)
    ctx.changed = true
  }
}

function syncText(el: Element, text: string, ctx: SyncContext) {
  const textEl = firstChild(el, 'ap:Text')
  if ((textEl?.getAttribute('PlainText') ?? '') === text) return
  const t = textEl ?? ensureChild(el, 'ap:Text', { Dirty: DIRTY, ReadOnly: 'false' }, ctx)
  if (!firstChild(t, 'ap:Font')) t.insertBefore(apElement(ctx.backing.dom, 'Font'), t.firstChild)
  setAttr(t, 'PlainText', text, ctx)
  // 글자 범위 서식은 이전 텍스트 기준 오프셋이라 텍스트가 바뀌면 무효
  for (const r of [...childElements(t, 'ap:FontRange'), ...childElements(t, 'ap:IgnoreSpellingRange')]) remove(r, ctx)
}

function syncCollapsed(el: Element, collapsed: boolean, ctx: SyncContext) {
  const view = childElements(el, 'ap:TopicViewGroup').find((v) => v.getAttribute('ViewIndex') === '0')
  const current = path(view ?? null, 'ap:Collapsed')
  if ((current?.getAttribute('Collapsed') === 'true') === collapsed) return
  if (current) {
    setAttr(current, 'Collapsed', String(collapsed), ctx)
    return
  }
  const v = view ?? ensureChild(el, 'ap:TopicViewGroup', { ViewIndex: '0' }, ctx)
  // TopicViewGroup 시퀀스의 첫 요소이므로 맨 앞에 삽입
  v.insertBefore(apElement(ctx.backing.dom, 'Collapsed', { Collapsed: String(collapsed), Dirty: DIRTY }), v.firstChild)
  ctx.changed = true
}

function syncNotes(el: Element, xhtml: string | null, ctx: SyncContext) {
  const group = firstChild(el, 'ap:NotesGroup')
  const data = path(group, 'ap:NotesXhtmlData')
  if (xhtml === null) {
    if (!data) return
    remove(data, ctx)
    if (group && childElements(group).length === 0) remove(group, ctx)
    return
  }
  if (data && readNotesXhtml(data) === xhtml) return

  const doc = ctx.backing.dom
  const g = group ?? ensureChild(el, 'ap:NotesGroup', {}, ctx)
  let d = data
  if (!d) {
    // NotesGroup 시퀀스의 첫 요소
    d = apElement(doc, 'NotesXhtmlData', { Dirty: DIRTY })
    g.insertBefore(d, g.firstChild)
  }
  while (d.firstChild) d.removeChild(d.firstChild)
  const parsed = new DOMParser().parseFromString(`<html xmlns="${NS.xhtml}">${xhtml}</html>`, 'text/xml')
  d.appendChild(doc.importNode(parsed.documentElement!, true))
  d.setAttribute('PreviewPlainText', notesPreviewText(xhtml))
  ctx.changed = true
}

function syncHyperlink(el: Element, url: string | null, ctx: SyncContext) {
  const link = firstChild(el, 'ap:Hyperlink')
  if (url === null) {
    remove(link, ctx)
    return
  }
  const l = link ?? ensureChild(el, 'ap:Hyperlink', { Dirty: DIRTY }, ctx)
  setAttr(l, 'Url', url, ctx)
}

function syncIcons(el: Element, icons: string[], ctx: SyncContext) {
  const group = firstChild(el, 'ap:IconsGroup')
  const iconsEl = path(group, 'ap:Icons')
  const current = iconsEl ? childElements(iconsEl, 'ap:Icon').map((i) => i.getAttribute('IconType')) : []
  if (current.length === icons.length && current.every((c, i) => c === icons[i])) return

  if (icons.length === 0) {
    remove(iconsEl, ctx)
    if (group && childElements(group).length === 0) remove(group, ctx)
    return
  }
  const doc = ctx.backing.dom
  const g = group ?? ensureChild(el, 'ap:IconsGroup', {}, ctx)
  let list = iconsEl
  if (!list) {
    list = apElement(doc, 'Icons', { Dirty: DIRTY })
    g.insertBefore(list, g.firstChild)
  }
  for (const i of childElements(list, 'ap:Icon')) list.removeChild(i)
  for (const type of icons) {
    // ap:Icon은 Dirty 속성을 허용하지 않는다 (XSD)
    const icon = apElement(doc, 'Icon', { IconType: type })
    icon.setAttributeNS(NS.xsi, 'xsi:type', 'ap:StockIcon')
    list.appendChild(icon)
  }
  ctx.changed = true
}

/** SubTopics / FloatingTopics 안의 토픽 요소를 desired 순서와 일치시킨다 (이동·삭제·추가) */
function syncTopicList(el: Element, containerName: string, desired: Element[], ctx: SyncContext) {
  const container = firstChild(el, containerName)
  const current = container ? childElements(container, 'ap:Topic') : []
  if (current.length === desired.length && current.every((c, i) => c === desired[i])) return

  if (desired.length === 0) {
    remove(container, ctx)
    return
  }
  const c = container ?? ensureChild(el, containerName, {}, ctx)
  for (const t of current) c.removeChild(t)
  for (const t of desired) c.appendChild(t) // 다른 부모에 있던 요소는 자동으로 이동
  ctx.changed = true
}

/** 삭제된 토픽을 가리키는 관계선·선택 참조 정리 */
function removeReferences(dom: Document, deleted: Set<string>) {
  // 관계선은 cor:ObjectReference, 선택(ap:Selection)은 ap:ObjectReference로 참조한다
  const all = dom.getElementsByTagName('*')
  const doomed: Element[] = []
  for (let i = 0; i < all.length; i++) {
    const ref = all[i]
    if (!ref.localName?.endsWith('ObjectReference') || !deleted.has(ref.getAttribute('OIdRef') ?? '')) continue
    let rel: Element | null = ref
    while (rel && rel.nodeName !== 'ap:Relationship') rel = rel.parentNode as Element | null
    doomed.push(rel ?? ref)
  }
  for (const el of doomed) el.parentNode?.removeChild(el)
}

export function serializeDocument(dom: Document): string {
  let xml = new XMLSerializer().serializeToString(dom)
  if (!xml.startsWith('<?xml')) xml = `${XML_DECLARATION}\r\n${xml}`
  return xml
}
