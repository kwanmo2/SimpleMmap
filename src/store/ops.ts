import type { Topic } from '../format'

export interface Located {
  topic: Topic
  parent: Topic | null
  /** topic이 들어 있는 배열 (parent.children 또는 parent.floating). 중심 토픽이면 null */
  list: Topic[] | null
  index: number
}

export function locate(root: Topic, id: string): Located | null {
  if (root.id === id) return { topic: root, parent: null, list: null, index: -1 }
  const stack: Topic[] = [root]
  while (stack.length) {
    const p = stack.pop()!
    for (const list of [p.children, p.floating]) {
      const index = list.findIndex((t) => t.id === id)
      if (index >= 0) return { topic: list[index], parent: p, list, index }
      stack.push(...list)
    }
  }
  return null
}

/** id가 topic 자신이거나 그 하위에 있으면 true */
export function contains(topic: Topic, id: string): boolean {
  if (topic.id === id) return true
  return topic.children.some((c) => contains(c, id)) || topic.floating.some((c) => contains(c, id))
}
