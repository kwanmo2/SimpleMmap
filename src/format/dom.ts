import type { Document, Element } from '@xmldom/xmldom'
import { NS } from './namespaces'

export function childElements(el: Element, name?: string): Element[] {
  const out: Element[] = []
  for (let c = el.firstChild; c; c = c.nextSibling) {
    if (c.nodeType === 1 && (!name || c.nodeName === name)) out.push(c as Element)
  }
  return out
}

export function firstChild(el: Element, name: string): Element | null {
  for (let c = el.firstChild; c; c = c.nextSibling) {
    if (c.nodeType === 1 && c.nodeName === name) return c as Element
  }
  return null
}

/** 경로(요소 이름 나열)를 따라 내려간 요소. 없으면 null */
export function path(el: Element | null, ...names: string[]): Element | null {
  for (const n of names) {
    if (!el) return null
    el = firstChild(el, n)
  }
  return el
}

export function apElement(doc: Document, localName: string, attrs: Record<string, string> = {}): Element {
  const el = doc.createElementNS(NS.ap, `ap:${localName}`)
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v)
  return el
}

export function textContent(el: Element): string {
  let s = ''
  for (let c = el.firstChild; c; c = c.nextSibling) {
    if (c.nodeType === 3 || c.nodeType === 4) s += c.nodeValue ?? ''
    else if (c.nodeType === 1) s += textContent(c as Element)
  }
  return s
}
