import type { Title } from '@shared/schema'

/**
 * Renders title/text clips onto 2D canvases that the WebGL compositor uploads as
 * textures. One canvas is cached per clip and only redrawn when its text, style,
 * or the sequence size changes — cheap enough to keep titles crisp while editing.
 */
export class TitleRenderer {
  private cache = new Map<string, { canvas: HTMLCanvasElement; key: string }>()

  get(clipId: string, title: Title, width: number, height: number): HTMLCanvasElement {
    const key = JSON.stringify([title, width, height])
    let entry = this.cache.get(clipId)
    if (!entry) {
      entry = { canvas: document.createElement('canvas'), key: '' }
      this.cache.set(clipId, entry)
    }
    if (entry.key === key) return entry.canvas

    const { canvas } = entry
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')!
    ctx.clearRect(0, 0, width, height)
    if (title.background && title.background !== 'transparent') {
      ctx.fillStyle = title.background
      ctx.fillRect(0, 0, width, height)
    }
    ctx.fillStyle = title.color
    ctx.font = `bold ${title.fontSize}px -apple-system, "Segoe UI", Roboto, sans-serif`
    ctx.textBaseline = 'middle'
    ctx.textAlign = title.align
    ctx.shadowColor = 'rgba(0,0,0,0.6)'
    ctx.shadowBlur = Math.max(2, title.fontSize * 0.04)

    const x = title.align === 'left' ? width * 0.06 : title.align === 'right' ? width * 0.94 : width / 2
    const lines = title.text.split('\n')
    const lineHeight = title.fontSize * 1.25
    let y = height / 2 - ((lines.length - 1) * lineHeight) / 2
    for (const line of lines) {
      ctx.fillText(line, x, y)
      y += lineHeight
    }
    entry.key = key
    return canvas
  }

  release(clipId: string): void {
    this.cache.delete(clipId)
  }
}
