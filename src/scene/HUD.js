// ── INVSBL WRLD — HUD Overlay ─────────────────────────────────────────────────
// Three tactical photo panels + SVG connector lines.
// Each catalog item has its own panel layout, convergence points, and line routes.
// Boot order: line draws out FROM the object → reaches panel → panel flickers in.
// Ambient: panels and lines both flicker/glitch continuously after boot.
// ──────────────────────────────────────────────────────────────────────────────

// Timing
const LINE_LEADER_PX = 10    // horizontal leader stub at panel edge
const LINE_DRAW_MS   = 620   // matches .hud-line transition duration
const BOOT_BASE_MS   = 300   // safety gap after shop slide-in
const BOOT_STAGGER   = 370   // delay between each panel's sequence
const BOOT_ANIM_MS   = 680   // CRT-flicker keyframe duration

// Per-panel phase offset for ambient animations (keeps panels out of sync)
const PHASE_STEP_S = 1.7

// ── Per-item HUD configurations ───────────────────────────────────────────────
// panel props:
//   left | right  — CSS position value (only one needed)
//   top            — CSS position value
//   route          — 'L' | 'diagonal' | '3leg' | 'Z'
//   side           — 'left' (default) | 'right' — which panel edge the line meets
// conv: viewport fractions { x, y } for where each line originates on the model
// ─────────────────────────────────────────────────────────────────────────────

const ITEM_CONFIGS = [

  // ── 0: CRESCENT GRADIENT ── left panels ──────────────────────────────────
  {
    panels: [
      { id: 'VIEW·01', left: '2vw',   top: '5%',  route: 'L'        },
      { id: 'VIEW·02', left: '0.5vw', top: '33%', route: 'diagonal' },
      { id: 'VIEW·03', left: '2vw',   top: '60%', route: '3leg'     },
    ],
    conv: [
      { x: 0.500, y: 0.230 },   // just above crescent outer arc
      { x: 0.306, y: 0.500 },   // outside crescent left edge
      { x: 0.500, y: 0.820 },   // well below crescent main body
    ],
  },

  // ── 1: HALF CRESCENT GRADIENT ── placeholder (configured per-session) ──────
  {
    panels: [
      { id: 'VIEW·01', left: '2vw',   top: '5%',  route: 'L'        },
      { id: 'VIEW·02', left: '0.5vw', top: '33%', route: 'diagonal' },
      { id: 'VIEW·03', left: '2vw',   top: '60%', route: '3leg'     },
    ],
    conv: [
      { x: 0.500, y: 0.230 },
      { x: 0.306, y: 0.500 },
      { x: 0.500, y: 0.820 },
    ],
  },

  // ── 2: CLOUD BENGAL ── placeholder (configured per-session) ──────────────
  {
    panels: [
      { id: 'VIEW·01', left: '2vw',   top: '5%',  route: 'L'        },
      { id: 'VIEW·02', left: '0.5vw', top: '33%', route: 'diagonal' },
      { id: 'VIEW·03', left: '2vw',   top: '60%', route: '3leg'     },
    ],
    conv: [
      { x: 0.500, y: 0.230 },
      { x: 0.306, y: 0.500 },
      { x: 0.500, y: 0.820 },
    ],
  },

  // ── 3: HYPERCUBE ── placeholder (configured per-session) ─────────────────
  {
    panels: [
      { id: 'VIEW·01', left: '2vw',   top: '5%',  route: 'L'        },
      { id: 'VIEW·02', left: '0.5vw', top: '33%', route: 'diagonal' },
      { id: 'VIEW·03', left: '2vw',   top: '60%', route: '3leg'     },
    ],
    conv: [
      { x: 0.500, y: 0.230 },
      { x: 0.306, y: 0.500 },
      { x: 0.500, y: 0.820 },
    ],
  },

  // ── 4: EPSILON ── placeholder (configured per-session) ───────────────────
  {
    panels: [
      { id: 'VIEW·01', left: '2vw',   top: '5%',  route: 'L'        },
      { id: 'VIEW·02', left: '0.5vw', top: '33%', route: 'diagonal' },
      { id: 'VIEW·03', left: '2vw',   top: '60%', route: '3leg'     },
    ],
    conv: [
      { x: 0.500, y: 0.230 },
      { x: 0.306, y: 0.500 },
      { x: 0.500, y: 0.820 },
    ],
  },

]

// ──────────────────────────────────────────────────────────────────────────────
export class HUD {
  constructor() {
    this._visible      = false
    this._timers       = []
    this._el           = null
    this._svg          = null
    this._panels       = []
    this._activeConfig = ITEM_CONFIGS[0]
    this._onResize     = () => this._redrawAllLines(false)
    this._build()
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  show(item, idx = 0) {
    if (this._visible) return
    this._visible = true
    this._el.style.display = 'block'
    this._reconfigure(idx)
    this._setImages(item)
    this._bootAll()
    window.addEventListener('resize', this._onResize, { passive: true })
  }

  // Full re-boot with new config when the user scrolls to a different item
  update(item, idx = 0) {
    if (!this._visible) return
    this._reconfigure(idx)
    this._setImages(item)
    this._bootAll()
  }

  hide() {
    if (!this._visible) return
    this._visible = false
    this._clearTimers()
    window.removeEventListener('resize', this._onResize)
    this._panels.forEach(p => {
      p.lineDrawn = false
      p.el.classList.remove(
        'hud-panel--booting', 'hud-panel--visible', 'hud-panel--flash'
      )
      p.el.style.opacity = '0'
    })
    this._svg.innerHTML = ''
    this._el.style.display = 'none'
  }

  dispose() {
    this.hide()
    if (this._el?.parentNode) this._el.parentNode.removeChild(this._el)
  }

  // ── DOM ─────────────────────────────────────────────────────────────────────

  _build() {
    this._el = document.createElement('div')
    this._el.id = 'hud-overlay'

    this._svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    this._svg.setAttribute('class', 'hud-svg')
    this._el.appendChild(this._svg)

    // Create 3 panel elements — positions applied by _reconfigure()
    this._panels = [0, 1, 2].map((_, i) => {
      const el = document.createElement('div')
      el.className = 'hud-panel'
      el.style.opacity = '0'
      el.style.setProperty('--hud-phase', `${-(i * PHASE_STEP_S)}s`)
      el.innerHTML = `
        <span class="hud-corner hud-corner--tl"></span>
        <span class="hud-corner hud-corner--tr"></span>
        <span class="hud-corner hud-corner--bl"></span>
        <span class="hud-corner hud-corner--br"></span>
        <div class="hud-img">
          <div class="hud-scan"></div>
          <div class="hud-nosignal">NO SIGNAL</div>
        </div>
        <div class="hud-label">[ VIEW·0${i + 1} ]<span class="hud-cursor">_</span></div>
      `
      this._el.appendChild(el)
      return { el, lineDrawn: false }
    })

    // Apply initial positions
    this._reconfigure(0)

    const shop = document.getElementById('shop')
    if (shop) shop.appendChild(this._el)
    else       document.body.appendChild(this._el)
  }

  // ── Config switching ─────────────────────────────────────────────────────────

  _reconfigure(idx) {
    const cfg = ITEM_CONFIGS[idx] ?? ITEM_CONFIGS[0]
    this._activeConfig = cfg
    cfg.panels.forEach((pcfg, i) => {
      const el = this._panels[i].el
      // Clear both sides, then apply whichever this config uses
      el.style.left  = pcfg.left  ?? ''
      el.style.right = pcfg.right ?? ''
      el.style.top   = pcfg.top
      const lbl = el.querySelector('.hud-label')
      if (lbl) lbl.innerHTML = `[ ${pcfg.id} ]<span class="hud-cursor">_</span>`
    })
  }

  // ── Images ──────────────────────────────────────────────────────────────────

  _setImages(item) {
    const images = item.images || []
    this._panels.forEach(({ el }, i) => {
      const container = el.querySelector('.hud-img')
      const old       = container.querySelector('img')
      const noSig     = container.querySelector('.hud-nosignal')
      if (old) old.remove()
      if (images[i]) {
        const img = document.createElement('img')
        img.src = images[i]; img.alt = ''
        container.prepend(img)
        noSig.style.display = 'none'
      } else {
        noSig.style.display = 'flex'
      }
    })
  }

  // ── Boot sequence ── lines first, then panels ────────────────────────────────

  _bootAll() {
    this._clearTimers()
    this._svg.innerHTML = ''
    this._panels.forEach(p => {
      p.lineDrawn = false
      p.el.classList.remove(
        'hud-panel--booting', 'hud-panel--visible', 'hud-panel--flash'
      )
      p.el.style.opacity = '0'
    })

    this._panels.forEach((panel, i) => {
      const start = BOOT_BASE_MS + i * BOOT_STAGGER

      // ① Line draws out from the object
      this._timers.push(setTimeout(() => this._drawLine(i, true), start))

      // ② Panel CRT-flickers in once line arrives
      this._timers.push(setTimeout(() => {
        panel.el.style.opacity = ''
        panel.el.classList.add('hud-panel--booting')

        // ③ Settle — ambient glitch takes over
        this._timers.push(setTimeout(() => {
          panel.el.classList.remove('hud-panel--booting')
          panel.el.classList.add('hud-panel--visible')
        }, BOOT_ANIM_MS + 20))

      }, start + LINE_DRAW_MS))
    })
  }

  // ── SVG line routing ─────────────────────────────────────────────────────────
  // Routes: 'L' | 'diagonal' | '3leg' | 'Z'
  // side:   'left' → line meets rect.right  (panel on left,  line comes from right)
  //         'right'→ line meets rect.left   (panel on right, line comes from left)

  _drawLine(i, animate) {
    const { el }  = this._panels[i]
    const pcfg    = this._activeConfig.panels[i]
    const conv    = this._activeConfig.conv[i]
    const cx      = window.innerWidth  * conv.x
    const cy      = window.innerHeight * conv.y

    const rect = el.getBoundingClientRect()
    if (rect.width === 0) {
      this._timers.push(setTimeout(() => this._drawLine(i, animate), 120))
      return
    }

    const side = pcfg.side ?? 'left'
    const px   = side === 'right' ? rect.left : rect.right  // panel connection X
    const pmY  = rect.top + rect.height * 0.5
    const pbY  = rect.bottom
    // sign: +1 when panel is LEFT of conv (line travels leftward to reach it)
    //       -1 when panel is RIGHT of conv (line travels rightward)
    const sign = side === 'left' ? 1 : -1

    let d, len

    switch (pcfg.route) {

      case 'L': {
        // Simple L: vertical drop from conv → horizontal to panel mid
        d   = [`M ${cx} ${cy}`, `L ${cx} ${pmY}`, `L ${px} ${pmY}`].join(' ')
        len = Math.abs(cy - pmY) + Math.abs(cx - px)
        this._addTick(cx, pmY, true)

        // Extra pointer stub descending from conv toward the model
        const dropY   = cy + window.innerHeight * 0.0175
        const dropLen = dropY - cy
        const ptr = document.createElementNS('http://www.w3.org/2000/svg', 'path')
        ptr.setAttribute('d', `M ${cx} ${cy} L ${cx} ${dropY}`)
        ptr.setAttribute('class', animate ? 'hud-line' : 'hud-line hud-line--instant')
        ptr.style.strokeDasharray  = dropLen
        ptr.style.strokeDashoffset = animate ? dropLen : 0
        ptr.style.setProperty('--line-phase', `${-(i * 1.25)}s`)
        this._svg.insertBefore(ptr, this._svg.firstChild)
        if (animate) {
          requestAnimationFrame(() => { ptr.style.strokeDashoffset = '0' })
          this._timers.push(setTimeout(() => {
            ptr.style.strokeDashoffset = ''
            ptr.classList.remove('hud-line')
            ptr.classList.add('hud-line--active')
            ptr.style.animationDelay = `var(--line-phase)`
          }, LINE_DRAW_MS + 80))
        }
        break
      }

      case 'diagonal': {
        // Direct diagonal from conv → short horizontal leader into panel mid
        const elbowX = px + sign * LINE_LEADER_PX
        d   = [`M ${cx} ${cy}`, `L ${elbowX} ${pmY}`, `L ${px} ${pmY}`].join(' ')
        len = Math.hypot(elbowX - cx, pmY - cy) + LINE_LEADER_PX
        this._addTick(elbowX, pmY, true)
        break
      }

      case '3leg': {
        // Vertical drop → horizontal → 40° angle up into panel mid
        const dy = pbY - pmY
        const dx = dy / Math.tan(40 * Math.PI / 180)
        const ex = px + sign * dx   // elbow where horizontal ends / angle begins
        d = [
          `M ${cx}  ${cy}`,
          `L ${cx}  ${pbY}`,
          `L ${ex}  ${pbY}`,
          `L ${px}  ${pmY}`,
        ].join(' ')
        len = Math.abs(pbY - cy) + Math.abs(cx - ex) + Math.hypot(ex - px, pbY - pmY)
        this._addTick(cx, pbY, true)
        this._addTick(ex, pbY, false)
        break
      }

      case 'Z': {
        // Z-shape: horizontal → vertical → horizontal (two right-angle elbows)
        const midX = px + (cx - px) * 0.45
        d = [
          `M ${cx}   ${cy}`,
          `L ${midX} ${cy}`,
          `L ${midX} ${pmY}`,
          `L ${px}   ${pmY}`,
        ].join(' ')
        len = Math.abs(cx - midX) + Math.abs(cy - pmY) + Math.abs(midX - px)
        this._addTick(midX, cy,  false)
        this._addTick(midX, pmY, false)
        break
      }

      default:
        return
    }

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
    path.setAttribute('d', d)
    path.setAttribute('class', animate ? 'hud-line' : 'hud-line hud-line--instant')
    path.style.strokeDasharray  = len
    path.style.strokeDashoffset = animate ? len : 0
    path.style.setProperty('--line-phase', `${-(i * 1.25)}s`)
    this._svg.insertBefore(path, this._svg.firstChild)

    this._panels[i].lineDrawn = true

    if (animate) {
      requestAnimationFrame(() => { path.style.strokeDashoffset = '0' })
      this._timers.push(setTimeout(() => {
        path.style.strokeDashoffset = ''
        path.classList.remove('hud-line')
        path.classList.add('hud-line--active')
        path.style.animationDelay = `var(--line-phase)`
      }, LINE_DRAW_MS + 80))
    }
  }

  // ── SVG helpers ─────────────────────────────────────────────────────────────

  _addTick(x, y, horizontal) {
    const t = document.createElementNS('http://www.w3.org/2000/svg', 'line')
    if (horizontal) {
      t.setAttribute('x1', x - 5); t.setAttribute('x2', x + 5)
      t.setAttribute('y1', y);     t.setAttribute('y2', y)
    } else {
      t.setAttribute('x1', x); t.setAttribute('x2', x)
      t.setAttribute('y1', y - 5); t.setAttribute('y2', y + 5)
    }
    t.setAttribute('class', 'hud-tick')
    this._svg.appendChild(t)
  }

  _redrawAllLines(animate = false) {
    this._svg.innerHTML = ''
    this._panels.forEach((p, i) => { if (p.lineDrawn) this._drawLine(i, animate) })
  }

  _clearTimers() {
    this._timers.forEach(clearTimeout)
    this._timers = []
  }
}
