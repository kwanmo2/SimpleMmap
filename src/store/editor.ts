import { create } from 'zustand'
import { produce } from 'immer'
import { createTopic, type MindMap, type MmapFile, type Topic } from '../format'
import type { Backing } from '../format/reader'
import { contains, locate } from './ops'

const HISTORY_LIMIT = 200

/** undo 기록 — 변경 직전의 맵과 그때의 선택 */
interface Snapshot {
  map: MindMap
  selectedId: string | null
}

export interface EditorState {
  map: MindMap | null
  /** 저장용 원본 DOM/ZIP 정보 — 불변 상태가 아니므로 렌더링에 쓰지 않는다 */
  backing: Backing | null
  fileName: string
  fileHandle: FileSystemFileHandle | null
  dirty: boolean
  selectedId: string | null
  editingId: string | null
  past: Snapshot[]
  future: Snapshot[]

  load(file: MmapFile, fileName: string, handle: FileSystemFileHandle | null): void
  currentFile(): MmapFile | null
  markSaved(fileName: string, handle: FileSystemFileHandle | null): void
  select(id: string | null): void
  setEditing(id: string | null): void

  addChild(parentId: string): void
  addSibling(id: string): void
  remove(id: string): void
  move(id: string, newParentId: string, index?: number): void
  update(id: string, recipe: (t: Topic) => void): void
  undo(): void
  redo(): void
}

function restore({ map, selectedId }: Snapshot): Partial<EditorState> {
  return {
    map,
    dirty: true,
    editingId: null,
    selectedId: selectedId && locate(map.root, selectedId) ? selectedId : map.root.id,
  }
}

export const useEditor = create<EditorState>()((set, get) => {
  /** map에 recipe를 적용하고 undo 기록을 남긴다 */
  function commit(recipe: (root: Topic) => void, after?: Partial<EditorState>) {
    const { map, past, selectedId } = get()
    if (!map) return
    const next = produce(map, (draft) => recipe(draft.root))
    if (next === map) return
    set({ map: next, past: [...past, { map, selectedId }].slice(-HISTORY_LIMIT), future: [], dirty: true, ...after })
  }

  return {
    map: null,
    backing: null,
    fileName: '',
    fileHandle: null,
    dirty: false,
    selectedId: null,
    editingId: null,
    past: [],
    future: [],

    load(file, fileName, handle) {
      set({
        map: file.map,
        backing: file.backing,
        fileName,
        fileHandle: handle,
        dirty: false,
        selectedId: file.map.root.id,
        editingId: null,
        past: [],
        future: [],
      })
    },

    currentFile() {
      const { map, backing } = get()
      return map && backing ? { map, backing } : null
    },

    markSaved(fileName, handle) {
      set({ dirty: false, fileName, fileHandle: handle })
    },

    select(id) {
      set({ selectedId: id })
    },

    setEditing(id) {
      set({ editingId: id })
    },

    addChild(parentId) {
      const topic = createTopic('')
      commit(
        (root) => {
          const loc = locate(root, parentId)
          if (!loc) return
          loc.topic.collapsed = false
          loc.topic.children.push(topic)
        },
        { selectedId: topic.id, editingId: topic.id },
      )
    },

    addSibling(id) {
      const { map } = get()
      if (!map) return
      if (map.root.id === id) return get().addChild(id)
      const topic = createTopic('')
      commit(
        (root) => {
          const loc = locate(root, id)
          loc?.list?.splice(loc.index + 1, 0, topic)
        },
        { selectedId: topic.id, editingId: topic.id },
      )
    },

    remove(id) {
      const { map } = get()
      if (!map || map.root.id === id) return
      const loc = locate(map.root, id)
      if (!loc?.list || !loc.parent) return
      const next = loc.list[loc.index + 1] ?? loc.list[loc.index - 1] ?? loc.parent
      commit(
        (root) => {
          const l = locate(root, id)
          l?.list?.splice(l.index, 1)
        },
        { selectedId: next.id, editingId: null },
      )
    },

    move(id, newParentId, index) {
      const { map } = get()
      if (!map || map.root.id === id) return
      const loc = locate(map.root, id)
      if (!loc || contains(loc.topic, newParentId)) return // 자기 하위로는 이동 불가
      commit((root) => {
        const from = locate(root, id)!
        from.list!.splice(from.index, 1)
        const target = locate(root, newParentId)!.topic
        target.collapsed = false
        target.children.splice(index ?? target.children.length, 0, from.topic)
      })
    },

    update(id, recipe) {
      commit((root) => {
        const loc = locate(root, id)
        if (loc) recipe(loc.topic)
      })
    },

    undo() {
      const { map, past, future, selectedId } = get()
      if (!map || past.length === 0) return
      const prev = past[past.length - 1]
      set({
        ...restore(prev),
        past: past.slice(0, -1),
        future: [{ map, selectedId }, ...future],
      })
    },

    redo() {
      const { map, past, future, selectedId } = get()
      if (!map || future.length === 0) return
      set({
        ...restore(future[0]),
        past: [...past, { map, selectedId }],
        future: future.slice(1),
      })
    },
  }
})
