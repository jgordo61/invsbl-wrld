import * as THREE       from 'three'
import { gsap }         from 'gsap'
import { LandingScene } from './landing/LandingScene.js'
import { Renderer }     from './scene/Renderer.js'
import { ShopScene }    from './scene/ShopScene.js'
import { HUD }          from './scene/HUD.js'
import './style.css'

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
    images: [null, null, null]
  },
  {
    name: 'HALF CRESCENT GRADIENT', collection: 'INVSBL', price: '',
    modelUrl: '/models/Low Poly GLB/Crescent Half-Gradient Low Poly.glb',
    images: [null, null, null]
  },
  {
    name: 'CLOUD BENGAL', collection: 'INVSBL', price: '',
    modelUrl: '/models/Low Poly GLB/Cloud Bengal Low Poly.glb',
    images: [null, null, null]
  },
  {
    name: 'HYPERCUBE', collection: 'INVSBL', price: '',
    modelUrl: '/models/Low Poly GLB/Hypercube LowPoly.glb',
    images: [null, null, null]
  },
  {
    name: 'EPSILON', collection: 'INVSBL', price: '',
    modelUrl: '/models/Low Poly GLB/Epsilon Low Poly.glb',
    images: [null, null, null]
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
const hud           = new HUD()

// ── LandingScene — 3D letter renderer ────────────────────────────────────────
const landingGL = document.getElementById('landing-gl')
const landingScene = new LandingScene(landingGL)
landingScene.load().then(() => {
  landingScene.revealAll(() => {
    scrollCue.classList.add('visible')
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
  try {
    if (!ren) {
      webglEl.style.display = 'block'
      ren = new Renderer(webglEl)
      const tick = () => {
        requestAnimationFrame(tick)
        if (shop) shop.update(_mouseNDC)
        ren.render()
      }
      tick()
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
        hud.update(shop.currentItem, shop.current)
        gsap.fromTo([itemColl, itemName, itemPrice],
          { opacity: 0, y: 12 },
          { opacity: 1, y: 0, duration: 0.5, stagger: 0.09, ease: 'power2.out' }
        )
      })
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
          // Boot the HUD panels after the shop has fully slid into view
          if (shop) hud.show(shop.currentItem, shop.current)
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

  hud.hide()

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
      shop?.dispose()
      shop = null
      shopEl.style.display  = 'none'
      webglEl.style.display = 'none'
      gsap.set(shopEl, { y: 0, opacity: 1 })
    }
  })

  // Landing slides down into view, then letters enter
  gsap.to(landingEl, {
    y: 0, opacity: 1,
    duration: 0.9, ease: 'power3.inOut',
    onComplete: () => {
      isTransitioning = false
      landingScene.enterLetters()
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

// Touch swipe-up on landing / swipe-down on shop
let _ty0 = 0
window.addEventListener('touchstart', (e) => { _ty0 = e.touches[0].clientY }, { passive: true })
window.addEventListener('touchend', (e) => {
  const dy = _ty0 - e.changedTouches[0].clientY
  if (page === 'landing' && dy > 40) enterShop()
  if (page === 'shop' && dy < -40 && shop?.current === 0) exitShop()
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
