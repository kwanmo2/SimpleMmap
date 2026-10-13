import type { Measure } from './layout'

let ctx: CanvasRenderingContext2D | null = null
const cache = new Map<string, number>()

/** 브라우저 캔버스로 텍스트 폭 측정 (결과 캐시) */
export const measureText: Measure = (text, font) => {
  const key = `${font}\u0000${text}`
  let w = cache.get(key)
  if (w === undefined) {
    ctx ??= document.createElement('canvas').getContext('2d')!
    ctx.font = font
    w = ctx.measureText(text).width
    cache.set(key, w)
  }
  return w
}
