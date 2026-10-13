// samples/*.mmap을 편집해 test-output/에 저장한다 — 실제 MindManager에서 열어 호환성을 확인하기 위한 파일
// 사용법: npm run make-edited
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createTopic, plainTextToNotesXhtml, readMmap, writeMmap } from '../src/format'

const outDir = 'test-output'
mkdirSync(outDir, { recursive: true })

for (const name of readdirSync('samples').filter((f) => f.endsWith('.mmap'))) {
  const file = await readMmap(readFileSync(join('samples', name)))
  const root = file.map.root

  const added = createTopic('mmapmind에서 추가한 토픽')
  added.notesXhtml = plainTextToNotesXhtml('mmapmind 노트 첫 줄\n둘째 줄')
  added.hyperlink = 'https://example.com'
  added.icons = ['urn:mindjet:FlagGreen', 'urn:mindjet:Lightbulb']
  added.children.push(createTopic('하위 토픽 1'), createTopic('하위 토픽 2'))
  root.children.push(added)
  if (root.children.length > 1) root.children[0].text += ' (수정됨)'

  const out = join(outDir, name.replace(/\.mmap$/, '.edited.mmap'))
  writeFileSync(out, await writeMmap(file))
  console.log(`저장: ${out}`)
}
