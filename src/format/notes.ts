// 노트(ap:NotesXhtmlData) 변환 도우미
import { DOMParser } from '@xmldom/xmldom'
import { NS } from './namespaces'
import { childElements, textContent } from './dom'

const escapeXml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** 일반 텍스트(줄바꿈 = 문단) → 노트 XHTML 내부 마크업 */
export function plainTextToNotesXhtml(text: string): string {
  return text.split(/\r?\n/).map((line) => `<p>${escapeXml(line)}</p>`).join('')
}

/** 노트 XHTML → 문단별 일반 텍스트 배열 */
export function notesParagraphs(xhtml: string): string[] {
  const doc = new DOMParser().parseFromString(`<html xmlns="${NS.xhtml}">${xhtml}</html>`, 'text/xml')
  const html = doc.documentElement!
  const blocks = childElements(html)
  if (blocks.length === 0) return [textContent(html)]
  return blocks.map((b) => textContent(b))
}

export function notesToPlainText(xhtml: string): string {
  return notesParagraphs(xhtml).join('\n')
}

/** MindManager가 NotesXhtmlData@PreviewPlainText에 쓰는 형식: 문단을 "<br><br>"로 연결, 끝의 빈 문단 제거 */
export function notesPreviewText(xhtml: string): string {
  const paras = notesParagraphs(xhtml).map((p) => p.replace(/ /g, ' '))
  while (paras.length && paras[paras.length - 1].trim() === '') paras.pop()
  return paras.join('<br><br>')
}
