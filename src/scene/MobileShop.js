import { gsap } from 'gsap'
import { sounds } from '../utils/sounds.js'

/**
 * MobileShop
 *
 * Mobile shop layout — three fixed zones:
 *   1. #mob-gallery  (0–25vh)      — horizontal-scroll photo strip
 *   2. #mob-3d-spacer (25–77.5vh)  — transparent, passes touches to 3D canvas
 *   3. #mob-info  (77.5–100vh)     — item name, specs, cart, continue cue
 *
 * Tapping a gallery thumb opens the shared #hud-lightbox (same as desktop).
 */
export class MobileShop {
  constructor() {
    this._visible  = false
    this._atBottom = false
    this._atTop    = true
    this._touchY0  = 0
    this._onNext   = null
    this._onPrev   = null

    this._el       = null   // #mob-shop  — scroll container
    this._galEl    = null   // #mob-gallery
    this._tickThumbs = []   // gallery-tick tracking, see _checkGalleryTicks()
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
    this._closeLightbox()
  }

  dispose() {
    this.hide()
    this._el?.remove()
  }

  // ── Internal ────────────────────────────────────────────────────────────────

  _update(item, idx) {
    this._atBottom = false
    this._atTop    = true
    this._el.scrollTo({ top: 0, behavior: 'instant' })
    this._infoEl.scrollTo({ top: 0, behavior: 'instant' })

    this._renderGallery(item)
    this._renderInfo(item)

    // TOC item has no 3D model and no gallery — info drawer expands to fill
    // the full screen instead of sitting in its usual bottom strip.
    this._galEl.style.display    = item.toc ? 'none' : 'flex'
    this._spacerEl.style.display = item.toc ? 'none' : 'block'
    this._infoEl.classList.toggle('toc-mode', !!item.toc)
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

    // Continue cue — tapping advances to next item
    this._cueEl = document.createElement('div')
    this._cueEl.className = 'mob-continue-cue'
    this._cueEl.innerHTML = `
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

    // ── Gallery scroll: tick sound as each thumb crosses the strip's
    // horizontal center — mirrors HUD.js's arc-midpoint tick on desktop.
    this._galEl.addEventListener('scroll', () => this._checkGalleryTicks(), { passive: true })

    // ── Scroll: detect when the info drawer reaches its top/bottom ───────────
    this._infoEl.addEventListener('scroll', () => {
      const { scrollTop, scrollHeight, clientHeight } = this._infoEl
      this._atBottom = scrollHeight - scrollTop - clientHeight < 12
      this._atTop    = scrollTop < 12
    }, { passive: true })

    // ── Touch on info drawer: swipe up at bottom → next item,
    // swipe down at top → previous item (or exit, on the first item) ────────
    this._infoEl.addEventListener('touchstart', e => {
      this._touchY0 = e.touches[0].clientY
    }, { passive: true })

    this._infoEl.addEventListener('touchend', e => {
      const dy = this._touchY0 - e.changedTouches[0].clientY   // +ve = swipe up
      if (this._atBottom && dy > 25) this._onNext?.()
      else if (this._atTop && dy < -25) this._onPrev?.()
    }, { passive: true })
  }

  // ── Gallery rendering ───────────────────────────────────────────────────────

  _renderGallery(item) {
    this._galEl.innerHTML = ''
    const imgs = [...(item.images ?? [])]
    while (imgs.length < 10) imgs.push(null)

    imgs.forEach((url, i) => {
      const thumb = document.createElement('div')
      thumb.className = url ? 'mob-thumb has-photo' : 'mob-thumb'

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

      // Tap → open lightbox (same element HUD uses on desktop)
      // No hover state on touch — reuse the hover/ sound folder as the tap cue instead.
      thumb.addEventListener('click', () => {
        sounds.play('hover')
        this._openLightbox(url)
      })

      this._galEl.appendChild(thumb)
    })

    // Fresh tracking list for the tick sound — prevSide starts null so the
    // very first scroll check after a render only records position, same
    // spirit as HUD.js's prevT reset on _setItem().
    this._tickThumbs = [...this._galEl.querySelectorAll('.mob-thumb')].map(el => ({ el, prevSide: null }))
  }

  // Fires gallery-tick once each time a thumb's center crosses the strip's
  // horizontal midpoint, in either scroll direction.
  _checkGalleryTicks() {
    if (!this._tickThumbs?.length) return
    const mid = window.innerWidth / 2
    for (const t of this._tickThumbs) {
      const rect = t.el.getBoundingClientRect()
      const side = (rect.left + rect.width / 2) < mid ? -1 : 1
      if (t.prevSide !== null && side !== t.prevSide) sounds.play('gallery-tick')
      t.prevSide = side
    }
  }

  // ── Lightbox (shared with HUD — reuses #hud-lightbox) ───────────────────────

  _lbEl() {
    return document.getElementById('hud-lightbox')
  }

  _openLightbox(url) {
    const lb    = this._lbEl()
    if (!lb) return
    sounds.play('lightbox-open')
    const frame = lb.querySelector('.lb-frame')
    const img   = lb.querySelector('.lb-img')
    const noSig = lb.querySelector('.lb-nosignal')

    if (url) {
      img.src             = url
      img.style.display   = 'block'
      noSig.style.display = 'none'
    } else {
      img.style.display   = 'none'
      noSig.style.display = 'flex'
    }

    lb.style.display = 'flex'
    gsap.fromTo(lb.querySelector('.lb-backdrop'),
      { opacity: 0 },
      { opacity: 1, duration: 0.3, ease: 'power2.out' })
    gsap.fromTo(frame,
      { opacity: 0, scale: 0.88, y: 18 },
      { opacity: 1, scale: 1,    y: 0,  duration: 0.4, ease: 'power3.out' })
  }

  _closeLightbox() {
    const lb = this._lbEl()
    if (!lb || lb.style.display === 'none') return
    sounds.play('lightbox-close')
    const frame = lb.querySelector('.lb-frame')
    gsap.to(frame, { opacity: 0, scale: 0.9, duration: 0.2, ease: 'power2.in' })
    gsap.to(lb.querySelector('.lb-backdrop'), {
      opacity: 0, duration: 0.28, ease: 'power2.in',
      onComplete: () => {
        lb.style.display = 'none'
        gsap.set(frame, { opacity: 1, scale: 1, y: 0 })
      }
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

    const sizeHTML = item.sizes?.length ? `
      <div class="mob-size-header">SELECT GAUGE</div>
      <div class="mob-size-options">
        ${item.sizes.map(s =>
          `<button class="size-chip" data-label="${s.label}" data-price="${s.price}">${s.label}</button>`
        ).join('')}
      </div>
    ` : ''

    this._specsEl.innerHTML = `
      <div class="mob-specs-header">${header}</div>
      <div class="mob-specs-list">${specsHTML}</div>
      ${sizeHTML}
      ${cartHTML}
    `

    // Gauge/size picker — mirrors HUD.js: must pick a size before the cart
    // button unlocks, and every render starts deselected.
    const cartBtn = this._specsEl.querySelector('.mob-cart-btn')
    if (item.sizes?.length && cartBtn) {
      cartBtn.disabled = true
      this._specsEl.querySelectorAll('.size-chip').forEach(btn => {
        btn.addEventListener('click', () => {
          this._specsEl.querySelectorAll('.size-chip').forEach(b => b.classList.remove('selected'))
          btn.classList.add('selected')
          cartBtn.disabled = false
          document.dispatchEvent(new CustomEvent('size-select', {
            detail: { label: btn.dataset.label, price: Number(btn.dataset.price) }
          }))
        })
      })
    }

    // Wire cart button
    cartBtn?.addEventListener('click', () => document.getElementById('addToCart')?.click())

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
