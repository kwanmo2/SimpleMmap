# AGENTS.md

이 저장소에서 작업하는 코딩 에이전트를 위한 안내입니다. 사용자용 설명은 [README.md](README.md)를 보세요.

## 프로젝트 요약

MindManager `.mmap` 파일을 브라우저에서 편집하는 React 19 + Vite + TypeScript 앱입니다.
가장 중요한 요구 사항은 **원본 파일 보존**입니다. 저장한 파일은 MindManager에서 그대로 열려야 하고, 편집하지 않은 부분은 바뀌면 안 됩니다.

## 명령

```sh
npm test          # vitest — 변경 후 반드시 실행
npx tsc -b        # 타입 검사
npm run lint      # oxlint
npm run build     # tsc -b + vite build
```

## 아키텍처와 규칙

- **`src/format/`** — `.mmap` = ZIP(`Document.xml` + 바이너리 + `xsd/`).
  - `readMmap`은 순수 데이터 모델(`MindMap`/`Topic`)과 저장용 `Backing`(원본 DOM, ZIP 엔트리)을 만든다. 편집 코드는 모델만 바꾸고 `Backing`은 건드리지 않는다.
  - `writeMmap`은 모델 변경분만 원본 DOM에 반영한다. 변경이 없으면 `Document.xml`을 다시 직렬화하지 않아 바이트 단위로 동일해야 한다.
  - 새 요소는 `schema.ts`의 순서표(`TOPIC_CHILD_ORDER`, `insertInOrder`)로 XSD `xs:sequence` 순서에 맞춰 삽입한다. 순서가 틀리면 MindManager가 파일을 거부할 수 있다.
  - 토픽 id는 MindManager OId(16바이트 GUID base64). 새 토픽은 `createTopic`/`generateOId`를 쓴다.
  - 모델에 필드를 추가하면 reader·writer·테스트를 함께 고친다.
- **`src/store/`** — zustand + immer. 맵 변경은 `commit`을 거쳐 undo 기록을 남긴다. `backing`은 불변 상태가 아니므로 렌더링에 쓰지 않는다.
- **`src/layout/`** — 순수 함수 레이아웃. 텍스트 측정은 `Measure`로 주입한다(테스트는 가짜 측정 사용).
- **`src/view/`, `src/ui/`** — React 컴포넌트. 색은 하드코딩하지 말고 `App.css`의 CSS 변수(`--bg`, `--fg`, `--accent` 등)를 쓴다.
- **테마** — `src/ui/theme.ts`의 `useTheme`가 `<html data-theme="light|dark">`를 설정하고 선택을 `localStorage`(`mmapmind.theme`)에 저장한다. 첫 화면 깜빡임을 막기 위해 `index.html` 인라인 스크립트가 같은 규칙으로 먼저 설정하므로, 키나 규칙을 바꾸면 두 곳을 함께 고친다. 다크 색은 `App.css`의 `:root[data-theme='dark']`에 있다. 새 색 변수는 두 블록 모두에 정의한다.
- **`src/io/`** — Chrome/Edge는 File System Access API, 그 외는 다운로드로 대체.

## 테스트

- `tests/`는 `samples/*.mmap` 전부에 대해 왕복(무편집 저장 시 바이트 동일, ZIP 메타데이터 보존)과 편집 후 XSD 유효성을 검사한다. XSD는 각 `.mmap`에 번들된 것을 `xmllint-wasm`으로 쓴다.
- 포맷 관련 변경은 테스트를 추가하고, 가능하면 `npm run make-edited`로 만든 `test-output/` 파일을 실제 MindManager에서 열어 확인하도록 사용자에게 알린다.
- `samples/`의 파일은 실제 사용자 문서이므로 수정하지 않는다.

## 스타일

- UI 문구, 코드 주석, 테스트 이름은 한국어로 쓴다.
- 세미콜론 없음, 작은따옴표, 2칸 들여쓰기. 주변 코드의 주석 밀도와 관용구를 따른다.
