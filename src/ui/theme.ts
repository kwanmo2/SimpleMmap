// 라이트/다크 테마 — <html data-theme>로 적용. 사용자가 고른 값은 localStorage에 기억하고, 고르기 전에는 OS 설정을 따른다.
// 첫 화면 깜빡임을 막기 위해 index.html의 인라인 스크립트가 같은 규칙으로 data-theme을 먼저 설정한다.
import { useEffect, useState } from 'react'

export type Theme = 'light' | 'dark'

const STORAGE_KEY = 'mmapmind.theme'
const DARK_QUERY = '(prefers-color-scheme: dark)'

function storedTheme(): Theme | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    return v === 'light' || v === 'dark' ? v : null
  } catch {
    return null
  }
}

function systemTheme(): Theme {
  return matchMedia(DARK_QUERY).matches ? 'dark' : 'light'
}

export function useTheme(): [Theme, () => void] {
  const [theme, setTheme] = useState<Theme>(() => storedTheme() ?? systemTheme())

  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])

  // 직접 고르기 전에는 OS 테마 변경을 따라간다
  useEffect(() => {
    const media = matchMedia(DARK_QUERY)
    const onChange = (e: MediaQueryListEvent) => {
      if (!storedTheme()) setTheme(e.matches ? 'dark' : 'light')
    }
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [])

  function toggle() {
    const next: Theme = theme === 'dark' ? 'light' : 'dark'
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // 저장소를 쓸 수 없으면 이번 세션에만 적용
    }
    setTheme(next)
  }

  return [theme, toggle]
}
