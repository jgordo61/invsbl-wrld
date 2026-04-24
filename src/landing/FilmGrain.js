/**
 * FilmGrain
 *
 * Renders organic animated film grain on a small canvas
 * (200×200 internal) CSS-scaled to full viewport.
 * Uses mix-blend-mode: multiply so the grain shows as dark
 * specks on the white background without a separate overlay color.
 *
 * Intensity 0–1: how strong the grain is (default 0.06)
 */
export class FilmGrain {
  constructor(canvas, intensity = 0.06) {
    this.canvas    = canvas
    this.ctx       = canvas.getContext('2d')
    this.intensity = intensity
    this._raf      = null
    this._running  = false
    this._frame    = 0   // throttle counter

    // Small internal resolution — CSS scale does the rest
    this.canvas.width  = 256
    this.canvas.height = 256

    // Pre-allocate ImageData once
    this._imageData = this.ctx.createImageData(256, 256)
    this._data      = this._imageData.data
  }

  start() {
    if (this._running) return
    this._running = true
    this._tick()
  }

  stop() {
    this._running = false
    if (this._raf) cancelAnimationFrame(this._raf)
  }

  setIntensity(v) { this.intensity = v }

  _tick() {
    if (!this._running) return
    // Only redraw every 3rd frame — grain at ~20fps is indistinguishable from 60fps
    if (++this._frame % 3 === 0) this._draw()
    this._raf = requestAnimationFrame(() => this._tick())
  }

  _draw() {
    const d   = this._data
    const len = d.length
    const amt = this.intensity // 0–1

    // Each pixel: luminance near-white with random dark bias
    // multiply blend on white → dark specks where noise < 255
    for (let i = 0; i < len; i += 4) {
      // Most pixels: very light (grain is subtle)
      // Occasional darker pixel: organic "fleck"
      const r = Math.random()
      let v

      if (r < amt * 0.7) {
        // Light grain — barely visible
        v = 200 + Math.floor(Math.random() * 55)   // 200–255
      } else if (r < amt) {
        // Medium grain speck
        v = 140 + Math.floor(Math.random() * 60)   // 140–200
      } else {
        // Pure white — no grain, transparent pass-through
        v = 255
      }

      d[i]     = v
      d[i + 1] = v
      d[i + 2] = v
      d[i + 3] = v === 255 ? 0 : Math.floor((1 - v / 255) * 3.5 * 255) // alpha
    }

    this.ctx.putImageData(this._imageData, 0, 0)
  }
}
