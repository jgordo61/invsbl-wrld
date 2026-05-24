// ── INVSBL WRLD — Curved Gallery HUD ─────────────────────────────────────────
// Panels sit on a quadratic-bezier arc on the left side of the viewport.
// Scroll only affects the gallery when the pointer is over a panel — otherwise
// wheel events pass through to ShopScene item navigation as normal.
// Click-and-drag also scrolls the gallery.
// ──────────────────────────────────────────────────────────────────────────────
import { gsap } from 'gsap'

// ── Tunable constants ─────────────────────────────────────────────────────────
const PANEL_W   = 395     // px — panel width  (416 × 0.95)
const PANEL_H   = 185     // px — panel height (195 × 0.95)
const T_START   = 0.05    // curve-t of panel[0] at scrollOffset = 0
const T_STEP    = 0.28    // curve-t gap between adjacent panels
const FADE      = 0.18    // fade zone at both ends of the curve (10% earlier)
const LERP      = 0.10    // scroll-lerp factor per frame
const MIN_PAN   = 9       // pad images array to this count
const SCROLL_S  = 0.005   // wheel delta → offset units
const DRAG_S    = 0.012   // drag px → offset units

// ── Quadratic-bezier control points (viewport fractions) ──────────────────────
const P0 = [0.23, 0.08]   // top anchor   (+0.03 toward centre)
const P1 = [0.078, 0.50]  // bow control  (15% more curvature)
const P2 = [0.23, 0.92]   // bottom anchor(+0.03 toward centre)

// ─────────────────────────────────────────────────────────────────────────────
export class HUD {
  constructor() {
    this._visible      = false
    this._panels       = []
    this._scrollOff    = 0
    this._targetOff    = 0
    this._rafId        = null
    this._el           = null
    this._wrap         = null
    this._lbEl         = null

    // Right-side info panels
    this._infoEl       = null   // .info-panels container
    this._namePanelEl  = null
    this._specsPanelEl = null
    this._cartBtnPanelEl = null  // third small panel with add-to-cart button

    // Idle-glitch scheduler — one setTimeout ID per live panel inner element
    this._glitchTimers = []

    // Hover tracking — scroll only captured when pointer is over a panel
    this._hovering     = false

    // Drag-scroll state
    this._dragging     = false
    this._dragMoved    = false   // true once pointer moves >5 px — suppresses click
    this._dragStartY   = 0
    this._dragStartOff = 0

    this._onWheel    = this._onWheel.bind(this)
    this._onDragDown = this._onDragDown.bind(this)
    this._onDragMove = this._onDragMove.bind(this)
    this._onDragUp   = this._onDragUp.bind(this)
    this._onResize   = () => this._layout()

    this._buildDOM()
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  show(item, idx = 0) {
    if (this._visible) return
    this._visible     = true
    this._scrollOff   = 0
    this._targetOff   = 0
    this._el.style.display = 'block'
    this._setItem(item)
    this._setInfoPanels(item)
    this._bootInfoPanels(0.3)
    this._startRAF()
    window.addEventListener('resize', this._onResize, { passive: true })
  }

  // Called every time the shop item changes — rebuilds panels for new item
  update(item, idx = 0) {
    if (!this._visible) return
    this._scrollOff = 0
    this._targetOff = 0
    this._hovering  = false

    // TOC item — hide gallery, centre info panels; restore otherwise
    this._wrap.style.display = item.toc ? 'none' : ''
    this._infoEl.classList.toggle('toc-mode', !!item.toc)

    this._setItem(item)
    // Fade info panels out, swap content, glitch back in
    // Animate _infoInnerEl (never _infoEl — its CSS transform centres the group)
    gsap.to(this._infoInnerEl, {
      opacity: 0, y: -8, duration: 0.2, ease: 'power2.in',
      onComplete: () => {
        this._setInfoPanels(item)
        gsap.set(this._infoInnerEl, { opacity: 1, y: 0 })
        this._bootInfoPanels(0)
      }
    })
  }

  hide() {
    if (!this._visible) return
    this._visible = false
    this._stopRAF()
    this._clearGlitchTimers()
    this._closeLightbox(true)
    this._el.style.display = 'none'
    this._hovering = false
    gsap.killTweensOf(this._infoInnerEl)
    window.removeEventListener('resize', this._onResize)
  }

  dispose() {
    this.hide()
    this._el?.parentNode?.removeChild(this._el)
    this._lbEl?.parentNode?.removeChild(this._lbEl)
  }

  // ── DOM ─────────────────────────────────────────────────────────────────────

  _buildDOM() {
    this._el = document.createElement('div')
    this._el.id = 'hud-overlay'

    // Gallery-wrap: transparent strip that owns pointer events for the gallery.
    // Wheel events are only intercepted when _hovering is true (pointer over a panel).
    // Drag events are always active here so you can drag from any point on a panel.
    this._wrap = document.createElement('div')
    this._wrap.className = 'gallery-wrap'
    this._wrap.addEventListener('wheel',         this._onWheel,    { passive: false })
    this._wrap.addEventListener('pointerdown',   this._onDragDown)
    this._wrap.addEventListener('pointermove',   this._onDragMove)
    this._wrap.addEventListener('pointerup',     this._onDragUp)
    this._wrap.addEventListener('pointercancel', this._onDragUp)
    this._el.appendChild(this._wrap)

    // Lightbox
    this._lbEl = document.createElement('div')
    this._lbEl.id = 'hud-lightbox'
    this._lbEl.innerHTML = `
      <div class="lb-backdrop"></div>
      <div class="lb-frame">
        <button class="lb-close" aria-label="Close">✕</button>
        <img  class="lb-img"      src="" alt="" />
        <div  class="lb-nosignal">NO SIGNAL</div>
      </div>
    `
    this._lbEl.querySelector('.lb-backdrop').addEventListener('click', () => this._closeLightbox())
    this._lbEl.querySelector('.lb-close').addEventListener('click',    () => this._closeLightbox())
    window.addEventListener('keydown', e => { if (e.key === 'Escape') this._closeLightbox() })

    // Right-side info panels (direct children of overlay, not inside gallery-wrap)
    // _infoEl  — positioning wrapper only; CSS transform:translateY(-50%) must NEVER be
    //            touched by GSAP or it will lose its vertical-centering.
    // _infoInnerEl — the element GSAP animates (opacity / y slide on item change).
    this._infoEl = document.createElement('div')
    this._infoEl.className = 'info-panels'

    this._infoInnerEl = document.createElement('div')
    this._infoInnerEl.className = 'info-panels-inner'

    this._namePanelEl = document.createElement('div')
    this._namePanelEl.className = 'info-panel info-name-panel'

    this._specsPanelEl = document.createElement('div')
    this._specsPanelEl.className = 'info-panel info-spec-panel'

    // Cart button panel — small, right-aligned, sits under the right corner of the specs panel
    this._cartBtnPanelEl = document.createElement('div')
    this._cartBtnPanelEl.className = 'info-panel info-cart-panel'
    this._cartBtnPanelEl.innerHTML = `
      <div class="ipanel-inner ipanel-cart-inner">
        <button class="ipanel-cart-btn">ADD TO CART</button>
      </div>
    `
    // Delegate clicks to the hidden #addToCart button so main.js cart logic runs unchanged
    this._cartBtnPanelEl.querySelector('.ipanel-cart-btn')
      .addEventListener('click', () => document.getElementById('addToCart')?.click())

    this._infoInnerEl.appendChild(this._namePanelEl)
    this._infoInnerEl.appendChild(this._specsPanelEl)
    this._infoInnerEl.appendChild(this._cartBtnPanelEl)
    this._infoEl.appendChild(this._infoInnerEl)
    this._el.appendChild(this._infoEl)

    const shop = document.getElementById('shop') ?? document.body
    shop.appendChild(this._el)
    shop.appendChild(this._lbEl)
  }

  // ── Item / panels ───────────────────────────────────────────────────────────

  _setItem(item) {
    this._clearGlitchTimers()
    this._panels.forEach(({ el }) => el.remove())
    this._panels  = []
    this._hovering = false

    const imgs = [...(item.images ?? [])]
    while (imgs.length < MIN_PAN) imgs.push(null)

    imgs.forEach((url, i) => {
      const el = document.createElement('div')
      el.className = 'hud-gpanel'
      el.innerHTML = `
        <div class="gpanel-inner">
          ${url
            ? `<img src="${url}" alt="" class="gpanel-img" />`
            : `<div class="hud-nosignal">NO SIGNAL</div>`
          }
          <div class="hud-label">[ VIEW·${String(i + 1).padStart(2, '0')} ]<span class="hud-cursor">_</span></div>
        </div>
      `

      // Glitch boot — staggered per panel, class removed on finish so hover resumes,
      // then idle random-glitch schedule begins.
      const inner = el.querySelector('.gpanel-inner')
      if (inner) {
        inner.style.animationDelay = (i * 0.12) + 's'
        inner.classList.add('panel-booting')
        inner.addEventListener('animationend', () => {
          inner.classList.remove('panel-booting')
          inner.style.animationDelay = ''
          this._scheduleGlitch(inner)
        }, { once: true })
      }

      // Hover tracking — gates wheel-scroll to gallery only
      el.addEventListener('mouseenter', () => { this._hovering = true  })
      el.addEventListener('mouseleave', () => { this._hovering = false })

      // Click opens lightbox only when the pointer wasn't dragged
      el.addEventListener('click', () => {
        if (this._dragMoved) return
        this._openLightbox(url)
      })

      this._wrap.appendChild(el)
      this._panels.push({ el, url })
    })

    this._layout()
  }

  // ── Info panels (right side) ────────────────────────────────────────────────

  _setInfoPanels(item) {
    const specs       = item.specs ?? []
    const specsHeader = item.specsHeader ?? 'SPECIFICATIONS'
    const nameFooter  = item.nameFooter  ?? '[ DESIGNATION ]'

    this._namePanelEl.innerHTML = `
      <div class="ipanel-inner">
        <div class="ipanel-collection">${item.collection ?? 'INVSBL'}</div>
        <div class="ipanel-name">${item.name}</div>
        <div class="ipanel-footer">${nameFooter}<span class="hud-cursor">_</span></div>
      </div>
    `

    this._specsPanelEl.innerHTML = `
      <div class="ipanel-inner">
        <div class="ipanel-specs-header">${specsHeader}</div>
        <div class="ipanel-specs">
          ${specs.length
            ? specs.map((s, i) => item.toc
                ? `<div class="spec-line toc-link" data-goto="${i}">${s}</div>`
                : `<div class="spec-line">${s}</div>`
              ).join('')
            : '<div class="spec-line spec-placeholder">— DATA PENDING —</div>'
          }
        </div>
        <div class="ipanel-footer">[ TECHNICAL DATA ]<span class="hud-cursor">_</span></div>
      </div>
    `

    // Wire up TOC links to dispatch a navigation event
    if (item.toc) {
      this._specsPanelEl.querySelectorAll('.toc-link').forEach(el => {
        el.addEventListener('click', () => {
          const idx = parseInt(el.dataset.goto, 10)
          this._el.dispatchEvent(new CustomEvent('toc-goto', { bubbles: true, detail: { index: idx } }))
        })
      })
    }

    // Hide the cart button on non-purchasable items (e.g. table of contents)
    this._cartBtnPanelEl.style.display = item.toc ? 'none' : ''
  }

  // Trigger glitch-boot on both info panel inners with a stagger,
  // then start idle random-glitch schedule for each.
  // Info panels glitch 40% more often than photo panels (intervals ×0.6):
  //   photo panels: 1500–8500 ms   info panels: 900–5100 ms
  _bootInfoPanels(baseDelay = 0) {
    const boot = (el, delay) => {
      if (!el) return
      el.style.animationDelay = delay + 's'
      el.classList.add('panel-booting')
      el.addEventListener('animationend', () => {
        el.classList.remove('panel-booting')
        el.style.animationDelay = ''
        this._scheduleGlitch(el, 900, 5100)   // 40% more frequent than photo panels
      }, { once: true })
    }
    boot(this._namePanelEl.querySelector('.ipanel-inner'),           baseDelay)
    boot(this._specsPanelEl.querySelector('.ipanel-inner'),          baseDelay + 0.22)
    boot(this._cartBtnPanelEl.querySelector('.ipanel-cart-inner'),   baseDelay + 0.44)
  }

  // ── Idle glitch scheduler ────────────────────────────────────────────────────

  // Schedules a single random glitch on `el`, then re-schedules itself.
  // minMs / maxMs control the wait range between glitches.
  // Only runs while `this._visible` is true; call `_clearGlitchTimers()` to stop.
  _scheduleGlitch(el, minMs = 1500, maxMs = 8500) {
    const delay = minMs + Math.random() * (maxMs - minMs)
    const id = setTimeout(() => {
      // Drop this ID from the live list
      const i = this._glitchTimers.indexOf(id)
      if (i !== -1) this._glitchTimers.splice(i, 1)

      if (!this._visible) return
      // Skip if the element is mid-boot or already glitching
      if (el.classList.contains('panel-booting') || el.classList.contains('panel-glitch')) {
        this._scheduleGlitch(el, minMs, maxMs)
        return
      }

      el.classList.add('panel-glitch')
      el.addEventListener('animationend', () => {
        el.classList.remove('panel-glitch')
        if (this._visible) this._scheduleGlitch(el, minMs, maxMs)
      }, { once: true })
    }, delay)

    this._glitchTimers.push(id)
  }

  _clearGlitchTimers() {
    this._glitchTimers.forEach(id => clearTimeout(id))
    this._glitchTimers = []
  }

  // ── Bezier helpers ──────────────────────────────────────────────────────────

  _pt(t) {
    const vw = window.innerWidth, vh = window.innerHeight
    const mt = 1 - t
    return {
      x: mt*mt * P0[0]*vw + 2*mt*t * P1[0]*vw + t*t * P2[0]*vw,
      y: mt*mt * P0[1]*vh + 2*mt*t * P1[1]*vh + t*t * P2[1]*vh,
    }
  }

  // ── Layout ──────────────────────────────────────────────────────────────────

  _layout() {
    const n = this._panels.length
    if (!n) return

    // Scale gallery panels down in landscape-mobile so they don't occlude the model
    const isLandscapeMobile = window.innerHeight < 500
                           && window.innerWidth  > window.innerHeight
                           && ('ontouchstart' in window || navigator.maxTouchPoints > 0)
    const scale   = isLandscapeMobile ? 0.335 : 1
    const panelW  = Math.round(PANEL_W * scale)
    const panelH  = Math.round(PANEL_H * scale)

    this._panels.forEach(({ el }, i) => {
      const t = T_START + (i - this._scrollOff) * T_STEP

      const offscreen = t < -0.06 || t > 1.06

      let alpha = 1
      if      (offscreen)    alpha = 0
      else if (t < FADE)     alpha = Math.max(0, t / FADE)
      else if (t > 1 - FADE) alpha = Math.max(0, (1 - t) / FADE)

      const tc        = Math.max(0, Math.min(1, t))
      const { x, y }  = this._pt(tc)

      el.style.opacity        = alpha
      el.style.pointerEvents  = offscreen ? 'none' : ''
      el.style.width          = panelW + 'px'
      el.style.height         = panelH + 'px'
      el.style.left           = (x - panelW / 2) + 'px'
      el.style.top            = (y - panelH / 2) + 'px'
      el.style.transform      = ''
      el.style.zIndex         = Math.round(alpha * 5)
    })
  }

  // ── RAF loop ─────────────────────────────────────────────────────────────────

  _startRAF() {
    const tick = () => {
      if (!this._visible) return
      const d = this._targetOff - this._scrollOff
      if (Math.abs(d) > 0.0005) { this._scrollOff += d * LERP; this._layout() }
      this._rafId = requestAnimationFrame(tick)
    }
    this._rafId = requestAnimationFrame(tick)
  }

  _stopRAF() {
    if (this._rafId) { cancelAnimationFrame(this._rafId); this._rafId = null }
  }

  // ── Input ────────────────────────────────────────────────────────────────────

  _maxOff() {
    const visible = (1 - T_START * 2 - FADE * 2) / T_STEP
    return Math.max(0, this._panels.length - Math.floor(visible) - 1)
  }

  // Wheel — only hijacks the event when the pointer is over a panel.
  // Otherwise the event propagates naturally to ShopScene's item navigator.
  _onWheel(e) {
    if (!this._hovering) return
    e.stopPropagation()
    e.preventDefault()
    this._targetOff = Math.max(0, Math.min(this._maxOff(),
      this._targetOff + e.deltaY * SCROLL_S))
  }

  // Drag-scroll — pointer events work for both mouse and touch
  _onDragDown(e) {
    // Only start gallery drag when the pointer is actually over a panel.
    // Clicks on empty space within the gallery-wrap must pass through to the
    // 3D canvas beneath (enabled by pointer-events:none on .gallery-wrap).
    if (!e.target.closest('.hud-gpanel')) return
    this._dragging     = true
    this._dragMoved    = false
    this._dragStartY   = e.clientY
    this._dragStartOff = this._targetOff
    try { this._wrap.setPointerCapture(e.pointerId) } catch (_) {}
    this._wrap.style.cursor = 'grabbing'
  }

  _onDragMove(e) {
    if (!this._dragging) return
    const dy = e.clientY - this._dragStartY
    if (Math.abs(dy) > 5) this._dragMoved = true
    // drag upward (negative dy) → scroll forward through panels
    this._targetOff = Math.max(0, Math.min(this._maxOff(),
      this._dragStartOff - dy * DRAG_S))
  }

  _onDragUp() {
    this._dragging          = false
    this._wrap.style.cursor = ''
    // Keep _dragMoved true briefly so the click handler on the panel can see it,
    // then reset on the next frame
    requestAnimationFrame(() => { this._dragMoved = false })
  }

  // ── Lightbox ─────────────────────────────────────────────────────────────────

  _openLightbox(url) {
    const frame = this._lbEl.querySelector('.lb-frame')
    const img   = this._lbEl.querySelector('.lb-img')
    const noSig = this._lbEl.querySelector('.lb-nosignal')

    if (url) {
      img.src             = url
      img.style.display   = 'block'
      noSig.style.display = 'none'
    } else {
      img.style.display   = 'none'
      noSig.style.display = 'flex'
    }

    this._lbEl.style.display = 'flex'
    gsap.fromTo(this._lbEl.querySelector('.lb-backdrop'),
      { opacity: 0 },
      { opacity: 1, duration: 0.3, ease: 'power2.out' })
    gsap.fromTo(frame,
      { opacity: 0, scale: 0.88, y: 18 },
      { opacity: 1, scale: 1,    y: 0,  duration: 0.4, ease: 'power3.out' })
  }

  _closeLightbox(immediate = false) {
    if (this._lbEl.style.display === 'none') return
    if (immediate) { this._lbEl.style.display = 'none'; return }

    const frame = this._lbEl.querySelector('.lb-frame')
    gsap.to(frame,
      { opacity: 0, scale: 0.9, duration: 0.2, ease: 'power2.in' })
    gsap.to(this._lbEl.querySelector('.lb-backdrop'), {
      opacity: 0, duration: 0.28, ease: 'power2.in',
      onComplete: () => {
        this._lbEl.style.display = 'none'
        gsap.set(frame, { opacity: 1, scale: 1, y: 0 })
      }
    })
  }
}
