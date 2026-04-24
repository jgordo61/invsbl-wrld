import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { sampleSurface, buildCloudPositions } from '../utils/SurfaceSampler.js'
import vertShader from '../shaders/particles.vert'
import fragShader from '../shaders/particles.frag'
import { gsap } from 'gsap'

// ── Shared loaders ────────────────────────────────────────────────────────────
const dracoLoader = new DRACOLoader()
dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/')

const gltfLoader = new GLTFLoader()
gltfLoader.setDRACOLoader(dracoLoader)

// ── Config ────────────────────────────────────────────────────────────────────
const PARTICLE_COUNT = 12000

/**
 * JewelryParticles
 *
 * Loads a GLTF/GLB model (or falls back to a procedural proxy geometry),
 * samples its surface, and renders it as an interactive particle cloud.
 *
 * Drag to rotate; fast rotation = particle shatter effect via curl noise.
 */
export class JewelryParticles extends THREE.EventDispatcher {
  constructor(config, scene) {
    super()
    this.config  = config
    this.scene   = scene
    this.group   = new THREE.Group()
    this.points  = null
    this.material = null

    // Interaction state
    this.isDragging      = false
    this.rotationVel     = new THREE.Vector2()
    this.explosion       = 0
    this.explosionTarget = 0
    this._lastX = 0
    this._lastY = 0

    // Bind handlers
    this._onPointerDown = this._onPointerDown.bind(this)
    this._onPointerMove = this._onPointerMove.bind(this)
    this._onPointerUp   = this._onPointerUp.bind(this)

    scene.add(this.group)
  }

  // ── Load & build ──────────────────────────────────────────────────────────
  async load() {
    let geometry

    if (this.config.modelUrl) {
      try {
        geometry = await this._loadGLTF(this.config.modelUrl)
      } catch (e) {
        console.warn(`GLTF load failed (${this.config.modelUrl}), using proxy:`, e)
        geometry = this._proxyGeometry(this.config.proxyType || 'ring')
      }
    } else {
      geometry = this._proxyGeometry(this.config.proxyType || 'ring')
    }

    // Normalize to unit scale
    geometry.computeBoundingSphere()
    const r = geometry.boundingSphere.radius
    if (r > 0) {
      const posAttr = geometry.getAttribute('position')
      for (let i = 0; i < posAttr.count; i++) {
        posAttr.setXYZ(
          i,
          posAttr.getX(i) / r,
          posAttr.getY(i) / r,
          posAttr.getZ(i) / r
        )
      }
      posAttr.needsUpdate = true
    }
    geometry.computeBoundingSphere()

    // Sample surface & build cloud
    const targetPositions = sampleSurface(geometry, PARTICLE_COUNT)
    const cloudPositions  = buildCloudPositions(targetPositions, 2.8)

    // Per-particle random attributes
    const sizes   = new Float32Array(PARTICLE_COUNT)
    const randoms = new Float32Array(PARTICLE_COUNT)
    const phases  = new Float32Array(PARTICLE_COUNT)
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      sizes[i]   = 1.5 + Math.random() * 3.0
      randoms[i] = Math.random()
      phases[i]  = Math.random() * Math.PI * 2
    }

    // Particle BufferGeometry
    const pGeo = new THREE.BufferGeometry()
    pGeo.setAttribute('position',   new THREE.BufferAttribute(targetPositions.slice(), 3))
    pGeo.setAttribute('aTargetPos', new THREE.BufferAttribute(targetPositions, 3))
    pGeo.setAttribute('aCloudPos',  new THREE.BufferAttribute(cloudPositions, 3))
    pGeo.setAttribute('aSize',      new THREE.BufferAttribute(sizes, 1))
    pGeo.setAttribute('aRandom',    new THREE.BufferAttribute(randoms, 1))
    pGeo.setAttribute('aPhase',     new THREE.BufferAttribute(phases, 1))

    const color      = new THREE.Color(this.config.color      || '#d4af37')
    const colorShift = new THREE.Color(this.config.colorShift || '#fff8dc')

    this.material = new THREE.ShaderMaterial({
      vertexShader:   vertShader,
      fragmentShader: fragShader,
      uniforms: {
        uTime:       { value: 0 },
        uExplosion:  { value: 0 },
        uScale:      { value: 1.0 },
        uColor:      { value: color },
        uColorShift: { value: colorShift },
        uRotSpeed:   { value: 0 }
      },
      transparent: true,
      depthWrite:  false,
      blending:    THREE.AdditiveBlending
    })

    this.points = new THREE.Points(pGeo, this.material)
    this.group.add(this.points)
    geometry.dispose()

    return this
  }

  // ── Proxy geometries ──────────────────────────────────────────────────────
  _proxyGeometry(type) {
    switch (type) {
      case 'ring':      return new THREE.TorusGeometry(0.6, 0.18, 48, 200)
      case 'necklace':  return new THREE.TorusKnotGeometry(0.5, 0.12, 300, 24, 2, 3)
      case 'bracelet':  return new THREE.TorusGeometry(0.8, 0.07, 24, 300)
      case 'earring':   return new THREE.OctahedronGeometry(0.55, 4)
      case 'pendant':   return new THREE.IcosahedronGeometry(0.55, 5)
      default:          return new THREE.TorusGeometry(0.6, 0.18, 48, 200)
    }
  }

  // ── GLTF loader ───────────────────────────────────────────────────────────
  _loadGLTF(url) {
    return new Promise((resolve, reject) => {
      gltfLoader.load(url, (gltf) => {
        const meshes = []
        gltf.scene.traverse((child) => {
          if (child.isMesh) meshes.push(child.geometry.clone())
        })
        if (meshes.length === 0) return reject(new Error('No meshes in GLTF'))
        resolve(meshes.length === 1 ? meshes[0] : mergeGeometries(meshes))
      }, undefined, reject)
    })
  }

  // ── Pointer interaction ───────────────────────────────────────────────────
  enableInteraction(domElement) {
    this._dom = domElement
    domElement.addEventListener('pointerdown', this._onPointerDown)
    domElement.addEventListener('pointermove', this._onPointerMove)
    domElement.addEventListener('pointerup',   this._onPointerUp)
    domElement.addEventListener('pointerleave',this._onPointerUp)
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
    this.isDragging = true
    this._lastX = e.clientX
    this._lastY = e.clientY
    try { e.target.setPointerCapture(e.pointerId) } catch (_) {}
  }

  _onPointerMove(e) {
    if (!this.isDragging) return
    const dx = e.clientX - this._lastX
    const dy = e.clientY - this._lastY
    this._lastX = e.clientX
    this._lastY = e.clientY

    this.group.rotation.y += dx * 0.012
    this.group.rotation.x += dy * 0.012

    const speed = Math.sqrt(dx * dx + dy * dy)
    this.rotationVel.set(dx, dy)
    // Fast drag → shatter; gentle drag → shimmer only
    this.explosionTarget = Math.min(speed / 16.0, 1.0)
  }

  _onPointerUp() {
    this.isDragging = false
    this.explosionTarget = 0
  }

  // ── Frame update ──────────────────────────────────────────────────────────
  update(time) {
    if (!this.material) return

    this.explosion += (this.explosionTarget - this.explosion) * 0.07

    // Gentle auto-rotate when idle
    if (!this.isDragging) {
      this.group.rotation.y += 0.003
    }

    const speed = this.rotationVel.length()
    this.rotationVel.multiplyScalar(0.85)

    this.material.uniforms.uTime.value      = time
    this.material.uniforms.uExplosion.value = this.explosion
    this.material.uniforms.uRotSpeed.value  = Math.min(speed / 10, 1.0)
  }

  // ── Show / hide (with GSAP) ───────────────────────────────────────────────
  show(delay = 0) {
    this.group.visible = true
    if (!this.material) return
    gsap.to(this.material.uniforms.uScale, {
      value: 1.0, duration: 1.4, delay, ease: 'power3.out'
    })
  }

  hide(delay = 0) {
    if (!this.material) return
    gsap.to(this.material.uniforms.uScale, {
      value: 0.0, duration: 0.8, delay, ease: 'power3.in',
      onComplete: () => { this.group.visible = false }
    })
  }

  // ── Cleanup ───────────────────────────────────────────────────────────────
  dispose() {
    this.disableInteraction()
    this.points?.geometry.dispose()
    this.material?.dispose()
    this.scene.remove(this.group)
  }
}
