import { generateOId } from './oid'

/** 편집 가능한 마인드맵 데이터. 순수 데이터(DOM 참조 없음)라 상태관리/undo에 그대로 쓸 수 있다. */
export interface MindMap {
  root: Topic
}

export interface Topic {
  /** MindManager OId. 새 토픽은 generateOId()로 발급 */
  id: string
  text: string
  collapsed: boolean
  /** 노트 본문 — <html> 요소 내부 XHTML 마크업. 없으면 null */
  notesXhtml: string | null
  hyperlink: string | null
  /** StockIcon IconType 목록 (예: "urn:mindjet:FlagGreen") */
  icons: string[]
  /** 토픽 이미지 (현재 읽기 전용) */
  image: TopicImage | null
  children: Topic[]
  floating: Topic[]
}

export interface TopicImage {
  /** 예: "mmarch://bin/38BF….bin" */
  uri: string
  imageType: string | null
  width: number | null
  height: number | null
}

export function createTopic(text: string): Topic {
  return {
    id: generateOId(),
    text,
    collapsed: false,
    notesXhtml: null,
    hyperlink: null,
    icons: [],
    image: null,
    children: [],
    floating: [],
  }
}

export function* walkTopics(topic: Topic): Generator<Topic> {
  yield topic
  for (const c of topic.children) yield* walkTopics(c)
  for (const c of topic.floating) yield* walkTopics(c)
}
