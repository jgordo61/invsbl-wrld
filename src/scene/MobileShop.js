/**
 * MobileShop
 *
 * Mobile shop layout — a single vertically scrollable column inside a fixed
 * fullscreen container.  Three sections stacked top-to-bottom:
 *
 *   1. #mob-gallery  (28vh, sticky)    — horizontal-scroll photo strip,
 *                                        same .hud-gpanel panels as desktop
 *   2. #mob-3d-spacer (68vh, transparent) — 3D canvas shows through
 *   3. #mob-info  (auto, white)        — item name, specs, cart, continue cue
 *
 * Total content height ≈ 160vh, so the page scrolls.
 * When scrolled to the very bottom, swiping up or tapping CONTINUE fires onNext.
 */
export class MobileShop {
  constructor() {
    this._visible  = false
    this._atBottom = false
    this._touchY0  = 0
    this._onNext   = null
    this._onPrev   = null

    this._el       = null   // #mob-shop  — scroll container
    this._galEl    = null   // #mob-gallery
    this._spacerEl = null   // #mob-3d-spacer
    this._infoEl   = null   // #mob-info
    this._nameEl   = null
    this._specsEl  = null
    this._cueEl    = null

    this._buildDOM()
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  show(item, idx, cbs = {}) {
    this._onNext = cbs.onNext ?? null
    this._onPrev = cbs.onPrev ?? null
    this._visible = true
    this._el.style.display = 'block'
    this._update(item, idx)
  }

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
    this._el.scrollTo({ top: 0, behavior: 'instant' })

    this._renderGallery(item)
    this._renderInfo(item)

    // TOC item has no 3D model and no gallery
    this._galEl.style.display    = item.toc ? 'none' : 'flex'
    this._spacerEl.style.display = item.toc ? 'none' : 'block'
    this._cueEl.style.display    = 'flex'   // always show — last item just does nothing
  }

  _buildDOM() {
    const shopEl = document.getElementById('shop') ?? document.body

    // ── Scroll container ──────────────────────────────────────────────────────
    this._el = document.createElement('div')
    this._el.id = 'mob-shop'

    // ── Gallery strip (sticky at top) ─────────────────────────────────────────
    this._galEl = document.createElement('div')
    this._galEl.id = 'mob-gallery'

    // ── Transparent 3D spacer ─────────────────────────────────────────────────
    this._spacerEl = document.createElement('div')
    this._spacerEl.id = 'mob-3d-spacer'

    // ── Info block (white, flows below the model) ─────────────────────────────
    this._infoEl = document.createElement('div')
    this._infoEl.id = 'mob-info'

    this._nameEl  = document.createElement('div')
    this._nameEl.className = 'mob-name-block'

    this._specsEl = document.createElement('div')
    this._specsEl.className = 'mob-specs-block'

    // CONTINUE cue — tapping advances to next item
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
    this._el.appendChild(this._spacerEl)
    this._el.appendChild(this._infoEl)
    shopEl.appendChild(this._el)

    // ── Scroll: detect when the info drawer reaches its bottom ───────────────
    this._infoEl.addEventListener('scroll', () => {
      const { scrollTop, scrollHeight, clientHeight } = this._infoEl
      this._atBottom = scrollHeight - scrollTop - clientHeight < 12
    }, { passive: true })

    // ── Touch on info drawer: swipe up at bottom → next item ─────────────────
    this._infoEl.addEventListener('touchstart', e => {
      this._touchY0 = e.touches[0].clientY
    }, { passive: true })

    this._infoEl.addEventListener('touchend', e => {
      const dy = this._touchY0 - e.changedTouches[0].clientY   // +ve = swipe up
      if (this._atBottom && dy > 25) this._onNext?.()
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

    this._nameEl.innerHTML = `
      <div class="mob-collection">${item.collection ?? 'INVSBL'}</div>
      <div class="mob-item-name">${item.name}</div>
      <div class="mob-item-footer">${footer}<span class="hud-cursor">_</span></div>
    `

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

    // Wire cart button
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
