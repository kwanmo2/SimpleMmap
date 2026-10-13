import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import type { Backing } from '../format/reader'
import { BADGE_SIZE, ICON_SIZE, layoutMap, neighbor, type NodeBox } from '../layout/layout'
import { measureText } from '../layout/measure'
import { useEditor } from '../store/editor'
import { contains } from '../store/ops'
import { iconVisual } from './icons'

interface View {
  x: number
  y: number
  k: number
}

interface DragState {
  id: string
  startX: number
  startY: number
  active: boolean
  mapX: number
  mapY: number
  targetId: string | null
}

export interface MindMapViewHandle {
  fit(): void
  focus(): void
}

const MIN_ZOOM = 0.15
const MAX_ZOOM = 3

export const MindMapView = forwardRef<MindMapViewHandle, { onSave(): void }>(function MindMapView({ onSave }, ref) {
  const map = useEditor((s) => s.map)
  const backing = useEditor((s) => s.backing)
  const selectedId = useEditor((s) => s.selectedId)
  const editingId = useEditor((s) => s.editingId)
  const ed = useEditor.getState

  const layout = useMemo(() => (map ? layoutMap(map, measureText) : null), [map])
  const imageUrls = useImageUrls(backing)

  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const [view, setView] = useState<View>({ x: 0, y: 0, k: 1 })
  const [draft, setDraft] = useState('')
  const typingRef = useRef(false)
  const panRef = useRef<{ x: number; y: number; vx: number; vy: number } | null>(null)
  const [drag, setDrag] = useState<DragState | null>(null)

  const focus = useCallback(() => inputRef.current?.focus({ preventScroll: true }), [])

  const fit = useCallback(() => {
    const el = containerRef.current
    if (!el || !layout) return
    const { minX, minY, maxX, maxY } = layout.bounds
    const W = el.clientWidth
    const H = el.clientHeight
    const k = Math.min(1.2, (W - 80) / Math.max(1, maxX - minX), (H - 80) / Math.max(1, maxY - minY))
    const kk = Math.max(MIN_ZOOM, k)
    setView({ k: kk, x: W / 2 - ((minX + maxX) / 2) * kk, y: H / 2 - ((minY + maxY) / 2) * kk })
  }, [layout])

  useImperativeHandle(ref, () => ({ fit, focus }), [fit, focus])

  // 새 파일을 열면 화면 맞춤
  const fittedFor = useRef<Backing | null>(null)
  useEffect(() => {
    if (backing && layout && fittedFor.current !== backing) {
      fittedFor.current = backing
      fit()
      focus()
    }
  }, [backing, layout, fit, focus])

  // 편집 시작(새 토픽 추가, F2 등) 시 현재 텍스트로 초기화. 타이핑으로 시작한 경우는 입력값 유지
  useEffect(() => {
    if (!editingId) {
      setDraft('')
      return
    }
    if (typingRef.current) {
      typingRef.current = false
    } else {
      const box = layout?.nodes.get(editingId)
      setDraft(box?.topic.text ?? '')
      requestAnimationFrame(() => {
        const input = inputRef.current
        if (input) input.setSelectionRange(input.value.length, input.value.length)
      })
    }
    focus()
    // layout은 편집 시작 시점 값만 필요
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingId])

  // 선택한 토픽이 화면 밖이면 보이도록 스크롤
  useEffect(() => {
    const el = containerRef.current
    const n = selectedId && layout?.nodes.get(selectedId)
    if (!el || !n) return
    const margin = 40
    // 같은 커밋에서 화면 맞춤이 먼저 적용될 수 있으므로 최신 view(v) 기준으로 계산
    setView((v) => {
      const left = v.x + (n.x - n.w / 2) * v.k
      const right = v.x + (n.x + n.w / 2) * v.k
      const top = v.y + (n.y - n.h / 2) * v.k
      const bottom = v.y + (n.y + n.h / 2) * v.k
      let dx = 0
      let dy = 0
      if (left < margin) dx = margin - left
      else if (right > el.clientWidth - margin) dx = el.clientWidth - margin - right
      if (top < margin) dy = margin - top
      else if (bottom > el.clientHeight - margin) dy = el.clientHeight - margin - bottom
      return dx || dy ? { ...v, x: v.x + dx, y: v.y + dy } : v
    })
    // 선택이 바뀔 때만
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, layout])

  // 창 크기가 바뀌면 화면 중심 유지
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    let prev = { w: el.clientWidth, h: el.clientHeight }
    const ro = new ResizeObserver(() => {
      const w = el.clientWidth
      const h = el.clientHeight
      const dx = (w - prev.w) / 2
      const dy = (h - prev.h) / 2
      prev = { w, h }
      if (dx || dy) setView((v) => ({ ...v, x: v.x + dx, y: v.y + dy }))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // 휠: 스크롤 = 이동, Ctrl+휠(터치패드 핀치) = 확대/축소
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      if (e.ctrlKey || e.metaKey) {
        const rect = el.getBoundingClientRect()
        const px = e.clientX - rect.left
        const py = e.clientY - rect.top
        setView((v) => {
          const k = clamp(v.k * Math.exp(-e.deltaY * 0.0015), MIN_ZOOM, MAX_ZOOM)
          return { k, x: px - ((px - v.x) * k) / v.k, y: py - ((py - v.y) * k) / v.k }
        })
      } else {
        setView((v) => ({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY }))
      }
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  function toMap(clientX: number, clientY: number) {
    const rect = containerRef.current!.getBoundingClientRect()
    return { x: (clientX - rect.left - view.x) / view.k, y: (clientY - rect.top - view.y) / view.k }
  }

  function commitEdit() {
    const { editingId: id, update, setEditing } = ed()
    if (!id) return
    const box = layout?.nodes.get(id)
    if (box && box.topic.text !== draft) update(id, (t) => void (t.text = draft))
    setEditing(null)
  }

  function startEditFromTyping(value: string) {
    const id = ed().selectedId
    if (!id) return
    typingRef.current = true
    setDraft(value)
    ed().setEditing(id)
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    const s = ed()
    const id = s.selectedId
    const composing = e.nativeEvent.isComposing || e.key === 'Process'
    const mod = e.ctrlKey || e.metaKey

    if (mod && e.key.toLowerCase() === 's') {
      e.preventDefault()
      if (s.editingId) commitEdit()
      onSave()
      return
    }

    if (s.editingId) {
      if (composing) return
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        commitEdit()
      } else if (e.key === 'Escape') {
        e.preventDefault()
        s.setEditing(null)
      } else if (e.key === 'Tab' || e.key === 'Insert') {
        e.preventDefault()
        const editing = s.editingId
        commitEdit()
        ed().addChild(editing)
      }
      return
    }

    if (!id || composing) return
    const handled = () => e.preventDefault()
    if (mod && e.key.toLowerCase() === 'z') {
      handled()
      if (e.shiftKey) s.redo()
      else s.undo()
    } else if (mod && e.key.toLowerCase() === 'y') {
      handled()
      s.redo()
    } else if (mod) {
      return
    } else if (e.key === 'Enter') {
      handled()
      s.addSibling(id)
    } else if (e.key === 'Tab' || e.key === 'Insert') {
      handled()
      s.addChild(id)
    } else if (e.key === 'Delete') {
      handled()
      s.remove(id)
    } else if (e.key === 'F2') {
      handled()
      s.setEditing(id)
    } else if (e.key === ' ' ) {
      // 스페이스: 접기/펼치기
      const box = layout?.nodes.get(id)
      if (box && box.topic.children.length && box.depth > 0) {
        handled()
        s.update(id, (t) => void (t.collapsed = !t.collapsed))
      }
    } else if (e.key.startsWith('Arrow') && layout) {
      handled()
      const dir = e.key.slice(5).toLowerCase() as 'left' | 'right' | 'up' | 'down'
      const next = neighbor(layout, id, dir)
      if (next) s.select(next)
    }
  }

  function onPointerDownBackground(e: React.PointerEvent) {
    if (e.button !== 0) return
    commitEdit()
    panRef.current = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y }
    containerRef.current?.setPointerCapture(e.pointerId)
  }

  function onPointerDownNode(e: React.PointerEvent, id: string) {
    if (e.button !== 0) return
    e.stopPropagation()
    if (ed().editingId !== id) commitEdit()
    ed().select(id)
    const p = toMap(e.clientX, e.clientY)
    setDrag({ id, startX: e.clientX, startY: e.clientY, active: false, mapX: p.x, mapY: p.y, targetId: null })
    containerRef.current?.setPointerCapture(e.pointerId)
  }

  function onPointerMove(e: React.PointerEvent) {
    const pan = panRef.current
    if (pan) {
      setView((v) => ({ ...v, x: pan.vx + e.clientX - pan.x, y: pan.vy + e.clientY - pan.y }))
      return
    }
    if (!drag || !layout || !map) return
    const moved = Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) > 5
    if (!drag.active && (!moved || drag.id === map.root.id)) return
    const p = toMap(e.clientX, e.clientY)
    const dragged = layout.nodes.get(drag.id)!.topic
    let targetId: string | null = null
    for (const n of layout.nodes.values()) {
      if (Math.abs(p.x - n.x) <= n.w / 2 && Math.abs(p.y - n.y) <= n.h / 2 && !contains(dragged, n.id)) {
        targetId = n.id
        break
      }
    }
    setDrag({ ...drag, active: true, mapX: p.x, mapY: p.y, targetId })
  }

  function onPointerUp() {
    panRef.current = null
    if (drag?.active && drag.targetId) ed().move(drag.id, drag.targetId)
    setDrag(null)
    focus()
  }

  if (!map || !layout) return null

  const selected = selectedId ? layout.nodes.get(selectedId) : undefined
  const editing = editingId ? layout.nodes.get(editingId) : undefined
  const anchor = editing ?? selected
  const draggedBox = drag?.active ? layout.nodes.get(drag.id) : undefined

  return (
    <div
      ref={containerRef}
      className="canvas"
      onPointerDown={onPointerDownBackground}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      <svg width="100%" height="100%">
        <g transform={`translate(${view.x},${view.y}) scale(${view.k})`}>
          {layout.edges.map(({ from, to }) => (
            <path key={to.id} className={`edge ${to.depth === 1 ? 'edge-main' : ''}`} d={edgePath(from, to)} />
          ))}
          {[...layout.nodes.values()].map((n) => (
            <TopicNode
              key={n.id}
              box={n}
              selected={n.id === selectedId}
              dropTarget={n.id === drag?.targetId}
              dimmed={!!draggedBox && contains(draggedBox.topic, n.id)}
              imageUrl={n.topic.image ? imageUrls.get(n.topic.image.uri) : undefined}
              onPointerDown={(e) => onPointerDownNode(e, n.id)}
              onDoubleClick={() => ed().setEditing(n.id)}
              onToggle={() => ed().update(n.id, (t) => void (t.collapsed = !t.collapsed))}
            />
          ))}
          {draggedBox && drag && (
            <g className="drag-ghost" transform={`translate(${drag.mapX + 8},${drag.mapY + 8})`}>
              <rect width={Math.min(draggedBox.w, 220)} height={28} rx={6} />
              <text x={8} y={18}>
                {draggedBox.topic.text.slice(0, 30) || '(빈 토픽)'}
              </text>
            </g>
          )}
        </g>
      </svg>
      {anchor && (
        <textarea
          ref={inputRef}
          className={`edit-box ${editing ? 'editing' : ''}`}
          style={editBoxStyle(anchor, view, !!editing)}
          value={editing ? draft : ''}
          spellCheck={false}
          onChange={(e) => (editing ? setDraft(e.target.value) : startEditFromTyping(e.target.value))}
          onCompositionStart={() => !editing && startEditFromTyping('')}
          onKeyDown={onKeyDown}
          onBlur={() => editing && commitEdit()}
          onPointerDown={(e) => e.stopPropagation()}
        />
      )}
    </div>
  )
})

function editBoxStyle(n: NodeBox, view: View, editing: boolean): React.CSSProperties {
  const w = Math.max(n.w, editing ? 160 : 0) * view.k
  return {
    left: view.x + (n.x - n.w / 2) * view.k,
    top: view.y + (n.y - n.h / 2) * view.k,
    width: w,
    minHeight: n.h * view.k,
    font: n.style.font.replace(/\d+px/, `${n.style.fontSize * view.k}px`),
    padding: `${n.style.padY * view.k}px ${n.style.padX * view.k}px`,
  }
}

function edgePath(from: NodeBox, to: NodeBox): string {
  const side = to.side || 1
  const sx = from.depth === 0 ? from.x + (side * from.w) / 4 : from.x + (side * from.w) / 2
  const sy = from.y
  const ex = to.x - (side * to.w) / 2
  const ey = to.y
  const mx = (sx + ex) / 2
  return `M${sx},${sy} C${mx},${sy} ${mx},${ey} ${ex},${ey}`
}

interface TopicNodeProps {
  box: NodeBox
  selected: boolean
  dropTarget: boolean
  dimmed: boolean
  imageUrl: string | undefined
  onPointerDown(e: React.PointerEvent): void
  onDoubleClick(): void
  onToggle(): void
}

function TopicNode({ box: n, selected, dropTarget, dimmed, imageUrl, onPointerDown, onDoubleClick, onToggle }: TopicNodeProps) {
  const { style } = n
  const kind = n.depth === 0 ? 'root' : n.depth === 1 ? 'main' : 'sub'
  const textTop = style.padY + (n.image ? n.image.h + 6 : 0)
  const textX = style.padX + n.iconsWidth
  const hasChildren = n.topic.children.length > 0
  const classes = ['topic', `topic-${kind}`, selected && 'selected', dropTarget && 'drop-target', dimmed && 'dimmed', n.floating && 'floating']
  return (
    <g
      className={classes.filter(Boolean).join(' ')}
      transform={`translate(${n.x - n.w / 2},${n.y - n.h / 2})`}
      onPointerDown={onPointerDown}
      onDoubleClick={onDoubleClick}
    >
      <rect width={n.w} height={n.h} rx={kind === 'root' ? 12 : 6} />
      {n.image && imageUrl && (
        <image href={imageUrl} x={(n.w - n.image.w) / 2} y={style.padY} width={n.image.w} height={n.image.h} />
      )}
      {n.topic.icons.map((type, i) => {
        const v = iconVisual(type)
        const x = style.padX + i * (ICON_SIZE + 4)
        const y = textTop + Math.max(0, (n.lineHeight - ICON_SIZE) / 2)
        return v.flagColor ? (
          <g key={i} transform={`translate(${x},${y})`}>
            <title>{v.name}</title>
            <path d="M3 1v14" className="flag-pole" strokeWidth={1.5} />
            <path d="M4 2h9l-2 3.5 2 3.5H4z" style={{ fill: v.flagColor }} />
          </g>
        ) : (
          <text key={i} x={x} y={y + ICON_SIZE - 3} fontSize={ICON_SIZE - 2} className="icon">
            <title>{v.name}</title>
            {v.emoji}
          </text>
        )
      })}
      {n.lines.map((line, i) => (
        <text key={i} className="label" x={textX} y={textTop + i * n.lineHeight + style.fontSize * 0.95} style={{ font: style.font }}>
          {line}
        </text>
      ))}
      {n.badges.map((b, i) => (
        <text
          key={b}
          className="badge-icon"
          x={n.w - style.padX - (n.badges.length - i) * (BADGE_SIZE + 4) + 4}
          y={textTop + BADGE_SIZE - 2}
          fontSize={BADGE_SIZE - 2}
        >
          <title>{b === 'notes' ? '노트' : n.topic.hyperlink ?? ''}</title>
          {b === 'notes' ? '📝' : '🔗'}
        </text>
      ))}
      {hasChildren && n.depth > 0 && (
        <g
          className="toggle"
          transform={`translate(${n.side === -1 ? -9 : n.w + 9},${n.h / 2})`}
          onPointerDown={(e) => {
            e.stopPropagation()
            onToggle()
          }}
        >
          <circle r={7} />
          <path d={n.topic.collapsed ? 'M-4,0H4M0,-4V4' : 'M-4,0H4'} />
        </g>
      )}
    </g>
  )
}

/** 맵에 포함된 이미지(bin/*.bin)의 blob URL */
function useImageUrls(backing: Backing | null): Map<string, string> {
  const [urls, setUrls] = useState(() => new Map<string, string>())
  useEffect(() => {
    const m = new Map<string, string>()
    for (const e of backing?.entries ?? []) {
      if (e.data && e.name.startsWith('bin/')) {
        m.set(`mmarch://${e.name}`, URL.createObjectURL(new Blob([e.data as BlobPart], { type: imageMime(e.data) })))
      }
    }
    setUrls(m)
    return () => m.forEach((u) => URL.revokeObjectURL(u))
  }, [backing])
  return urls
}

function imageMime(data: Uint8Array): string {
  if (data[0] === 0x89 && data[1] === 0x50) return 'image/png'
  if (data[0] === 0xff && data[1] === 0xd8) return 'image/jpeg'
  if (data[0] === 0x47 && data[1] === 0x49) return 'image/gif'
  if (data[0] === 0x42 && data[1] === 0x4d) return 'image/bmp'
  return 'application/octet-stream'
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

