/**
 * TextScrambler
 *
 * Phase 1 — SCRAMBLE
 *   Each character position cycles through binary digits and code symbols
 *   at high speed, rendered in VT323 (LED/dot-matrix display font).
 *
 * Phase 2 — RESOLVE
 *   Characters lock in one at a time with micro-glitches before snapping
 *   to their final form in the BlackmoonLilith display font.
 *
 * Phase 3 — FLICKER
 *   After every character is locked, each one independently flickers
 *   on a randomised per-letter timer — like faulty neon signage.
 */

// ── Character pool — pure binary only ────────────────────────────────────────
function randBin() {
  return Math.random() > 0.5 ? '1' : '0'
}

// ── TextScrambler ─────────────────────────────────────────────────────────────
export class TextScrambler {
  /**
   * @param {HTMLElement} container   Element that will hold the char <span>s
   * @param {object}      opts
   * @param {number}  opts.scrambleInterval   ms between random swaps    (45)
   * @param {number}  opts.resolveStart       ms before first letter locks (600)
   * @param {number}  opts.resolveStagger     ms between each letter       (190)
   * @param {number}  opts.glitchBeforeLock   glitch-backs before settle   (4)
   * @param {Function} opts.onComplete        called when all chars locked
   */
  constructor(container, opts = {}) {
    this.container = container
    this.opts = {
      scrambleInterval: 45,
      resolveStart:     600,
      resolveStagger:   190,
      glitchBeforeLock: 4,
      onComplete:       null,
      onLetterLock:     null,   // (index) => void — fired when each character locks
      ...opts
    }

    this._spans     = []
    this._resolved  = []
    this._text      = ''
    this._interval  = null
    this._timeouts  = []
    this._flickerTO = []   // separate list so flickers can be cancelled cleanly
    this._done      = false
  }

  /** Start the full animation for `text`. Re-entrant safe. */
  run(text) {
    this._clearAll()
    this._text     = text
    this._resolved = new Array(text.length).fill(false)
    this._done     = false

    // Build one <span> per character
    this.container.innerHTML = ''
    this._spans = [...text].map((ch, i) => {
      const span       = document.createElement('span')
      span.dataset.final = ch

      if (ch === ' ') {
        span.className   = 'ch ch--space'
        span.textContent = '\u2002'    // en-space
        this._resolved[i] = true
      } else {
        span.className   = 'ch ch--scrambling'
        span.textContent = randBin()
      }

      this.container.appendChild(span)
      return span
    })

    // Fast scramble loop
    this._interval = setInterval(() => this._step(), this.opts.scrambleInterval)

    // Stagger each letter's resolve
    ;[...text].forEach((ch, i) => {
      if (ch === ' ') return
      const jitter = (Math.random() - 0.5) * 80
      const delay  = this.opts.resolveStart + i * this.opts.resolveStagger + jitter
      this._push(setTimeout(() => this._beginResolve(i), delay))
    })
  }

  // ── Scramble loop ─────────────────────────────────────────────────────────
  _step() {
    this._spans.forEach((span, i) => {
      if (this._resolved[i]) return
      span.textContent = randBin()
    })
  }

  // ── Resolve one character ─────────────────────────────────────────────────
  _beginResolve(index) {
    let remaining = this.opts.glitchBeforeLock + Math.floor(Math.random() * 3)

    const glitch = () => {
      if (remaining > 0) {
        remaining--
        const span = this._spans[index]
        span.textContent = randBin()
        span.classList.add('ch--glitching')
        this._push(setTimeout(() => {
          span.classList.remove('ch--glitching')
          this._push(setTimeout(glitch, 20 + Math.random() * 60))
        }, 35 + Math.random() * 90))
      } else {
        this._lock(index)
      }
    }

    glitch()
  }

  _lock(index) {
    const span = this._spans[index]
    const ch   = this._text[index]

    this._resolved[index] = true
    span.textContent = ch

    // Swap classes: remove scramble state, add display-font state
    span.classList.remove('ch--scrambling', 'ch--glitching')
    span.classList.add('ch--locked', 'ch--locking')  // locking = flash keyframe
    this._push(setTimeout(() => span.classList.remove('ch--locking'), 300))

    // Notify external listener (e.g. LandingScene) that this letter has locked
    this.opts.onLetterLock?.(index)

    if (this._resolved.every(Boolean)) this._onAllLocked()
  }

  // ── All locked → start per-letter flicker ────────────────────────────────
  _onAllLocked() {
    if (this._done) return
    this._done = true
    clearInterval(this._interval)
    this._interval = null
    this._push(setTimeout(() => {
      this.opts.onComplete?.()
      this._startFlickers()
    }, 300))
  }

  _startFlickers() {
    this._spans.forEach((span, i) => {
      if (!this._resolved[i] || this._text[i] === ' ') return
      this._scheduleFlicker(span)
    })
  }

  /**
   * Each locked letter has its own independent flicker timer.
   * Random interval: 2–9 s between events.
   * Each event: 1–3 rapid on/off blinks (like a faulty neon tube).
   */
  _scheduleFlicker(span) {
    const delay = 2000 + Math.random() * 7000
    const t = setTimeout(() => this._doFlicker(span), delay)
    this._flickerTO.push(t)
  }

  _doFlicker(span) {
    const count    = 1 + Math.floor(Math.random() * 3) // 1–3 blinks
    const sequence = []

    for (let i = 0; i < count; i++) {
      sequence.push({ opacity: '0',   dur: 30  + Math.random() * 80  })  // off
      sequence.push({ opacity: '1',   dur: 20  + Math.random() * 50  })  // on
    }
    // Occasionally: one longer "off" pause for a more dramatic flicker
    if (Math.random() > 0.6) {
      sequence.splice(0, 0, { opacity: '0.15', dur: 80 + Math.random() * 120 })
    }

    let idx = 0
    const next = () => {
      if (idx >= sequence.length) {
        span.style.opacity = ''
        this._scheduleFlicker(span)  // reschedule
        return
      }
      const { opacity, dur } = sequence[idx++]
      span.style.opacity = opacity
      const t = setTimeout(next, dur)
      this._flickerTO.push(t)
    }

    next()
  }

  // ── Cleanup ───────────────────────────────────────────────────────────────
  _push(t) { this._timeouts.push(t) }

  _clearAll() {
    clearInterval(this._interval)
    this._interval = null
    ;[...this._timeouts, ...this._flickerTO].forEach(clearTimeout)
    this._timeouts  = []
    this._flickerTO = []
  }

  destroy() { this._clearAll() }
}
