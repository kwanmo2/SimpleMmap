import { useState } from 'react'
import { notesToPlainText, plainTextToNotesXhtml, type Topic } from '../format'
import { STOCK_ICONS } from '../format/schema'
import { useEditor } from '../store/editor'
import { locate } from '../store/ops'
import { iconVisual } from '../view/icons'

/** 선택한 토픽의 속성 편집 패널 */
export function Inspector() {
  const map = useEditor((s) => s.map)
  const selectedId = useEditor((s) => s.selectedId)
  const topic = map && selectedId ? locate(map.root, selectedId)?.topic : undefined
  if (!topic) return <aside className="inspector" />
  // 다른 토픽을 고르거나 캔버스·undo로 값이 바뀌면 입력 상태를 다시 초기화
  return <TopicInspector key={`${topic.id}\u0000${topic.text}\u0000${topic.hyperlink}\u0000${topic.notesXhtml}`} topic={topic} />
}

function TopicInspector({ topic }: { topic: Topic }) {
  const update = useEditor((s) => s.update)
  const [text, setText] = useState(topic.text)
  const [notes, setNotes] = useState(topic.notesXhtml ? notesToPlainText(topic.notesXhtml) : '')
  const [link, setLink] = useState(topic.hyperlink ?? '')

  const originalNotes = topic.notesXhtml ? notesToPlainText(topic.notesXhtml) : ''

  function commitText() {
    if (text !== topic.text) update(topic.id, (t) => void (t.text = text))
  }
  function commitNotes() {
    if (notes === originalNotes) return
    update(topic.id, (t) => void (t.notesXhtml = notes.trim() ? plainTextToNotesXhtml(notes) : null))
  }
  function commitLink() {
    const v = link.trim() || null
    if (v !== topic.hyperlink) update(topic.id, (t) => void (t.hyperlink = v))
  }
  function toggleIcon(type: string) {
    update(topic.id, (t) => {
      t.icons = t.icons.includes(type) ? t.icons.filter((i) => i !== type) : [...t.icons, type]
    })
  }

  return (
    <aside className="inspector">
      <label>
        토픽 텍스트
        <textarea rows={2} value={text} onChange={(e) => setText(e.target.value)} onBlur={commitText} />
      </label>
      <label>
        노트
        <textarea rows={8} value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={commitNotes} />
        <small>수정하면 노트 서식(굵게·표 등)은 일반 텍스트 문단으로 바뀝니다.</small>
      </label>
      <label>
        하이퍼링크
        <input
          type="url"
          placeholder="https://"
          value={link}
          onChange={(e) => setLink(e.target.value)}
          onBlur={commitLink}
          onKeyDown={(e) => e.key === 'Enter' && commitLink()}
        />
      </label>
      <div className="field">
        아이콘
        <div className="icon-grid">
          {STOCK_ICONS.map((type) => {
            const v = iconVisual(type)
            return (
              <button
                key={type}
                title={v.name}
                className={topic.icons.includes(type) ? 'on' : ''}
                onClick={() => toggleIcon(type)}
              >
                {v.flagColor ? <span className="flag" style={{ color: v.flagColor }}>⚑</span> : v.emoji}
              </button>
            )
          })}
        </div>
      </div>
    </aside>
  )
}
