import { useEffect, useRef, useState } from 'react'
import { readMmap, writeMmap } from './format'
import { fileFromDrop, isAbort, pickFile, saveAs, writeToHandle, type OpenedFile } from './io/files'
import { useEditor } from './store/editor'
import { Inspector } from './ui/Inspector'
import { useTheme } from './ui/theme'
import { MindMapView, type MindMapViewHandle } from './view/MindMapView'
import './App.css'

export default function App() {
  const map = useEditor((s) => s.map)
  const fileName = useEditor((s) => s.fileName)
  const dirty = useEditor((s) => s.dirty)
  const canUndo = useEditor((s) => s.past.length > 0)
  const canRedo = useEditor((s) => s.future.length > 0)
  const selectedId = useEditor((s) => s.selectedId)
  const ed = useEditor.getState
  const viewRef = useRef<MindMapViewHandle>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [theme, toggleTheme] = useTheme()

  async function open(opened: OpenedFile | null) {
    if (!opened) return
    if (ed().dirty && !confirm('저장하지 않은 변경 사항이 있습니다. 버리고 새 파일을 열까요?')) return
    try {
      ed().load(await readMmap(await opened.file.arrayBuffer()), opened.file.name, opened.handle)
      setStatus(opened.handle ? '열기 완료 — Ctrl+S로 원본 파일에 바로 저장됩니다' : '열기 완료 — 처음 저장할 때 위치를 고르면 이후 Ctrl+S는 그 파일에 저장됩니다')
    } catch (e) {
      setStatus(`열기 실패: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  async function save(as = false) {
    const file = ed().currentFile()
    if (!file) return
    try {
      const bytes = await writeMmap(file)
      const { fileHandle, fileName: name } = ed()
      if (fileHandle && !as) {
        try {
          await writeToHandle(fileHandle, bytes)
          ed().markSaved(name, fileHandle)
          setStatus(`저장 완료: ${name}`)
          return
        } catch (e) {
          // 쓰기 권한을 거부했거나 막혀 있으면 저장 위치를 다시 고르게 한다
          if (isAbort(e)) return
        }
      }
      const handle = await saveAs(bytes, name)
      if (handle === undefined) return
      ed().markSaved(handle?.name ?? name, handle)
      setStatus(handle ? `저장 완료: ${handle.name}` : '다운로드 폴더에 저장했습니다')
    } catch (e) {
      setStatus(`저장 실패: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (useEditor.getState().dirty) e.preventDefault()
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [])

  useEffect(() => {
    document.title = map ? `${dirty ? '● ' : ''}${fileName} — mmapmind` : 'mmapmind'
  }, [map, fileName, dirty])

  const act = (fn: () => void) => () => {
    fn()
    viewRef.current?.focus()
  }

  return (
    <div
      className="app"
      onDragOver={(e) => e.preventDefault()}
      onDrop={async (e) => {
        e.preventDefault()
        try {
          await open(await fileFromDrop(e.dataTransfer))
        } catch (err) {
          setStatus(`열기 실패: ${err instanceof Error ? err.message : String(err)}`)
        }
      }}
    >
      <header className="toolbar">
        <strong className="brand">mmapmind</strong>
        <button onClick={async () => open(await pickFile())}>열기</button>
        <button disabled={!map} onClick={() => save()}>저장</button>
        <button disabled={!map} onClick={() => save(true)}>다른 이름으로</button>
        <span className="sep" />
        <button disabled={!canUndo} onClick={act(() => ed().undo())} title="Ctrl+Z">실행 취소</button>
        <button disabled={!canRedo} onClick={act(() => ed().redo())} title="Ctrl+Y">다시 실행</button>
        <span className="sep" />
        <button disabled={!selectedId} onClick={act(() => ed().addChild(selectedId!))} title="Tab / Insert">하위 토픽</button>
        <button disabled={!selectedId} onClick={act(() => ed().addSibling(selectedId!))} title="Enter">형제 토픽</button>
        <button disabled={!selectedId || selectedId === map?.root.id} onClick={act(() => ed().remove(selectedId!))} title="Delete">삭제</button>
        <span className="sep" />
        <button disabled={!map} onClick={() => viewRef.current?.fit()}>화면 맞춤</button>
        <span className="spacer" />
        {map && (
          <span className="file">
            {dirty && <span className="dirty" title="저장되지 않음">●</span>}
            {fileName}
          </span>
        )}
        <button onClick={toggleTheme} title={theme === 'dark' ? '라이트 테마로 전환' : '다크 테마로 전환'}>
          {theme === 'dark' ? '☀ 라이트' : '☾ 다크'}
        </button>
      </header>
      <div className="workspace">
        {map ? (
          <>
            <MindMapView ref={viewRef} onSave={() => save()} />
            <Inspector />
          </>
        ) : (
          <div className="empty">
            <p>.mmap 파일을 열거나 이 창에 끌어다 놓으세요.</p>
            <button onClick={async () => open(await pickFile())}>파일 열기</button>
          </div>
        )}
      </div>
      <footer className="statusbar">
        <span>{status}</span>
        <span className="keys">
          Enter 형제 · Tab 하위 · F2/더블클릭/바로 입력 편집 · Delete 삭제 · 방향키 이동 · Space 접기 · 드래그로 이동 · Ctrl+휠 확대 · Ctrl+S 저장
        </span>
      </footer>
    </div>
  )
}
