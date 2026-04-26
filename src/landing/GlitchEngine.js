/**
 * GlitchEngine
 *
 * Periodically fires visual glitch events on the landing page:
 *   1. Horizontal slice displacement  — CSS clip-path slabs shift left/right
 *   2. Chromatic aberration           — text-shadow RGB channel split
 *   3. Opacity flicker                — full-title alpha drop
 *   4. Scan-line flicker              — narrow horizontal bright line
 *
 * Each glitch is brief (40–200 ms) and stochastic.
 * Frequency increases while the scramble is running, then settles
 * into rare ambient twitches once everything is locked.
 */
export class GlitchEngine {
  /**
   * @param {HTMLElement}   titleEl   - the .title-wrap element
   * @param {HTMLElement[]} sliceEls  - array of .glitch-slice divs (3 recommended)
   */
  constructor(titleEl, sliceEls) {
    this.titleEl  = titleEl
    this.sliceEls = sliceEls
    this._timer   = null
    this._active  = false
    this._mode    = 'scrambling'  // 'scrambling' | 'settled'
  }

  /** Call while scramble is running — high-frequency glitches */
  startScrambling() {
    this._mode = 'scrambling'
    this._active = true
    this._schedule()
  }

  /** Call after all letters lock — rare ambient twitches */
  settleDown() {
    this._mode = 'settled'
  }

  stop() {
    this._active = false
    clearTimeout(this._timer)
    this._clearAll()
  }

  // ── Scheduling ─────────────────────────────────────────────────────────────
  _schedule() {
    if (!this._active) return
    const interval = this._mode === 'scrambling'
      ? 200 + Math.random() * 500    // 0.2–0.7 s while scrambling
      : 400 + Math.random() * 1200   // 0.4–1.6 s when settled

    this._timer = setTimeout(() => {
      this._fireRandom()
      this._schedule()
    }, interval)
  }

  _fireRandom() {
    const roll = Math.random()

    if (roll < 0.50) {
      this._sliceGlitch()
    } else if (roll < 0.68) {
      this._chromaGlitch()
    } else if (roll < 0.78) {
      this._flickerGlitch()
    } else if (roll < 0.90) {
      // Heavy compound glitch: slices + chroma simultaneously
      this._sliceGlitch()
      this._chromaGlitch()
    } else {
      // Full-page scan burst
      this._scanBurst()
    }
  }

  // ── Effect: horizontal slice displacement ─────────────────────────────────
  _sliceGlitch() {
    const sliceCount = 2 + Math.floor(Math.random() * this.sliceEls.length)

    for (let i = 0; i < sliceCount; i++) {
      const el = this.sliceEls[i % this.sliceEls.length]
      if (!el) continue

      const top    = 5  + Math.random() * 88          // % — full page height
      const height = 2  + Math.random() * 28          // px — taller slices
      const shift  = (Math.random() - 0.5) * 80       // px — bigger horizontal shift
      const dur    = 40 + Math.random() * 160         // ms

      el.style.cssText = `
        top: ${top}%;
        height: ${height}px;
        transform: translateX(${shift}px);
        opacity: ${0.6 + Math.random() * 0.4};
      `

      setTimeout(() => {
        el.style.cssText = 'opacity: 0;'
      }, dur)
    }
  }

  // ── Effect: rapid multi-slice full-screen scan burst ──────────────────────
  _scanBurst() {
    const steps = 3 + Math.floor(Math.random() * 3)
    let   t     = 0

    for (let s = 0; s < steps; s++) {
      setTimeout(() => {
        this._sliceGlitch()
        if (Math.random() > 0.5) this._chromaGlitch()
      }, t)
      t += 40 + Math.random() * 60
    }
  }

  // ── Effect: chromatic aberration (text-shadow RGB split) ──────────────────
  _chromaGlitch() {
    const dx  = (Math.random() - 0.5) * 10
    const dy  = (Math.random() - 0.5) * 4
    const dur = 60 + Math.random() * 100

    // Red channel offset (negative dx), blue channel offset (positive dx)
    this.titleEl.style.setProperty('--crx', `${-dx}px`)
    this.titleEl.style.setProperty('--cry', `${-dy}px`)
    this.titleEl.style.setProperty('--cbx', `${dx}px`)
    this.titleEl.style.setProperty('--cby', `${dy}px`)
    this.titleEl.classList.add('chroma-active')

    setTimeout(() => {
      this.titleEl.classList.remove('chroma-active')
      this.titleEl.style.removeProperty('--crx')
      this.titleEl.style.removeProperty('--cry')
      this.titleEl.style.removeProperty('--cbx')
      this.titleEl.style.removeProperty('--cby')
    }, dur)
  }

  // ── Effect: rapid opacity flicker ─────────────────────────────────────────
  _flickerGlitch() {
    const flickers = 2 + Math.floor(Math.random() * 3)
    let   count    = 0

    const flick = () => {
      if (count >= flickers * 2) {
        this.titleEl.style.opacity = ''
        return
      }
      this.titleEl.style.opacity = count % 2 === 0 ? '0.15' : '1'
      count++
      setTimeout(flick, 25 + Math.random() * 40)
    }

    flick()
  }

  _clearAll() {
    this.sliceEls.forEach(el => { el.style.cssText = 'opacity: 0;' })
    this.titleEl.classList.remove('chroma-active')
    this.titleEl.style.opacity = ''
    this.titleEl.style.removeProperty('--crx')
    this.titleEl.style.removeProperty('--cry')
    this.titleEl.style.removeProperty('--cbx')
    this.titleEl.style.removeProperty('--cby')
  }
}
