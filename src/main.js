import * as THREE          from 'three'
import { gsap }            from 'gsap'
import { LandingScene }    from './landing/LandingScene.js'
import { Renderer }        from './scene/Renderer.js'
import { ShopScene }       from './scene/ShopScene.js'
import { HUD }             from './scene/HUD.js'
import { MobileShop }      from './scene/MobileShop.js'
import './style.css'

// True on phones / narrow tablets — evaluated once at load
const IS_MOBILE = window.innerWidth <= 768

// ════════════════════════════════════════════════════════════════════════════
//  CATALOG — add your jewelry pieces here.
//  • modelUrl: null → uses proxy shape while you work without GLB files.
//  • Drop a .glb file in /public/models/ and set modelUrl: '/models/file.glb'
// ════════════════════════════════════════════════════════════════════════════
// ── images: drop real photo paths here when ready.
//    Each array has three slots — one per HUD panel (top, mid, bottom).
//    Set a slot to null to show the NO SIGNAL placeholder.
const CATALOG = [
  {
    name: 'CRESCENT GRADIENT', collection: 'INVSBL', price: '',
    modelUrl: '/models/Low Poly GLB/Crescent Low Poly.glb',
    images: [null, null, null, null, null, null, null, null, null, null],
    specs: [
      'MATERIAL — 925 STERLING SILVER',
      'FINISH — GRADIENT OXIDISATION',
      'FORM — OPEN CRESCENT',
      'DIMENSIONS — 32 × 18 MM',
      'WEIGHT — 4.2 G',
      'COLLECTION — INVSBL',
    ]
  },
  {
    name: 'HALF CRESCENT GRADIENT', collection: 'INVSBL', price: '',
    modelUrl: '/models/Low Poly GLB/Crescent Half-Gradient Low Poly.glb',
    images: [null, null, null, null, null, null, null, null, null, null],
    specs: [
      'MATERIAL — 925 STERLING SILVER',
      'FINISH — HALF GRADIENT OXIDISATION',
      'FORM — HALF CRESCENT',
      'DIMENSIONS — 28 × 14 MM',
      'WEIGHT — 3.6 G',
      'COLLECTION — INVSBL',
    ]
  },
  {
    name: 'CLOUD BENGAL', collection: 'INVSBL', price: '',
    modelUrl: '/models/Low Poly GLB/Cloud Bengal Low Poly.glb',
    images: [null, null, null, null, null, null, null, null, null, null],
    specs: [
      'MATERIAL — 925 STERLING SILVER',
      'FINISH — BRUSHED MATTE',
      'FORM — CLOUD SILHOUETTE',
      'DIMENSIONS — 38 × 22 MM',
      'WEIGHT — 5.8 G',
      'COLLECTION — INVSBL',
    ]
  },
  {
    name: 'HYPERCUBE', collection: 'INVSBL', price: '',
    modelUrl: '/models/Low Poly GLB/Hypercube LowPoly.glb',
    images: [null, null, null, null, null, null, null, null, null, null],
    specs: [
      'MATERIAL — 925 STERLING SILVER',
      'FINISH — HIGH POLISH',
      'FORM — TESSERACT PROJECTION',
      'DIMENSIONS — 24 × 24 MM',
      'WEIGHT — 6.1 G',
      'COLLECTION — INVSBL',
    ]
  },
  {
    name: 'EPSILON', collection: 'INVSBL', price: '',
    modelUrl: '/models/Low Poly GLB/Epsilon Low Poly.glb',
    images: [null, null, null, null, null, null, null, null, null, null],
    specs: [
      'MATERIAL — 925 STERLING SILVER',
      'FINISH — SATIN',
      'FORM — EPSILON SYMBOL',
      'DIMENSIONS — 20 × 30 MM',
      'WEIGHT — 3.9 G',
      'COLLECTION — INVSBL',
    ]
  },
  {
    name: 'ARCHIVE INDEX', collection: 'INVSBL WRLD', price: '',
    modelUrl: null,
    images: [null, null, null, null, null, null, null, null, null, null],
    toc: true,
    specsHeader: 'ALL WORKS',
    nameFooter: '[ ARCHIVE ]',
    specs: [
      '01 — CRESCENT GRADIENT',
      '02 — HALF CRESCENT GRADIENT',
      '03 — CLOUD BENGAL',
      '04 — HYPERCUBE',
      '05 — EPSILON',
    ]
  }
]

// ════════════════════════════════════════════════════════════════════════════
//  DOM
// ════════════════════════════════════════════════════════════════════════════
const landingEl  = document.getElementById('landing')
const shopEl     = document.getElementById('shop')
const webglEl    = document.getElementById('webgl')
const scrollCue  = document.getElementById('scrollCue')
const navBack    = document.getElementById('navBack')
const itemDots   = document.getElementById('itemDots')
const currentIdx = document.getElementById('currentIndex')
const totalItems = document.getElementById('totalItems')
const itemName   = document.getElementById('itemName')
const itemPrice  = document.getElementById('itemPrice')
const itemColl   = document.getElementById('itemCollection')

// Cart DOM
const addToCartBtn  = document.getElementById('addToCart')
const cartToggleBtn = document.getElementById('cartToggle')
const cartCountEl   = document.getElementById('cartCount')
const cartPanelEl   = document.getElementById('cartPanel')
const cartCloseBtn  = document.getElementById('cartClose')
const cartBodyEl    = document.getElementById('cartBody')
const cartSubtotal  = document.getElementById('cartSubtotal')
const cartCheckout  = document.getElementById('cartCheckout')

// ════════════════════════════════════════════════════════════════════════════
//  STATE
// ════════════════════════════════════════════════════════════════════════════
let page            = 'landing'
let isTransitioning = false   // prevents double-trigger
let shop            = null
let ren             = null    // WebGL renderer, created lazily
let _renderRafId    = null    // tracks the active render-loop RAF so we can cancel it
const hud           = new HUD()
const mobileShop    = new MobileShop()

// TOC item — clicking a spec line fires 'toc-goto'; navigate to that item
document.addEventListener('toc-goto', e => {
  if (shop) shop.goTo(e.detail.index)
})

// ── LandingScene — 3D letter renderer ────────────────────────────────────────
const landingGL = document.getElementById('landing-gl')
const landingScene = new LandingScene(landingGL)
landingScene.load().then(() => {
  landingScene.revealAll(() => {
    scrollCue.style.opacity = ''   // remove inline override so CSS class can work
    requestAnimationFrame(() => scrollCue.classList.add('visible'))
  })
})

// Normalised device coordinates of the mouse — kept at far-away default
// so particles aren't disturbed before the pointer enters the viewport
const _mouseNDC = new THREE.Vector2(9999, 9999)
window.addEventListener('mousemove', e => {
  _mouseNDC.x =  (e.clientX / window.innerWidth)  * 2 - 1
  _mouseNDC.y = -(e.clientY / window.innerHeight) * 2 + 1
})

// (scrambler removed — 3D letters reveal directly after load)

// ════════════════════════════════════════════════════════════════════════════
//  LANDING → SHOP
// ════════════════════════════════════════════════════════════════════════════
async function enterShop() {
  if (isTransitioning || page === 'shop') return
  isTransitioning = true
  page = 'shop'

  scrollCue.classList.remove('visible')

  // Build nav dots
  totalItems.textContent = String(CATALOG.length).padStart(2, '0')
  itemDots.innerHTML = ''
  CATALOG.forEach((_, i) => {
    const dot = document.createElement('button')
    dot.className = 'dot'
    dot.setAttribute('aria-label', `Item ${i + 1}`)
    dot.addEventListener('click', () => shop?.goTo(i))
    itemDots.appendChild(dot)
  })

  // ── Start loading WebGL & models immediately (runs while letters exit) ────
  // Two events must both happen before we reveal the 3D object:
  //   A) models finish loading   B) shop slide-in animation completes
  // Whichever arrives second calls revealCurrent() so the fade-in is always
  // visible to the user rather than happening off-screen during the transition.
  let _modelsReady    = false
  let _shopAnimDone   = false
  const _maybeReveal  = () => {
    if (_modelsReady && _shopAnimDone) shop?.revealCurrent()
  }

  try {
    // Always restore canvas visibility (it was hidden by exitShop)
    webglEl.style.display = 'block'

    if (!ren) {
      ren = new Renderer(webglEl)
    }

    // Only start a new render loop if one isn't already running
    if (!_renderRafId) {
      const tick = () => {
        if (shop) shop.update(_mouseNDC)
        ren.render()
        _renderRafId = requestAnimationFrame(tick)
      }
      _renderRafId = requestAnimationFrame(tick)
    }
    const interactionTarget = document.querySelector('.shop-canvas-container')
    shop = new ShopScene(ren.renderer, ren.scene, ren.camera, CATALOG, interactionTarget)
    shop.loadAll((loaded) => {
      currentIdx.textContent = String(loaded).padStart(2, '0')
    }).then(() => {
      shop.enableScrollNavigation(shopEl)
      updateHUD()
      shop.addEventListener('exit', () => exitShop())
      shop.addEventListener('change', () => {
        updateHUD()
        // Both guards internally — only the active one actually runs
        hud.update(shop.currentItem, shop.current)
        mobileShop.update(shop.currentItem, shop.current)
        if (!IS_MOBILE) {
          gsap.fromTo([itemColl, itemName, itemPrice],
            { opacity: 0, y: 12 },
            { opacity: 1, y: 0, duration: 0.5, stagger: 0.09, ease: 'power2.out' }
          )
        }
      })
      _modelsReady = true
      _maybeReveal()
    }).catch(err => {
      console.error('[INVSBL WRLD] Shop load error:', err)
    })
  } catch (err) {
    console.error('[INVSBL WRLD] Shop load error:', err)
  }

  // ── Landing fades out fully, then shop slides in ─────────────────────────
  shopEl.style.display = 'flex'
  gsap.set(shopEl, { y: 40, opacity: 0 })

  // Letters start exiting immediately
  landingScene.exitLetters(() => {
    landingGL.style.display = 'none'
  })

  // Landing fades out — shop entrance is chained inside onComplete
  gsap.to(landingEl, {
    opacity: 0,
    duration: 0.9, ease: 'power2.inOut',
    delay: 0.2,
    onComplete: () => {
      landingEl.style.display = 'none'
      gsap.set(landingEl, { opacity: 1 })  // reset for re-entry

      // Shop slides up only after landing is fully gone
      gsap.to(shopEl, {
        y: 0, opacity: 1,
        duration: 0.75, ease: 'power3.out',
        onComplete: () => {
          isTransitioning = false
          updateHUD()
          gsap.fromTo([itemColl, itemName, itemPrice],
            { opacity: 0, y: 20 },
            { opacity: 1, y: 0, duration: 0.7, stagger: 0.1, ease: 'power3.out' }
          )
          // Boot the appropriate HUD for this viewport
          if (shop) {
            if (IS_MOBILE) {
              mobileShop.show(shop.currentItem, shop.current, {
                onNext: () => shop?.next(),
                onPrev: () => { if (shop?.current === 0) exitShop(); else shop?.prev() },
              })
            } else {
              hud.show(shop.currentItem, shop.current)
            }
          }
          // Signal that the shop is visible — triggers 3D object fade-in
          // (if models are already loaded) or arms the flag for when they do load
          _shopAnimDone = true
          _maybeReveal()
        }
      })
    }
  })
}

// ════════════════════════════════════════════════════════════════════════════
//  SHOP → LANDING
// ════════════════════════════════════════════════════════════════════════════
function exitShop() {
  if (isTransitioning || page === 'landing') return
  isTransitioning = true
  page = 'landing'

  IS_MOBILE ? mobileShop.hide() : hud.hide()

  // Prepare landing above viewport, hidden letters
  landingGL.style.display = 'block'
  landingScene.resetLetters()
  landingEl.style.display = 'flex'
  gsap.set(landingEl, { y: '-100%', opacity: 1 })

  // Shop drifts down and fades out
  gsap.to(shopEl, {
    y: 40, opacity: 0,
    duration: 0.9, ease: 'power3.inOut',
    onComplete: () => {
      // Stop the render loop before disposing — prevents stale RAF accumulation
      if (_renderRafId) { cancelAnimationFrame(_renderRafId); _renderRafId = null }
      shop?.dispose()
      shop = null
      shopEl.style.display   = 'none'
      webglEl.style.display  = 'none'
      gsap.set(shopEl, { y: 0, opacity: 1 })
    }
  })

  // Landing slides down into view, then letters enter
  gsap.to(landingEl, {
    y: 0, opacity: 1,
    duration: 0.9, ease: 'power3.inOut',
    onComplete: () => {
      isTransitioning = false
      landingScene.enterLetters(() => {
        scrollCue.style.opacity = ''
        requestAnimationFrame(() => scrollCue.classList.add('visible'))
      })
    }
  })
}

// ════════════════════════════════════════════════════════════════════════════
//  HUD
// ════════════════════════════════════════════════════════════════════════════
function updateHUD() {
  if (!shop) return
  const idx  = shop.current
  const item = shop.currentItem
  currentIdx.textContent = String(idx + 1).padStart(2, '0')
  itemName.textContent   = item.name
  itemPrice.textContent  = item.price
  itemColl.textContent   = item.collection
  itemDots.querySelectorAll('.dot').forEach((d, i) =>
    d.classList.toggle('active', i === idx)
  )
}

// ════════════════════════════════════════════════════════════════════════════
//  INPUT — landing triggers
//  Using { passive: false } so we can preventDefault and guarantee the
//  wheel event isn't swallowed by any ancestor scroll container.
// ════════════════════════════════════════════════════════════════════════════

// Click anywhere on landing
landingEl.addEventListener('click', () => {
  if (page === 'landing') enterShop()
})

// Scroll / wheel down on landing
landingEl.addEventListener('wheel', (e) => {
  e.preventDefault()
  if (page === 'landing' && e.deltaY > 0) enterShop()
}, { passive: false })

// Touch swipe navigation
let _ty0 = 0, _tx0 = 0
window.addEventListener('touchstart', (e) => {
  _ty0 = e.touches[0].clientY
  _tx0 = e.touches[0].clientX
}, { passive: true })

window.addEventListener('touchend', (e) => {
  const dy = _ty0 - e.changedTouches[0].clientY   // positive = swipe up
  const dx = _tx0 - e.changedTouches[0].clientX   // positive = swipe left

  // Ignore swipes that are more horizontal than vertical
  if (Math.abs(dy) < Math.abs(dx) * 0.8) return

  if (page === 'landing') {
    if (dy > 40) enterShop()
    return
  }

  // Desktop-only within-shop swipe navigation.
  // On mobile, MobileShop's info-drawer touchend handles item navigation.
  if (!IS_MOBILE && page === 'shop') {
    if (dy > 60) {
      shop?.next()
    } else if (dy < -60) {
      if (shop?.current === 0) exitShop()
      else shop?.prev()
    }
  }
}, { passive: true })

// Keyboard
window.addEventListener('keydown', (e) => {
  if (page === 'landing') {
    if (['Enter', ' ', 'ArrowDown'].includes(e.key)) { e.preventDefault(); enterShop() }
    return
  }
  if (!shop) return
  if (e.key === 'ArrowRight' || e.key === 'ArrowDown') shop.next()
  if (e.key === 'ArrowLeft'  || e.key === 'ArrowUp') {
    if (shop.current === 0) exitShop()
    else shop.prev()
  }
})

navBack.addEventListener('click', exitShop)

// ════════════════════════════════════════════════════════════════════════════
//  CART
// ════════════════════════════════════════════════════════════════════════════
let cartItems = []   // [{ name, collection, price, qty }, …]
let cartOpen  = false

// ── State helpers ─────────────────────────────────────────────────────────
function _cartAdd(item) {
  const existing = cartItems.find(c => c.name === item.name)
  if (existing) { existing.qty++ }
  else          { cartItems.push({ ...item, qty: 1 }) }
}

function _cartRemove(name) {
  cartItems = cartItems.filter(c => c.name !== name)
}

function _cartUpdateQty(name, delta) {
  const entry = cartItems.find(c => c.name === name)
  if (!entry) return
  entry.qty += delta
  if (entry.qty <= 0) _cartRemove(name)
}

// ── Render cart body ──────────────────────────────────────────────────────
function renderCart() {
  if (cartItems.length === 0) {
    cartBodyEl.innerHTML = '<p class="cart-empty">YOUR BAG IS EMPTY</p>'
    cartSubtotal.textContent = '—'
    return
  }

  cartBodyEl.innerHTML = cartItems.map(entry => `
    <div class="cart-item">
      <div class="cart-item-info">
        <p class="cart-item-name">${entry.name}</p>
        <p class="cart-item-collection">${entry.collection}</p>
        ${entry.price ? `<p class="cart-item-price">${entry.price}</p>` : ''}
      </div>
      <div class="cart-item-controls">
        <button class="qty-btn" data-action="dec" data-name="${entry.name}">−</button>
        <span class="qty-value">${entry.qty}</span>
        <button class="qty-btn" data-action="inc" data-name="${entry.name}">+</button>
      </div>
      <button class="cart-item-remove" data-name="${entry.name}" aria-label="Remove">✕</button>
    </div>
  `).join('')

  // Subtotal (only when prices are present)
  const hasPrice = cartItems.some(c => parseFloat(c.price) > 0)
  if (hasPrice) {
    const total = cartItems.reduce((sum, c) => sum + (parseFloat(c.price) || 0) * c.qty, 0)
    cartSubtotal.textContent = '$' + total.toFixed(2)
  } else {
    cartSubtotal.textContent = '—'
  }

  // Delegate qty / remove clicks
  cartBodyEl.querySelectorAll('.qty-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      _cartUpdateQty(btn.dataset.name, btn.dataset.action === 'inc' ? 1 : -1)
      renderCart()
      updateCartBadge()
    })
  })
  cartBodyEl.querySelectorAll('.cart-item-remove').forEach(btn => {
    btn.addEventListener('click', () => {
      _cartRemove(btn.dataset.name)
      renderCart()
      updateCartBadge()
    })
  })
}

// ── Badge ─────────────────────────────────────────────────────────────────
function updateCartBadge() {
  const total = cartItems.reduce((sum, c) => sum + c.qty, 0)
  cartCountEl.textContent = total
  cartToggleBtn.classList.toggle('has-items', total > 0)
}

// ── Open / close panel ────────────────────────────────────────────────────
function openCart() {
  if (cartOpen) return
  cartOpen = true
  cartPanelEl.style.display = 'flex'
  cartPanelEl.setAttribute('aria-hidden', 'false')
  gsap.fromTo(cartPanelEl,
    { x: '100%' },
    { x: 0, duration: 0.55, ease: 'power3.out' }
  )
}

function closeCart() {
  if (!cartOpen) return
  cartOpen = false
  cartPanelEl.setAttribute('aria-hidden', 'true')
  gsap.to(cartPanelEl, {
    x: '100%', duration: 0.45, ease: 'power3.in',
    onComplete: () => { cartPanelEl.style.display = 'none' }
  })
}

// ── Wire up cart controls ─────────────────────────────────────────────────
addToCartBtn.addEventListener('click', () => {
  if (!shop) return
  _cartAdd(shop.currentItem)
  renderCart()
  updateCartBadge()
  openCart()
})

cartToggleBtn.addEventListener('click', () => cartOpen ? closeCart() : openCart())
cartCloseBtn.addEventListener('click', closeCart)

cartCheckout.addEventListener('click', () => {
  // Future: hand off to payment provider
  console.log('[INVSBL WRLD] Checkout:', cartItems)
})
