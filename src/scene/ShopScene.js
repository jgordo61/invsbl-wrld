import * as THREE from 'three'
import { gsap } from 'gsap'
import { JewelryViewer } from '../components/JewelryViewer.js'

export class ShopScene extends THREE.EventDispatcher {
  constructor(renderer, scene, camera, catalog, domElement) {
    super()
    this.renderer   = renderer
    this.scene      = scene
    this.camera     = camera
    this.catalog    = catalog
    this.domElement = domElement

    this.items       = []
    this.current     = 0
    this.isAnimating = false

    this._scrollAccum  = 0
    this._scrollTimer  = null
    this._scrollLocked = false   // cooldown flag — one item per gesture
    this._onScroll     = this._onScroll.bind(this)

    // Mouse → world projection (onto the z=0 plane where models sit)
    this._raycaster   = new THREE.Raycaster()
    this._mousePlane  = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0)
    this._mouseWorld  = new THREE.Vector3(9999, 9999, 9999)
    this._lastMouseX  = null   // cache — skip raycaster when mouse hasn't moved
    this._lastMouseY  = null
  }

  async loadAll(onProgress) {
    for (let i = 0; i < this.catalog.length; i++) {
      const viewer = new JewelryViewer(this.catalog[i], this.scene)
      await viewer.load()
      this.items.push(viewer)
      onProgress?.(i + 1, this.catalog.length)
    }
    // Don't call show() here — main.js coordinates the reveal so the fade-in
    // starts only once the shop slide-in animation is actually complete.
    this.items[0].enableInteraction(this.domElement)
    return this
  }

  // Called by main.js when the shop entrance animation finishes.
  // Safe to call multiple times — JewelryViewer.show() is idempotent.
  revealCurrent() {
    this.items[this.current]?.show(0)
  }

  // ── Navigation ────────────────────────────────────────────────────────────
  goTo(index) {
    if (this.isAnimating) return
    if (index === this.current) return
    if (index < 0 || index >= this.items.length) return

    this.isAnimating = true
    const from = this.items[this.current]
    const to   = this.items[index]

    from.disableInteraction()
    from.hide(() => {
      from.group.rotation.set(0, 0, 0)
    })

    setTimeout(() => {
      to.show()
      to.enableInteraction(this.domElement)
      this.isAnimating = false
    }, 400)

    this.current = index
    this.dispatchEvent({ type: 'change', index })
  }

  next() { this.goTo(this.current + 1) }
  prev() { this.goTo(this.current - 1) }

  enableScrollNavigation(element) {
    element.addEventListener('wheel', this._onScroll, { passive: true })
  }

  disableScrollNavigation(element) {
    element.removeEventListener('wheel', this._onScroll)
  }

  _onScroll(e) {
    if (this._scrollLocked) return

    this._scrollAccum += e.deltaY + e.deltaX
    clearTimeout(this._scrollTimer)
    this._scrollTimer = setTimeout(() => { this._scrollAccum = 0 }, 300)

    if (Math.abs(this._scrollAccum) > 80) {
      this._scrollLocked = true
      this._scrollAccum  = 0

      if (e.deltaY + e.deltaX > 0) {
        this.next()
      } else {
        // Scrolling up on the first item → signal caller to return to landing
        if (this.current === 0) {
          this.dispatchEvent({ type: 'exit' })
        } else {
          this.prev()
        }
      }

      // Release lock after transition animation completes
      setTimeout(() => { this._scrollLocked = false }, 800)
    }
  }

  // mouseNDC: THREE.Vector2 in [-1,1] range, updated from main.js mousemove
  update(mouseNDC) {
    // Only reproject when the mouse has actually moved — saves a raycaster
    // setFromCamera + plane intersect call every frame when the cursor is still
    if (mouseNDC &&
        (mouseNDC.x !== this._lastMouseX || mouseNDC.y !== this._lastMouseY)) {
      this._raycaster.setFromCamera(mouseNDC, this.camera)
      this._raycaster.ray.intersectPlane(this._mousePlane, this._mouseWorld)
      this._lastMouseX = mouseNDC.x
      this._lastMouseY = mouseNDC.y
    }
    for (const item of this.items) item.update(this._mouseWorld)
  }

  get currentItem() { return this.catalog[this.current] }

  dispose() {
    for (const item of this.items) item.dispose()
  }
}
