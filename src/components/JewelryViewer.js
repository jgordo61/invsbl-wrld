import * as THREE from 'three'
import { GLTFLoader }      from 'three/examples/jsm/loaders/GLTFLoader.js'
import { DRACOLoader }     from 'three/examples/jsm/loaders/DRACOLoader.js'
import { gsap }            from 'gsap'
import { ParticleSystem }  from './ParticleSystem.js'

const dracoLoader = new DRACOLoader()
dracoLoader.setDecoderPath('/draco/')
dracoLoader.preload()   // fetch & compile WASM decoder immediately, before any GLB loads
const gltfLoader = new GLTFLoader()
gltfLoader.setDRACOLoader(dracoLoader)

const TARGET_SIZE = 1.8   // longest axis of every model normalised to this

export class JewelryViewer extends THREE.EventDispatcher {
  constructor(config, scene) {
    super()
    this.config = config
    this.scene  = scene

    // Outer group: carries rotation driven by drag / auto-spin
    this.group = new THREE.Group()
    // Inner pivot: carries the normalised mesh
    this._pivot = new THREE.Group()
    this.group.add(this._pivot)

    this._dragging  = false
    this._lastX     = 0
    this._velX      = 0
    this._dom       = null
    this._particles = null   // ParticleSystem, built after mesh loads

    this._onPointerDown = this._onPointerDown.bind(this)
    this._onPointerMove = this._onPointerMove.bind(this)
    this._onPointerUp   = this._onPointerUp.bind(this)

    // All groups start hidden
    this.group.visible = false
    scene.add(this.group)
  }

  // ── Load ──────────────────────────────────────────────────────────────────
  async load() {
    try {
      if (this.config.toc) {
        // TOC item — blank 3D scene, nothing to render
        return this
      }
      if (this.config.modelUrl) {
        try {
          const gltf = await this._loadGLTF(this.config.modelUrl)
          this._addMesh(gltf.scene)
        } catch (e) {
          console.warn(`[JewelryViewer] GLB failed (${this.config.modelUrl}):`, e)
          this._addProxy()
        }
      } else {
        this._addProxy()
      }
      this._initParticles()
    } catch (e) {
      console.warn(`[JewelryViewer] load failed, using proxy:`, e)
      this._addProxy()
      try { this._initParticles() } catch (_) {}
    }
    return this
  }

  // ── Normalise & add any Object3D as the displayed mesh ───────────────────
  _addMesh(obj) {
    const box    = new THREE.Box3().setFromObject(obj)
    const center = new THREE.Vector3()
    const size   = new THREE.Vector3()
    box.getCenter(center)
    box.getSize(size)

    // Scale first, then offset by the SCALED center so the geometry
    // lands at the origin regardless of any baked-in node translation.
    const maxDim = Math.max(size.x, size.y, size.z)
    const s      = maxDim > 0 ? TARGET_SIZE / maxDim : 1
    obj.scale.setScalar(s)
    obj.position.set(-center.x * s, -center.y * s, -center.z * s)

    this._pivot.add(obj)
  }

  _addProxy() {
    const geoMap = {
      ring:     new THREE.TorusGeometry(0.55, 0.14, 64, 200),
      pendant:  new THREE.IcosahedronGeometry(0.5, 4),
      necklace: new THREE.TorusKnotGeometry(0.45, 0.1, 200, 20, 2, 3),
      bracelet: new THREE.TorusGeometry(0.7, 0.06, 32, 200),
      earring:  new THREE.OctahedronGeometry(0.5, 3),
    }
    const geo = geoMap[this.config.proxyType] || geoMap.ring
    const mat = new THREE.MeshStandardMaterial({
      color: this.config.color || '#d4af37', metalness: 0.9, roughness: 0.15
    })
    this._pivot.add(new THREE.Mesh(geo, mat))
  }

  _loadGLTF(url) {
    return new Promise((resolve, reject) =>
      gltfLoader.load(url, resolve, undefined, reject)
    )
  }

  // ── Build particle system from loaded geometry ────────────────────────────
  _initParticles() {
    // Ensure all world matrices are fresh before sampling
    this.group.updateWorldMatrix(false, true)

    this._particles = new ParticleSystem()
    // Sample the pivot's meshes in pivot-local space
    this._particles.buildFromObject(this._pivot)

    // Hide original mesh — particles define the shape visually
    this._pivot.traverse(child => {
      if (child.isMesh) child.visible = false
    })

    // Add particle cloud to pivot so it rotates with the model
    this._pivot.add(this._particles.points)
  }

  // ── Visibility ────────────────────────────────────────────────────────────
  show(delay = 0) {
    this.group.quaternion.identity()
    this.group.visible = true
    this._particles?.show()

    if (this._particles) {
      // Start fully transparent and scaled down so the reveal is unmistakable.
      // Scale drives the Three.js transform matrix (guaranteed to update every
      // render), while the opacity tween softens the particle edges.
      this._particles.points.material.opacity = 0
      this.group.scale.setScalar(0.82)

      gsap.to(this.group.scale, {
        x: 1, y: 1, z: 1,
        duration: 1.8,
        delay,
        ease: 'power1.out',
      })
      gsap.to(this._particles.points.material, {
        opacity: 0.92,
        duration: 1.8,
        delay,
        ease: 'power1.out',
        onUpdate: () => { this._particles.points.material.needsUpdate = false },
      })
    } else {
      this.group.scale.setScalar(1)
    }
  }

  hide(onComplete) {
    // Kill any in-progress show tweens so they don't fight the hide
    gsap.killTweensOf(this.group.scale)
    if (this._particles) {
      gsap.killTweensOf(this._particles.points.material)
      gsap.to(this._particles.points.material, {
        opacity: 0,
        duration: 0.45,
        ease: 'power2.in',
        onComplete: () => {
          this._particles.hide()
          this.group.visible = false
          this.group.scale.setScalar(1)   // reset so next show() starts from 0.82
          onComplete?.()
        }
      })
    } else {
      this.group.visible = false
      this.group.scale.setScalar(1)
      onComplete?.()
    }
  }

  // ── Interaction ───────────────────────────────────────────────────────────
  enableInteraction(dom) {
    this._dom = dom
    dom.addEventListener('pointerdown', this._onPointerDown)
    dom.addEventListener('pointermove', this._onPointerMove)
    dom.addEventListener('pointerup',   this._onPointerUp)
    dom.addEventListener('pointerleave',this._onPointerUp)
  }

  disableInteraction() {
    if (!this._dom) return
    this._dom.removeEventListener('pointerdown', this._onPointerDown)
    this._dom.removeEventListener('pointermove', this._onPointerMove)
    this._dom.removeEventListener('pointerup',   this._onPointerUp)
    this._dom.removeEventListener('pointerleave',this._onPointerUp)
    this._dom = null
  }

  _onPointerDown(e) {
    this._dragging = true
    this._lastX    = e.clientX
    this._velX     = 0
    try { e.target.setPointerCapture(e.pointerId) } catch (_) {}
  }

  _onPointerMove(e) {
    if (!this._dragging) return
    const dx    = e.clientX - this._lastX
    this._lastX = e.clientX
    this._velX  = dx
    const qY    = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), dx * 0.01)
    this.group.quaternion.premultiply(qY)
  }

  _onPointerUp() { this._dragging = false }

  // ── Per-frame — accepts mouse world-space position from ShopScene ─────────
  update(mouseWorld) {
    if (!this.group.visible) return

    // Auto-spin (not while dragging)
    if (!this._dragging) {
      const BASE = 0.4
      this._velX += (BASE - this._velX) * 0.03
      const qY = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), this._velX * 0.01)
      this.group.quaternion.premultiply(qY)
    }

    // Particle physics — convert world-space mouse to pivot-local space
    if (this._particles && mouseWorld) {
      // Ensure matrices are current after this frame's rotation
      this.group.updateWorldMatrix(false, true)
      const localMouse = this._pivot.worldToLocal(mouseWorld.clone())
      this._particles.setMouseLocal(localMouse)
      this._particles.update()
    }
  }

  // ── Cleanup ───────────────────────────────────────────────────────────────
  dispose() {
    this.disableInteraction()
    this._particles?.dispose()
    this._pivot.traverse(child => {
      if (!child.isMesh) return
      child.geometry?.dispose()
      const mats = Array.isArray(child.material) ? child.material : [child.material]
      mats.forEach(m => m?.dispose())
    })
    this.scene.remove(this.group)
  }
}
