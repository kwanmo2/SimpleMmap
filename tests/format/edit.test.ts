import { describe, expect, it } from 'vitest'
import JSZip from 'jszip'
import type { Element } from '@xmldom/xmldom'
import {
  createTopic,
  notesToPlainText,
  plainTextToNotesXhtml,
  readMmap,
  walkTopics,
  writeMmap,
  type Topic,
} from '../../src/format'
import { childElements, firstChild } from '../../src/format/dom'
import { TOPIC_CHILD_ORDER } from '../../src/format/schema'
import { documentXml, entriesEqual, loadSample, parseXml, sampleNames, validateMmap } from '../helpers'

const find = (root: Topic, pred: (t: Topic) => boolean) => [...walkTopics(root)].find(pred)

/** 미지원 영역(스타일·문서정보·마커·뷰)의 XML 조각 */
function preservedSections(xml: string): string[] {
  return ['ap:StyleGroup', 'ap:DocumentGroup', 'ap:MarkersSetGroup', 'ap:MapViewGroup'].map((tag) => {
    const start = xml.indexOf(`<${tag}`)
    return start < 0 ? '' : xml.slice(start, xml.indexOf(`</${tag}>`, start))
  })
}

/** ap:Topic 자식 요소가 XSD 시퀀스 순서를 어기는 경우 목록 */
function topicOrderViolations(xml: string): string[] {
  const order: readonly string[] = TOPIC_CHILD_ORDER
  const topics = parseXml(xml).getElementsByTagName('ap:Topic')
  const violations: string[] = []
  for (let i = 0; i < topics.length; i++) {
    const names = childElements(topics[i]).map((c) => c.nodeName)
    const idx = names.map((n) => order.indexOf(n))
    if (idx.some((v, k) => k > 0 && v < idx[k - 1])) violations.push(names.join(','))
  }
  return violations
}

describe.each(sampleNames)('편집 후 저장: %s', (name) => {
  it('추가·삭제·이동·텍스트·접기·노트·링크·아이콘 편집이 저장되고 XSD에 유효하다', async () => {
    const original = loadSample(name)
    const file = await readMmap(original)
    const root = file.map.root

    // 1) 중심 토픽 텍스트 변경
    root.text = `${root.text} (편집됨)`
    // 2) 새 하위 토픽 + 노트/링크/아이콘 + 손자 토픽
    const added = createTopic('새 토픽 <&> "따옴표"')
    added.notesXhtml = plainTextToNotesXhtml('첫 줄\n둘째 줄 <태그> & 기호')
    added.hyperlink = 'https://example.com/?a=1&b=2'
    added.icons = ['urn:mindjet:FlagGreen', 'urn:mindjet:Lightbulb']
    added.children.push(createTopic('손자 토픽'))
    root.children.push(added)
    // 3) 첫 번째 주 토픽의 첫 자식을 새 토픽 아래로 이동
    const first = root.children[0]
    const moved = first.children.shift()
    if (moved) added.children.unshift(moved)
    // 4) 두 번째 주 토픽(새 토픽 제외) 삭제
    const deleted = root.children.length > 2 ? root.children.splice(1, 1)[0] : null
    // 5) 접기 토글
    first.collapsed = !first.collapsed
    // 6) 기존 노트가 있으면 제거
    const withNotes = find(root, (t) => t.notesXhtml !== null && t !== added)
    if (withNotes) withNotes.notesXhtml = null

    const out = await writeMmap(file)
    const xml = await documentXml(out)

    expect(await validateMmap(out)).toEqual([])
    expect(topicOrderViolations(xml)).toEqual([])

    const reread = await readMmap(out)
    expect(reread.map).toEqual(file.map)
    const addedBack = find(reread.map.root, (t) => t.id === added.id)!
    expect(notesToPlainText(addedBack.notesXhtml!)).toBe('첫 줄\n둘째 줄 <태그> & 기호')
    if (deleted) for (const t of walkTopics(deleted)) expect(xml).not.toContain(t.id)

    // 미지원 영역과 Document.xml 외 엔트리는 그대로
    expect(preservedSections(xml)).toEqual(preservedSections(await documentXml(original)))
    expect(await entriesEqual(original, out, ['Document.xml'])).toBe(true)
  })

  it('저장 결과를 다시 읽어 편집 없이 저장하면 Document.xml이 그대로다', async () => {
    const file = await readMmap(loadSample(name))
    file.map.root.children.push(createTopic('x'))
    const once = await writeMmap(file)
    const twice = await writeMmap(await readMmap(once))
    expect(await documentXml(twice)).toBe(await documentXml(once))
  })
})

describe('세부 동작', () => {
  const textOf = (el: Element) => firstChild(el, 'ap:Text')!

  it('텍스트를 바꾸면 이전 텍스트 기준의 FontRange를 제거한다', async () => {
    for (const name of sampleNames) {
      const file = await readMmap(loadSample(name))
      const target = [...walkTopics(file.map.root)].find(
        (t) => childElements(textOf(file.backing.elements.get(t.id)!), 'ap:FontRange').length > 0,
      )
      if (!target) continue

      target.text = '변경된 텍스트'
      const out = await writeMmap(file)
      expect(await validateMmap(out)).toEqual([])
      expect(childElements(textOf(file.backing.elements.get(target.id)!), 'ap:FontRange')).toEqual([])
      return
    }
    throw new Error('FontRange가 있는 샘플이 없습니다')
  })

  it('이미지가 있는 토픽의 이미지 정보와 바이너리를 읽는다', async () => {
    const { resolveArchiveUri } = await import('../../src/format')
    for (const name of sampleNames) {
      const file = await readMmap(loadSample(name))
      const withImage = find(file.map.root, (t) => t.image !== null)
      if (!withImage) continue
      const data = resolveArchiveUri(file, withImage.image!.uri)!
      expect(withImage.image!.imageType).toBe('urn:mindjet:PngImage')
      expect([...data.slice(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]) // PNG 시그니처
      return
    }
    throw new Error('이미지가 있는 샘플이 없습니다')
  })

  it('XSD 검증기는 잘못된 요소 순서를 실제로 거부한다', async () => {
    const zip = await JSZip.loadAsync(loadSample(sampleNames[0]))
    const xml = await zip.file('Document.xml')!.async('string')
    zip.file('Document.xml', xml.replace('<ap:TopicViewGroup ', '<ap:Hyperlink Url="x"/><ap:TopicViewGroup '))
    expect((await validateMmap(await zip.generateAsync({ type: 'uint8array' }))).length).toBeGreaterThan(0)
  })
})
