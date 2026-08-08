import * as THREE          from 'three'
import { gsap }            from 'gsap'
import { LandingScene }    from './landing/LandingScene.js'
import { Renderer }        from './scene/Renderer.js'
import { ShopScene }       from './scene/ShopScene.js'
import { HUD }             from './scene/HUD.js'
import { MobileShop }      from './scene/MobileShop.js'
import './style.css'

// True only when the device is a phone in portrait orientation.
// Landscape phones get the full desktop HUD layout.
function isMobile() {
  return window.innerWidth <= window.innerHeight   // portrait
      && window.innerWidth <= 768
}

// ════════════════════════════════════════════════════════════════════════════
//  PHOTOS — auto-loaded from src/assets/photos/<piece-name>/
//  Drop image files into a folder named after the piece (see ADDING_JEWELRY.md).
//  Folder names are matched to CATALOG item names loosely (case/spacing/
//  punctuation-insensitive), so "Crescent Gradient" and "crescent-gradient"
//  both match the CRESCENT GRADIENT item. Each filename must start with the
//  gallery slot number it belongs in — "1.jpg" fills VIEW·01, "2.jpg" fills
//  VIEW·02, etc. A missing number leaves that slot on NO SIGNAL.
// ════════════════════════════════════════════════════════════════════════════
const slugify = (s) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')

const photoModules = import.meta.glob(
  './assets/photos/*/*.{jpg,jpeg,png,webp,avif,JPG,JPEG,PNG,WEBP,AVIF}',
  { eager: true, import: 'default' }
)
const slotsBySlug = {}
for (const path in photoModules) {
  const match = path.match(/\/photos\/([^/]+)\/([^/]+)$/)
  if (!match) continue
  const [, folder, filename] = match
  const slot = parseInt(filename, 10)   // leading number in the filename → slot #
  if (!Number.isFinite(slot) || slot < 1) continue
  ;(slotsBySlug[slugify(folder)] ??= {})[slot] = photoModules[path]
}
const photosFor = (name) => {
  const slots = slotsBySlug[slugify(name)]
  if (!slots) return []
  const maxSlot = Math.max(...Object.keys(slots).map(Number))
  return Array.from({ length: maxSlot }, (_, i) => slots[i + 1] ?? null)
}

// ════════════════════════════════════════════════════════════════════════════
//  CATALOG — add your jewelry pieces here.
//  • modelUrl: null → uses proxy shape while you work without GLB files.
//  • Drop a .glb file in /public/models/ and set modelUrl: '/models/file.glb'
//  • images: auto-populated below from src/assets/photos/ — no need to edit.
// ════════════════════════════════════════════════════════════════════════════
// Gauged piercing sizes shared by both crescent pieces — 0G and 00G cost more.
const GAUGE_SIZES = [
  { label: '6G',  price: 80 },
  { label: '4G',  price: 80 },
  { label: '2G',  price: 80 },
  { label: '1G',  price: 80 },
  { label: '0G',  price: 90 },
  { label: '00G', price: 90 },
]

const CATALOG = [
  {
    name: 'CRESCENT GRADIENT', collection: 'INVSBL', price: 80,
    modelUrl: '/models/Low Poly GLB/Crescent Low Poly.glb',
    images: [],
    sizes: GAUGE_SIZES,
    specs: [
      'MATERIAL — 316L STAINLESS STEEL',
      'FINISH — POLISHED & SANDBLASTED',
      'FORM — OPEN CRESCENT',
      'DIMENSIONS — 25.4 × 6.2 MM',
      'WEIGHT — 4.2 G',
    ]
  },
  {
    name: 'HALF CRESCENT GRADIENT', collection: 'INVSBL', price: 80,
    modelUrl: '/models/Low Poly GLB/Crescent Half-Gradient Low Poly.glb',
    images: [],
    sizes: GAUGE_SIZES,
    specs: [
      'MATERIAL — 316L STAINLESS STEEL',
      'FINISH — POLISHED & SANDBLASTED',
      'FORM — HALF CRESCENT',
      'DIMENSIONS — 25.4 × 6.2 MM',
      'WEIGHT — 3.6 G',
    ]
  },
  {
    name: 'CLOUD BENGAL', collection: 'INVSBL', price: 50,
    modelUrl: '/models/Low Poly GLB/Cloud Bengal Low Poly.glb',
    images: [],
    hidden: true,   // not deleted — just excluded from the live shop/TOC for now
    specs: [
      'MATERIAL — WHITE OSBY',
      'FINISH — TUMBLE POLISH',
      'FORM — CLOUD SILHOUETTE',
      'DIMENSIONS — 17.5 × 2.75 MM',
      'WEIGHT — 5.8 G',
    ]
  },
  {
    name: 'EPSILON', collection: 'INVSBL', price: 77,
    modelUrl: '/models/Low Poly GLB/Epsilon Low Poly.glb',
    images: [],
    specs: [
      'MATERIAL — 925 STERLING SILVER',
      'FINISH — HIGH POLISH',
      'FORM — EPSILON',
      'DIMENSIONS — 27 × 4.35 MM',
      'WEIGHT — 3.9 G',
    ]
  },
  {
    name: 'EPSILON RING', collection: 'INVSBL', price: 270,
    modelUrl: '/models/Low Poly GLB/Epsilon Ring Low Poly.glb',
    images: [],
    specs: [
      'MATERIAL — 925 STERLING SILVER',
      'FINISH — HIGH POLISH',
      'FORM — RING',
    ]
  },
  {
    name: 'HYPERCUBE', collection: 'INVSBL', price: 285,
    modelUrl: '/models/Low Poly GLB/Hypercube LowPoly.glb',
    images: [],
    specs: [
      'MATERIAL — 925 STERLING SILVER',
      'FINISH — HIGH POLISH',
      'FORM — AKASHIC PROJECTION',
      'DIMENSIONS — 17.7 × 31 × 29 MM',
      'WEIGHT — 6.1 G',
    ]
  },
  {
    name: 'GINSENG RITUAL', collection: 'INVSBL', price: 600,
    modelUrl: '/models/Low Poly GLB/Ginseng Ritual Low Poly.glb',
    images: [],
    specs: [
      'MATERIAL — 925 STERLING, GLASS, ORGANIC',
      'FINISH — HIGH POLISH',
      'FORM — RITUALIZED ELIXIR',
      'DIMENSIONS — 52.3 × 20 × 22 MM',
      'WEIGHT — 9 G',
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
      '03 — EPSILON',
      '04 — EPSILON RING',
      '05 — HYPERCUBE',
      '06 — GINSENG RITUAL',
    ]
  }
]

// Populate real photos from src/assets/photos/<piece-name>/ (skips TOC entries)
CATALOG.forEach(item => { if (!item.toc) item.images = photosFor(item.name) })

// Items with hidden:true stay in CATALOG (data intact, easy to bring back)
// but are excluded from the live shop — this is what actually drives
// navigation/rendering everywhere below.
const VISIBLE_CATALOG = CATALOG.filter(item => !item.hidden)

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

// Gauge/size picker (HUD or MobileShop) fires 'size-select' when a size chip
// is clicked. Reset whenever the shop item changes (see 'change' listener below).
let selectedSize = null   // { label, price } | null
document.addEventListener('size-select', e => {
  selectedSize = e.detail
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
  totalItems.textContent = String(VISIBLE_CATALOG.length).padStart(2, '0')
  itemDots.innerHTML = ''
  VISIBLE_CATALOG.forEach((_, i) => {
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
      _updateCameraZoom()   // apply landscape zoom on first load if already horizontal
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
    shop = new ShopScene(ren.renderer, ren.scene, ren.camera, VISIBLE_CATALOG, interactionTarget)
    shop.loadAll((loaded) => {
      currentIdx.textContent = String(loaded).padStart(2, '0')
    }).then(() => {
      shop.enableScrollNavigation(shopEl)
      updateHUD()
      shop.addEventListener('exit', () => exitShop())
      shop.addEventListener('change', () => {
        selectedSize = null   // require re-picking a size on every new item
        updateHUD()
        // Both guards internally — only the active one actually runs
        hud.update(shop.currentItem, shop.current)
        mobileShop.update(shop.currentItem, shop.current)
        if (!isMobile()) {
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
            if (isMobile()) {
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

  isMobile() ? mobileShop.hide() : hud.hide()

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
  itemPrice.textContent  = item.price ? '$' + Number(item.price).toFixed(2) : ''
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
let _ty0 = 0, _tx0 = 0, _touchOnGallery = false
window.addEventListener('touchstart', (e) => {
  _ty0 = e.touches[0].clientY
  _tx0 = e.touches[0].clientX
  // Track if touch starts on a gallery panel so we don't also trigger item nav
  _touchOnGallery = !!e.target.closest?.('.hud-gpanel')
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
  // Skip if the touch started on a gallery panel — that gesture belongs to the gallery.
  if (!isMobile() && page === 'shop' && !_touchOnGallery) {
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
  if (hud.isLightboxOpen()) return   // let the lightbox own arrow keys while open
  if (e.key === 'ArrowRight' || e.key === 'ArrowDown') shop.next()
  if (e.key === 'ArrowLeft'  || e.key === 'ArrowUp') {
    if (shop.current === 0) exitShop()
    else shop.prev()
  }
})

navBack.addEventListener('click', exitShop)

// ── Orientation change — swap between mobile and desktop layouts ──────────────
function _isLandscapePhone() {
  return window.innerHeight < 500
      && window.innerWidth  > window.innerHeight
      && ('ontouchstart' in window || navigator.maxTouchPoints > 0)
}

const CAMERA_Z_DEFAULT  = 4.5
const CAMERA_Z_LANDSCAPE = CAMERA_Z_DEFAULT / (1.2 * 1.33)   // +20% then +33% larger

function _updateCameraZoom() {
  if (!ren) return
  ren.camera.position.z = _isLandscapePhone() ? CAMERA_Z_LANDSCAPE : CAMERA_Z_DEFAULT
}

function _onOrientationChange() {
  _updateCameraZoom()
  if (page !== 'shop' || !shop) return
  if (isMobile()) {
    hud.hide()
    mobileShop.show(shop.currentItem, shop.current, {
      onNext: () => shop?.next(),
      onPrev: () => { if (shop?.current === 0) exitShop(); else shop?.prev() },
    })
  } else {
    mobileShop.hide()
    hud.show(shop.currentItem, shop.current)
  }
}
window.addEventListener('resize', _onOrientationChange)
window.addEventListener('orientationchange', () => {
  // Delay so innerWidth/innerHeight reflect the new orientation on iOS
  setTimeout(_onOrientationChange, 150)
})

// ════════════════════════════════════════════════════════════════════════════
//  CART
// ════════════════════════════════════════════════════════════════════════════
let cartItems = []   // [{ name, collection, price, qty, size }, …] — size is a gauge label or null
let cartOpen  = false

// Sized items (e.g. gauged piercings) need their own cart line per size,
// so identity is name+size rather than just name.
function _cartKey(entry) {
  return entry.size ? `${entry.name}__${entry.size}` : entry.name
}

// ── State helpers ─────────────────────────────────────────────────────────
// `size` is the selected { label, price } from item.sizes, or null for
// items that don't need sizing.
function _cartAdd(item, size) {
  const entry = {
    name: item.name,
    collection: item.collection,
    price: size ? size.price : item.price,
    size:  size ? size.label : null,
  }
  const key      = _cartKey(entry)
  const existing = cartItems.find(c => _cartKey(c) === key)
  if (existing) { existing.qty++ }
  else          { cartItems.push({ ...entry, qty: 1 }) }
}

function _cartRemove(key) {
  cartItems = cartItems.filter(c => _cartKey(c) !== key)
}

function _cartUpdateQty(key, delta) {
  const entry = cartItems.find(c => _cartKey(c) === key)
  if (!entry) return
  entry.qty += delta
  if (entry.qty <= 0) _cartRemove(key)
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
        <p class="cart-item-collection">${entry.collection}${entry.size ? ' · GAUGE ' + entry.size : ''}</p>
        ${entry.price ? `<p class="cart-item-price">$${Number(entry.price).toFixed(2)}</p>` : ''}
      </div>
      <div class="cart-item-controls">
        <button class="qty-btn" data-action="dec" data-key="${_cartKey(entry)}">−</button>
        <span class="qty-value">${entry.qty}</span>
        <button class="qty-btn" data-action="inc" data-key="${_cartKey(entry)}">+</button>
      </div>
      <button class="cart-item-remove" data-key="${_cartKey(entry)}" aria-label="Remove">✕</button>
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
      _cartUpdateQty(btn.dataset.key, btn.dataset.action === 'inc' ? 1 : -1)
      renderCart()
      updateCartBadge()
    })
  })
  cartBodyEl.querySelectorAll('.cart-item-remove').forEach(btn => {
    btn.addEventListener('click', () => {
      _cartRemove(btn.dataset.key)
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
  const item = shop.currentItem
  if (item.sizes && !selectedSize) return   // UI should already block this — safety net
  _cartAdd(item, item.sizes ? selectedSize : null)
  renderCart()
  updateCartBadge()
  openCart()
})

cartToggleBtn.addEventListener('click', () => cartOpen ? closeCart() : openCart())
cartCloseBtn.addEventListener('click', closeCart)

cartCheckout.addEventListener('click', async () => {
  if (cartItems.length === 0 || cartCheckout.disabled) return

  const originalText = cartCheckout.textContent
  cartCheckout.disabled    = true
  cartCheckout.textContent = 'REDIRECTING…'

  try {
    const res = await fetch('/api/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: cartItems.map(c => ({ name: c.name, qty: c.qty, size: c.size })),
      }),
    })
    const data = await res.json()
    if (!res.ok || !data.url) throw new Error(data.error || 'Checkout failed')
    window.location.href = data.url
  } catch (err) {
    console.error('[INVSBL WRLD] Checkout error:', err)
    cartCheckout.disabled    = false
    cartCheckout.textContent = originalText
    alert('Sorry — checkout could not be started. Please try again.')
  }
})
