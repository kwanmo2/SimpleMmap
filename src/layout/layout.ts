// MindManager 기본 맵 형태의 좌우 균형 트리 레이아웃.
// 좌표는 노드 중심 기준, 중심 토픽이 (0, 0).
import type { MindMap, Topic } from '../format'

export type Measure = (text: string, font: string) => number

export interface TopicStyle {
  font: string
  fontSize: number
  padX: number
  padY: number
  maxTextWidth: number
}

export function styleFor(depth: number): TopicStyle {
  if (depth === 0) return { font: 'bold 18px system-ui, sans-serif', fontSize: 18, padX: 20, padY: 14, maxTextWidth: 260 }
  if (depth === 1) return { font: 'bold 14px system-ui, sans-serif', fontSize: 14, padX: 12, padY: 8, maxTextWidth: 220 }
  return { font: '13px system-ui, sans-serif', fontSize: 13, padX: 8, padY: 5, maxTextWidth: 220 }
}

export const ICON_SIZE = 16
export const BADGE_SIZE = 14
const ICON_GAP = 4
const IMAGE_MAX_WIDTH = 200
const MIN_TEXT_WIDTH = 24

export interface NodeBox {
  id: string
  topic: Topic
  parentId: string | null
  depth: number
  /** 1: 오른쪽, -1: 왼쪽, 0: 중심 */
  side: 1 | -1 | 0
  floating: boolean
  x: number
  y: number
  w: number
  h: number
  lines: string[]
  lineHeight: number
  style: TopicStyle
  image: { w: number; h: number } | null
  /** 아이콘 영역 폭 (텍스트 왼쪽) */
  iconsWidth: number
  /** 노트/링크 배지 수 (텍스트 오른쪽) */
  badges: ('notes' | 'link')[]
}

export interface MapLayout {
  nodes: Map<string, NodeBox>
  edges: { from: NodeBox; to: NodeBox }[]
  bounds: { minX: number; minY: number; maxX: number; maxY: number }
}

const H_GAP_ROOT = 48
const H_GAP = 28
const V_GAP_MAIN = 18
const V_GAP = 8
const FLOATING_GAP = 60

/** 글자 단위 줄바꿈 (한글처럼 공백이 적은 텍스트 대응), 공백이 있으면 단어 경계 우선 */
export function wrapText(text: string, maxWidth: number, font: string, measure: Measure): string[] {
  const out: string[] = []
  for (const para of (text || ' ').split(/\r?\n/)) {
    let line = ''
    for (const ch of para) {
      const candidate = line + ch
      if (line && measure(candidate, font) > maxWidth) {
        const space = line.lastIndexOf(' ')
        if (space > 0 && ch !== ' ') {
          out.push(line.slice(0, space))
          line = line.slice(space + 1) + ch
        } else {
          out.push(line)
          line = ch === ' ' ? '' : ch
        }
      } else {
        line = candidate
      }
    }
    out.push(line)
  }
  return out
}

interface Sized {
  box: NodeBox
  /** 하위 트리 전체 높이 */
  span: number
  kids: Sized[]
}

export function layoutMap(map: MindMap, measure: Measure): MapLayout {
  const nodes = new Map<string, NodeBox>()
  const edges: MapLayout['edges'] = []

  function size(topic: Topic, depth: number, parentId: string | null, floating: boolean): Sized {
    const style = styleFor(depth)
    const lines = wrapText(topic.text, style.maxTextWidth, style.font, measure)
    const lineHeight = Math.round(style.fontSize * 1.35)
    const textWidth = Math.max(MIN_TEXT_WIDTH, ...lines.map((l) => measure(l, style.font)))
    const iconsWidth = topic.icons.length ? topic.icons.length * (ICON_SIZE + ICON_GAP) : 0
    const badges: NodeBox['badges'] = []
    if (topic.notesXhtml) badges.push('notes')
    if (topic.hyperlink) badges.push('link')
    const badgesWidth = badges.length * (BADGE_SIZE + ICON_GAP)

    let image: NodeBox['image'] = null
    if (topic.image) {
      const w0 = topic.image.width ?? 120
      const h0 = topic.image.height ?? 80
      const scale = Math.min(1, IMAGE_MAX_WIDTH / w0)
      image = { w: Math.round(w0 * scale), h: Math.round(h0 * scale) }
    }

    const contentW = Math.max(iconsWidth + textWidth + badgesWidth, image?.w ?? 0)
    const textH = Math.max(lines.length * lineHeight, topic.icons.length ? ICON_SIZE : 0)
    const box: NodeBox = {
      id: topic.id,
      topic,
      parentId,
      depth,
      side: 0,
      floating,
      x: 0,
      y: 0,
      w: Math.ceil(contentW + style.padX * 2),
      h: Math.ceil(textH + (image ? image.h + 6 : 0) + style.padY * 2),
      lines,
      lineHeight,
      style,
      image,
      iconsWidth,
      badges,
    }
    nodes.set(topic.id, box)

    const kids = topic.collapsed ? [] : topic.children.map((c) => size(c, depth + 1, topic.id, false))
    const gap = depth === 0 ? V_GAP_MAIN : V_GAP
    const kidsSpan = kids.reduce((s, k) => s + k.span, 0) + Math.max(0, kids.length - 1) * gap
    return { box, span: Math.max(box.h, kidsSpan), kids }
  }

  /** innerEdge: 부모 쪽 가장자리 x 좌표 */
  function place(s: Sized, side: 1 | -1, innerEdge: number, centerY: number) {
    const { box } = s
    box.side = side
    box.x = innerEdge + (side * box.w) / 2
    box.y = centerY
    placeKids(s, side, innerEdge + side * (box.w + H_GAP))
  }

  function placeKids(s: Sized, side: 1 | -1, childEdge: number, kids = s.kids) {
    const gap = s.box.depth === 0 ? V_GAP_MAIN : V_GAP
    const total = kids.reduce((sum, k) => sum + k.span, 0) + Math.max(0, kids.length - 1) * gap
    let y = s.box.y - total / 2
    for (const k of kids) {
      place(k, side, childEdge, y + k.span / 2)
      edges.push({ from: s.box, to: k.box })
      y += k.span + gap
    }
  }

  const root = size(map.root, 0, null, false)
  root.box.side = 0

  // 주 토픽을 오른쪽/왼쪽으로 나눈다: 앞쪽 k개는 오른쪽(위→아래), 나머지는 왼쪽(아래→위, 시계 방향)
  const spans = root.kids.map((k) => k.span)
  const total = spans.reduce((a, b) => a + b, 0)
  let k = 0
  let best = Infinity
  let acc = 0
  for (let i = 1; i <= spans.length; i++) {
    acc += spans[i - 1]
    const diff = Math.abs(total - 2 * acc)
    if (diff < best) {
      best = diff
      k = i
    }
  }
  const right = root.kids.slice(0, k)
  const left = root.kids.slice(k).reverse()
  placeKids(root, 1, root.box.w / 2 + H_GAP_ROOT, right)
  placeKids(root, -1, -(root.box.w / 2 + H_GAP_ROOT), left)

  // 플로팅 토픽: 맵 아래쪽에 독립 트리로 배치
  const floatingRoots: { topic: Topic; depth: number; parentId: string }[] = []
  const collect = (t: Topic, depth: number) => {
    for (const f of t.floating) floatingRoots.push({ topic: f, depth: Math.max(1, depth), parentId: t.id })
    if (!t.collapsed) for (const c of t.children) collect(c, depth + 1)
  }
  collect(map.root, 0)
  let b = boundsOf(nodes)
  let y = b.maxY + FLOATING_GAP
  for (const f of floatingRoots) {
    const s = size(f.topic, f.depth, f.parentId, true)
    place(s, 1, b.minX, y + s.span / 2)
    y += s.span + FLOATING_GAP / 2
  }
  b = boundsOf(nodes)

  return { nodes, edges, bounds: b }
}

function boundsOf(nodes: Map<string, NodeBox>) {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const n of nodes.values()) {
    minX = Math.min(minX, n.x - n.w / 2)
    maxX = Math.max(maxX, n.x + n.w / 2)
    minY = Math.min(minY, n.y - n.h / 2)
    maxY = Math.max(maxY, n.y + n.h / 2)
  }
  if (minX === Infinity) return { minX: 0, minY: 0, maxX: 0, maxY: 0 }
  return { minX, minY, maxX, maxY }
}

/** 방향키 이동: 해당 방향에서 가장 가까운 노드 */
export function neighbor(layout: MapLayout, fromId: string, dir: 'left' | 'right' | 'up' | 'down'): string | null {
  const from = layout.nodes.get(fromId)
  if (!from) return null
  const horizontal = dir === 'left' || dir === 'right'
  const sign = dir === 'right' || dir === 'down' ? 1 : -1
  let bestId: string | null = null
  let bestScore = Infinity
  for (const n of layout.nodes.values()) {
    if (n.id === fromId) continue
    const dx = n.x - from.x
    const dy = n.y - from.y
    const primary = (horizontal ? dx : dy) * sign
    if (primary <= 1) continue
    const secondary = Math.abs(horizontal ? dy : dx)
    const score = primary + secondary * 2.5
    if (score < bestScore) {
      bestScore = score
      bestId = n.id
    }
  }
  return bestId
}
