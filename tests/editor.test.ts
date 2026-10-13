import { beforeEach, describe, expect, it } from 'vitest'
import { readMmap, walkTopics, writeMmap } from '../src/format'
import { layoutMap, type Measure } from '../src/layout/layout'
import { useEditor } from '../src/store/editor'
import { locate } from '../src/store/ops'
import { loadSample, sampleNames, validateMmap } from './helpers'

const fakeMeasure: Measure = (text, font) => text.length * (font.includes('bold') ? 8 : 7)
const ed = useEditor.getState

describe('편집기 스토어', () => {
  beforeEach(async () => {
    ed().load(await readMmap(loadSample('Sensor.mmap')), 'Sensor.mmap', null)
  })

  it('추가·삭제·이동·undo/redo 후 저장한 파일이 XSD에 유효하고 다시 읽으면 같다', async () => {
    const root = ed().map!.root
    const first = root.children[0]
    const second = root.children[1]

    ed().addChild(first.id)
    const added = ed().selectedId!
    expect(ed().editingId).toBe(added)
    ed().update(added, (t) => void (t.text = '추가'))
    ed().addSibling(added)
    ed().update(ed().selectedId!, (t) => void (t.text = '형제'))
    ed().move(added, second.id)
    ed().remove(first.children[0]?.id ?? first.id)

    const before = ed().map
    ed().undo()
    ed().redo()
    expect(ed().map).toBe(before)

    const out = await writeMmap(ed().currentFile()!)
    expect(await validateMmap(out)).toEqual([])
    expect((await readMmap(out)).map).toEqual(ed().map)
    expect(locate(ed().map!.root, added)!.parent!.id).toBe(second.id)
  })

  it('자기 하위로는 이동하지 않는다', () => {
    const first = ed().map!.root.children.find((c) => c.children.length)!
    const map = ed().map
    ed().move(first.id, first.children[0].id)
    expect(ed().map).toBe(map)
  })

  it('저장 후 삭제를 undo하면 토픽의 미지원 데이터까지 복원된다', async () => {
    const withChildren = ed().map!.root.children.find((c) => c.children.length)!
    const count = [...walkTopics(withChildren)].length
    ed().remove(withChildren.id)
    await writeMmap(ed().currentFile()!)
    ed().undo()
    const out = await writeMmap(ed().currentFile()!)
    expect(await validateMmap(out)).toEqual([])
    const reread = await readMmap(out)
    expect([...walkTopics(locate(reread.map.root, withChildren.id)!.topic)].length).toBe(count)
  })
})

describe.each(sampleNames)('레이아웃: %s', (name) => {
  it('모든 토픽이 서로 겹치지 않는다', async () => {
    const { map } = await readMmap(loadSample(name))
    // 접힌 토픽까지 모두 펼쳐서 검사
    for (const t of walkTopics(map.root)) t.collapsed = false
    const { nodes } = layoutMap(map, fakeMeasure)
    const boxes = [...nodes.values()]
    expect(boxes.length).toBe([...walkTopics(map.root)].length)
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i]
        const b = boxes[j]
        const overlap = Math.abs(a.x - b.x) < (a.w + b.w) / 2 && Math.abs(a.y - b.y) < (a.h + b.h) / 2
        expect(overlap, `${a.topic.text} / ${b.topic.text}`).toBe(false)
      }
    }
  })
})
