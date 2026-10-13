// 파일 열기/저장 — 열기는 일반 파일 선택 창, 저장은 Chrome/Edge에서 File System Access API(안 되면 다운로드)

interface PickerOptions {
  types?: { description: string; accept: Record<string, string[]> }[]
  suggestedName?: string
}

declare global {
  interface Window {
    showSaveFilePicker?: (options?: PickerOptions) => Promise<FileSystemFileHandle>
  }
  interface DataTransferItem {
    getAsFileSystemHandle?: () => Promise<FileSystemHandle | null>
  }
}

const TYPES = [{ description: 'MindManager 맵', accept: { 'application/octet-stream': ['.mmap'] } }]

export interface OpenedFile {
  file: File
  handle: FileSystemFileHandle | null
}

export const isAbort = (e: unknown) => e instanceof DOMException && e.name === 'AbortError'

/**
 * 일반 파일 선택 창으로 연다. showOpenFilePicker는 환경(보안 정책·동기화 폴더 등)에 따라
 * getFile()이 NotAllowedError로 막히는 경우가 있어 쓰지 않는다. 덮어쓰기용 핸들은 첫 저장 때 얻는다.
 */
export function pickFile(): Promise<OpenedFile | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.mmap'
    input.onchange = () => resolve(input.files?.[0] ? { file: input.files[0], handle: null } : null)
    input.oncancel = () => resolve(null)
    input.click()
  })
}

/** 드롭된 항목에서 파일(가능하면 쓰기 가능한 핸들 포함)을 얻는다 */
export async function fileFromDrop(dt: DataTransfer): Promise<OpenedFile | null> {
  const item = [...dt.items].find((i) => i.kind === 'file')
  if (!item) return null
  const file = item.getAsFile()
  if (!file) return null
  const handle = await item.getAsFileSystemHandle?.().catch(() => null)
  return { file, handle: handle?.kind === 'file' ? (handle as FileSystemFileHandle) : null }
}

export async function writeToHandle(handle: FileSystemFileHandle, bytes: Uint8Array): Promise<void> {
  const writable = await handle.createWritable()
  await writable.write(bytes as BufferSource)
  await writable.close()
}

/** 다른 이름으로 저장. 저장 위치 핸들을 반환(다운로드로 대체했으면 null), 취소하면 undefined */
export async function saveAs(bytes: Uint8Array, suggestedName: string): Promise<FileSystemFileHandle | null | undefined> {
  if (window.showSaveFilePicker) {
    try {
      const handle = await window.showSaveFilePicker({ types: TYPES, suggestedName })
      await writeToHandle(handle, bytes)
      return handle
    } catch (e) {
      if (isAbort(e)) return undefined
      // 정책 등으로 저장 창이나 쓰기가 막히면 다운로드로 대체
    }
  }
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/octet-stream' }))
  const a = document.createElement('a')
  a.href = url
  a.download = suggestedName
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  return null
}
