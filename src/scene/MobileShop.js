/**
 * MobileShop
 *
 * Mobile-specific shop layout — replaces the desktop HUD on narrow screens.
 *
 * Layout (position: fixed layers, all inside #shop so they auto-hide with it):
 *
 *   ┌─────────────────────────────────┐  ← top: 0
 *   │  #mob-gallery  (22vh)           │  horizontal-scroll photo strip
 *   ├─────────────────────────────────┤  ← 22vh
 *   │  transparent (36vh)             │  pointer-events:none → 3D canvas below
 *   ├─────────────────────────────────┤  ← 58vh
 *   │  #mob-info     (42vh)           │  vertically-scrollable text drawer
 *   └─────────────────────────────────┘  ← 100vh
 *
 * Navigation:
 *   • Scroll through the text drawer to the bottom, then swipe up → next item
 *   • Tap the CONTINUE cue at the bottom → next item
 *   • The dots-nav on the right lets you jump directly to any item
 */
export class MobileShop {
  constructor() {
    this._visible  = false
    this._atBottom = false
    this._touchY0  = 0
    this._onNext   = null
    this._onPrev   = null

    this._el      = null   // root wrapper (pointer-events:none)
    this._galEl   = null   // gallery strip
    this._infoEl  = null   // info drawer
    this._nameEl  = null
    this._specsEl = null
    this._cueEl   = null

    this._buildDOM()
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  /**
   * @param {object}   item
   * @param {number}   idx
   * @param {object}   [cbs]  { onNext, onPrev }
   */
  show(item, idx, cbs = {}) {
    this._onNext = cbs.onNext ?? null
    this._onPrev = cbs.onPrev ?? null
    this._visible = true
    this._el.style.display = 'block'
    this._update(item, idx)
  }

  /** Called every time the active catalog item changes. */
  update(item, idx) {
    if (!this._visible) return
    this._update(item, idx)
  }

  hide() {
    this._visible = false
    this._el.style.display = 'none'
  }

  dispose() {
    this.hide()
    this._el?.remove()
  }

  // ── Internal ────────────────────────────────────────────────────────────────

  _update(item, idx) {
    this._atBottom = false
    this._infoEl.scrollTo({ top: 0, behavior: 'instant' })

    this._renderGallery(item)
    this._renderInfo(item)

    // TOC item: no gallery, taller info drawer
    this._galEl.style.display = item.toc ? 'none' : 'flex'
    this._infoEl.classList.toggle('toc-mode', !!item.toc)

    // Hide continue cue on last item (no next)
    this._cueEl.style.display = item.toc ? 'none' : 'flex'
  }

  _buildDOM() {
    const shopEl = document.getElementById('shop') ?? document.body

    // ── Root — pointer-events:none so middle zone passes touches to 3D canvas ──
    this._el = document.createElement('div')
    this._el.id = 'mob-shop'

    // ── Gallery strip ─────────────────────────────────────────────────────────
    this._galEl = document.createElement('div')
    this._galEl.id = 'mob-gallery'

    // ── Info drawer ───────────────────────────────────────────────────────────
    this._infoEl = document.createElement('div')
    this._infoEl.id = 'mob-info'

    this._nameEl  = document.createElement('div')
    this._nameEl.className = 'mob-name-block'

    this._specsEl = document.createElement('div')
    this._specsEl.className = 'mob-specs-block'

    // CONTINUE cue — always at the bottom of the scrollable content
    this._cueEl = document.createElement('div')
    this._cueEl.className = 'mob-continue-cue'
    this._cueEl.innerHTML = `
      <span class="mob-cue-text">CONTINUE</span>
      <div class="mob-cue-line"></div>
    `
    this._cueEl.addEventListener('click', () => this._onNext?.())

    this._infoEl.appendChild(this._nameEl)
    this._infoEl.appendChild(this._specsEl)
    this._infoEl.appendChild(this._cueEl)

    this._el.appendChild(this._galEl)
    this._el.appendChild(this._infoEl)
    shopEl.appendChild(this._el)

    // ── Scroll detection ──────────────────────────────────────────────────────
    this._infoEl.addEventListener('scroll', () => {
      const { scrollTop, scrollHeight, clientHeight } = this._infoEl
      this._atBottom = scrollHeight - scrollTop - clientHeight < 12
    }, { passive: true })

    // ── Touch gestures on info drawer ─────────────────────────────────────────
    // Swipe up when at bottom → next item
    // Swipe down when at top  → prev item / exit
    this._infoEl.addEventListener('touchstart', e => {
      this._touchY0 = e.touches[0].clientY
    }, { passive: true })

    this._infoEl.addEventListener('touchend', e => {
      const dy     = this._touchY0 - e.changedTouches[0].clientY   // +ve = swipe up
      const atTop  = this._infoEl.scrollTop < 8

      if (this._atBottom && dy > 25)  this._onNext?.()
      if (atTop && dy < -35)          this._onPrev?.()
    }, { passive: true })
  }

  // ── Gallery rendering ───────────────────────────────────────────────────────

  _renderGallery(item) {
    this._galEl.innerHTML = ''
    const imgs = [...(item.images ?? [])]
    while (imgs.length < 3) imgs.push(null)

    imgs.forEach((url, i) => {
      const thumb = document.createElement('div')
      thumb.className = 'mob-thumb'

      if (url) {
        const img = document.createElement('img')
        img.src = url; img.alt = ''; img.className = 'mob-thumb-img'
        thumb.appendChild(img)
      } else {
        const ns = document.createElement('div')
        ns.className = 'mob-thumb-nosig'
        ns.textContent = 'NO·SIGNAL'
        thumb.appendChild(ns)
      }

      const label = document.createElement('div')
      label.className = 'mob-thumb-label'
      label.textContent = `[ VIEW·${String(i + 1).padStart(2, '0')} ]`
      thumb.appendChild(label)

      this._galEl.appendChild(thumb)
    })
  }

  // ── Info rendering ──────────────────────────────────────────────────────────

  _renderInfo(item) {
    const specs  = item.specs       ?? []
    const header = item.specsHeader ?? 'SPECIFICATIONS'
    const footer = item.nameFooter  ?? '[ DESIGNATION ]'

    // Name block
    this._nameEl.innerHTML = `
      <div class="mob-collection">${item.collection ?? 'INVSBL'}</div>
      <div class="mob-item-name">${item.name}</div>
      <div class="mob-item-footer">${footer}<span class="hud-cursor">_</span></div>
    `

    // Specs block
    const specsHTML = specs.length
      ? specs.map((s, i) => item.toc
          ? `<div class="mob-spec-line mob-toc-link" data-goto="${i}">${s}</div>`
          : `<div class="mob-spec-line">${s}</div>`
        ).join('')
      : '<div class="mob-spec-line mob-spec-ph">— DATA PENDING —</div>'

    const cartHTML = item.toc ? '' : `<button class="mob-cart-btn">ADD TO CART</button>`

    this._specsEl.innerHTML = `
      <div class="mob-specs-header">${header}</div>
      <div class="mob-specs-list">${specsHTML}</div>
      ${cartHTML}
    `

    // Wire cart
    this._specsEl.querySelector('.mob-cart-btn')
      ?.addEventListener('click', () => document.getElementById('addToCart')?.click())

    // Wire TOC links
    if (item.toc) {
      this._specsEl.querySelectorAll('.mob-toc-link').forEach(el => {
        el.addEventListener('click', () => {
          document.dispatchEvent(new CustomEvent('toc-goto', {
            bubbles: true,
            detail: { index: parseInt(el.dataset.goto, 10) }
          }))
        })
      })
    }
  }
}
