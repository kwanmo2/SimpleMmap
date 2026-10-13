import { describe, expect, it } from 'vitest'
import JSZip from 'jszip'
import { isOId, readMmap, walkTopics, writeMmap } from '../../src/format'
import { canonical, documentXml, entriesEqual, loadSample, sampleNames, validateMmap } from '../helpers'

type WithComment = { comment: string | null }

describe.each(sampleNames)('왕복: %s', (name) => {
  it('원본 Document.xml이 번들 XSD에 유효하다 (검증기 기준선)', async () => {
    expect(await validateMmap(loadSample(name))).toEqual([])
  })

  it('모든 토픽을 읽는다', async () => {
    const bytes = loadSample(name)
    const file = await readMmap(bytes)
    const topics = [...walkTopics(file.map.root)]
    const xml = await documentXml(bytes)
    expect(topics.length).toBe(xml.match(/<ap:Topic /g)!.length)
    expect(new Set(topics.map((t) => t.id)).size).toBe(topics.length)
    expect(topics.every((t) => isOId(t.id))).toBe(true)
  })

  it('편집 없이 저장하면 모든 엔트리가 바이트 단위로 동일하고 ZIP 메타데이터가 보존된다', async () => {
    const bytes = loadSample(name)
    const out = await writeMmap(await readMmap(bytes))
    const [a, b] = await Promise.all([JSZip.loadAsync(bytes), JSZip.loadAsync(out)])

    expect((b as unknown as WithComment).comment).toBe((a as unknown as WithComment).comment)
    expect(Object.keys(b.files)).toEqual(Object.keys(a.files))
    for (const [entryName, fa] of Object.entries(a.files)) {
      const fb = b.files[entryName]
      expect({ dir: fb.dir, comment: fb.comment, date: fb.date.getTime() }).toEqual({
        dir: fa.dir,
        comment: fa.comment,
        date: fa.date.getTime(),
      })
    }
    expect(await entriesEqual(bytes, out)).toBe(true)
  })

  it('강제 재직렬화해도 XML 내용이 동일하고 XSD에 유효하다', async () => {
    const bytes = loadSample(name)
    const out = await writeMmap(await readMmap(bytes), { forceSerialize: true })
    expect(canonical(await documentXml(out))).toBe(canonical(await documentXml(bytes)))
    expect(await validateMmap(out)).toEqual([])
    expect((await readMmap(out)).map).toEqual((await readMmap(bytes)).map)
  })
})
