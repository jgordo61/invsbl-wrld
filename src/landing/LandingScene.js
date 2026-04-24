/**
 * LandingScene
 *
 * Renders INVSBL / WRLD as 3D GLB letters on a transparent orthographic canvas.
 * Letters are revealed one by one via revealLetter() as TextScrambler locks each char.
 */

import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js'

const LETTER_HEIGHT = 1.0     // world-units each letter is normalised to
const LETTER_GAP    = 0.08    // world-units between letters
const ROW_GAP       = 1.5     // world-units between the two row centres
const PADDING       = 1.2     // fractional padding around content for camera fit

const GLB_BASE = '/models/BML%20Typeset%20GLB/Uppercase%20'

const ROWS = [
  { key: 'INVSBL', chars: ['I','N','V','S','B','L'] },
  { key: 'WRLD',   chars: ['W','R','L','D'] },
]

// ─────────────────────────────────────────────────────────────────────────────
export class LandingScene {
  constructor(canvas) {
    this._canvas   = canvas
    this._disposed = false

    this._renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true })
    this._renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this._renderer.setClearColor(0x000000, 0)
    this._renderer.outputColorSpace  = THREE.SRGBColorSpace
    this._renderer.shadowMap.enabled = true
    this._renderer.shadowMap.type    = THREE.PCFSoftShadowMap

    this._scene  = new THREE.Scene()
    this._camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 50)
    this._camera.position.z = 10

    // ── Lighting — needed to show letter depth via shading ───────────────────
    // Soft fill so nothing is pitch black
    const ambient = new THREE.AmbientLight(0xffffff, 0.25)
    this._scene.add(ambient)

    const key = new THREE.DirectionalLight(0xffffff, 2.5)
    key.position.set(-0.3, 0.8, 6)
    key.castShadow                   = true
    key.shadow.mapSize.width         = 512
    key.shadow.mapSize.height        = 512
    key.shadow.camera.near           = 0.5
    key.shadow.camera.far            = 30
    key.shadow.camera.left           = -8
    key.shadow.camera.right          =  8
    key.shadow.camera.top            =  8
    key.shadow.camera.bottom         = -8
    key.shadow.bias                  = -0.001
    this._scene.add(key)

    const rim = new THREE.DirectionalLight(0xffffff, 1.0)
    rim.position.set(0.4, 0.4, 5)
    rim.castShadow                   = true
    rim.shadow.mapSize.width         = 256
    rim.shadow.mapSize.height        = 256
    rim.shadow.camera.near           = 0.5
    rim.shadow.camera.far            = 30
    rim.shadow.camera.left           = -8
    rim.shadow.camera.right          =  8
    rim.shadow.camera.top            =  8
    rim.shadow.camera.bottom         = -8
    rim.shadow.bias                  = -0.001
    this._scene.add(rim)

    // ── Shadow surfaces ───────────────────────────────────────────────────────
    // ShadowMaterial is fully transparent except where shadows fall — blends
    // cleanly with the white HTML background

    // Floor — sits below the letters, catches downward shadows
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(24, 24),
      new THREE.ShadowMaterial({ opacity: 0.18 })
    )
    floor.rotation.x = -Math.PI / 2
    floor.position.y = -1.8
    floor.receiveShadow = true
    this._scene.add(floor)

    // Backdrop — vertical plane behind letters, catches rear-projected shadows
    const backdrop = new THREE.Mesh(
      new THREE.PlaneGeometry(24, 12),
      new THREE.ShadowMaterial({ opacity: 0.10 })
    )
    backdrop.position.z = -1.5
    backdrop.receiveShadow = true
    this._scene.add(backdrop)

    // [rowKey][charIndex] = { pivot, mats, anim, baseY } | null
    this._letters      = {}
    this._allLetters   = []   // flat list for render loop
    ROWS.forEach(r => { this._letters[r.key] = r.chars.map(() => null) })

    const draco = new DRACOLoader()
    draco.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/')
    this._loader = new GLTFLoader()
    this._loader.setDRACOLoader(draco)

    this._flickerTimers = []
    this._animTimers    = []   // setTimeout IDs for exit/enter sequences
    this._animating     = false
    this._boundResize   = this._onResize.bind(this)
    window.addEventListener('resize', this._boundResize)
    this._onResize()
    this._startLoop()
  }

  // ── Load all GLBs and build scene ─────────────────────────────────────────
  async load() {
    const unique = [...new Set(ROWS.flatMap(r => r.chars))]
    const cache  = {}

    await Promise.all(unique.map(async char => {
      const url = `${GLB_BASE}${char}.glb`
      try {
        const gltf = await this._loadGLB(url)
        cache[char] = gltf.scene
      } catch (e) {
        console.warn(`LandingScene: could not load "${char}"`, e)
        cache[char] = null
      }
    }))

    // Place rows top (INVSBL) then bottom (WRLD)
    const yTop    =  ROW_GAP * 0.5
    const yBottom = -ROW_GAP * 0.5
    this._placeRow(ROWS[0], cache, yTop)
    this._placeRow(ROWS[1], cache, yBottom)

    // Auto-fit the orthographic camera to the placed content
    this._fitCamera()
  }

  // ── Shared fade helper ────────────────────────────────────────────────────
  // Fades a sequence of entries from one opacity to another with a stagger.
  // onComplete fires after the last letter finishes fading.
  _fadeSequence(sequence, fromOp, toOp, onComplete) {
    this._animTimers.forEach(clearTimeout)
    this._animTimers = []
    // Note: _animating is intentionally NOT set here — fades only touch opacity,
    // so bob/tilt can run freely with no conflict, preventing a snap on completion.
    this._flickerTimers.forEach(clearTimeout)
    this._flickerTimers = []

    const DUR     = 350   // ms per letter fade
    const STAGGER = 80    // ms between each letter

    sequence.forEach((entry, i) => {
      this._animTimers.push(setTimeout(() => {
        entry.pivot.visible = true
        entry.mats.forEach(m => { m.opacity = fromOp })
        this._tweenOp(entry, fromOp, toOp, DUR, () => {
          if (toOp === 0) entry.pivot.visible = false
          else            this._scheduleFlicker(entry)
        })
      }, i * STAGGER))
    })

    const totalMs = (sequence.length - 1) * STAGGER + DUR
    this._animTimers.push(setTimeout(() => onComplete?.(), totalMs))
  }

  // ── Fade all letters in, left→right (initial load & return from shop) ─────
  revealAll(onComplete) {
    const sequence = [
      ...this._letters['INVSBL'].filter(Boolean),
      ...this._letters['WRLD'].filter(Boolean),
    ]
    this._fadeSequence(sequence, 0, 1, onComplete)
  }

  // ── Fade all letters out, left→right (entering shop) ─────────────────────
  exitLetters(onComplete) {
    const sequence = [
      ...this._letters['INVSBL'].filter(Boolean),
      ...this._letters['WRLD'].filter(Boolean),
    ]
    this._fadeSequence(sequence, 1, 0, onComplete)
  }

  // ── Fade all letters in, left→right (returning from shop) ────────────────
  enterLetters() {
    const sequence = [
      ...this._letters['INVSBL'].filter(Boolean),
      ...this._letters['WRLD'].filter(Boolean),
    ]
    this._fadeSequence(sequence, 0, 1)
  }

  // ── Reset all letters to hidden instantly ────────────────────────────────
  resetLetters() {
    this._animTimers.forEach(clearTimeout)
    this._animTimers = []
    this._flickerTimers.forEach(clearTimeout)
    this._flickerTimers = []
    ROWS.forEach(row => {
      this._letters[row.key].forEach(entry => {
        if (!entry) return
        entry.pivot.visible = false
        entry.pivot.rotation.set(0, 0, 0)
        entry.mats.forEach(m => { m.opacity = 0 })
      })
    })
  }

  // ── Opacity tween — version-guarded so stale tweens can't stomp new ones ──
  _tweenOp(entry, fromOp, toOp, duration, onDone) {
    const version = (entry._tweenVer = ((entry._tweenVer || 0) + 1))
    const startTs = performance.now()
    const tick = (ts) => {
      if (this._disposed) return
      if (entry._tweenVer !== version) return
      const t     = Math.min((ts - startTs) / duration, 1)
      const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2  // ease-in-out quad
      entry.mats.forEach(m => { m.opacity = fromOp + (toOp - fromOp) * eased })
      if (t < 1) requestAnimationFrame(tick)
      else       onDone?.()
    }
    requestAnimationFrame(tick)
  }

  // ── Build one row ─────────────────────────────────────────────────────────
  _placeRow(rowDef, cache, rowY) {
    const { key, chars } = rowDef

    // Step 1 — clone, apply material, normalise height, then CENTER at origin
    const pieces = chars.map(char => {
      const src = cache[char]
      if (!src) return null

      const group = src.clone(true)

      // Ensure all matrices are current before measuring
      group.updateMatrixWorld(true)

      // Lit material — shading reveals the extruded 3D depth
      const mats = []
      group.traverse(c => {
        if (!c.isMesh) return
        const old = Array.isArray(c.material) ? c.material : [c.material]
        old.forEach(m => m.dispose())
        const m = new THREE.MeshStandardMaterial({
          color:       0x0a0a0a,
          metalness:   0.0,
          roughness:   0.6,
          transparent: true,
          opacity:     0,
        })
        c.material       = m
        c.castShadow     = true
        c.receiveShadow  = false
        c.frustumCulled  = false   // prevents shadow pass from hiding letters in main render
        mats.push(m)
      })

      // Rotate to face camera — Blender text faces +Y, Three.js camera looks along -Z
      group.rotation.x = Math.PI / 2
      group.updateMatrixWorld(true)

      // Normalise height to LETTER_HEIGHT
      const b1 = new THREE.Box3().setFromObject(group)
      const s1  = new THREE.Vector3()
      b1.getSize(s1)
      if (s1.y > 0) group.scale.setScalar(LETTER_HEIGHT / s1.y)
      group.updateMatrixWorld(true)

      // Centre the group so its bounding box sits at the world origin
      const b2 = new THREE.Box3().setFromObject(group)
      const c2 = new THREE.Vector3()
      b2.getCenter(c2)
      group.position.x -= c2.x
      group.position.y -= c2.y
      group.position.z -= c2.z
      group.updateMatrixWorld(true)

      // Wrap in a pivot — pivot.position drives placement, group is always centred
      const pivot = new THREE.Group()
      pivot.add(group)

      // Measure final width
      const b3   = new THREE.Box3().setFromObject(pivot)
      const size = new THREE.Vector3()
      b3.getSize(size)

      // Per-letter animation parameters — randomised so each letter moves independently
      const anim = {
        bobSpeed:   (0.55 + Math.random() * 0.35) * 0.2,  // slowed 80%
        bobAmp:     0.028 + Math.random() * 0.022,
        bobPhase:   Math.random() * Math.PI * 2,
        tiltXSpeed: (0.18 + Math.random() * 0.14) * 0.2,
        tiltXAmp:   (0.28 + Math.random() * 0.18) * 0.3,   // reduced 70%
        tiltXPhase: Math.random() * Math.PI * 2,
        tiltYSpeed: (0.12 + Math.random() * 0.10) * 0.2,
        tiltYAmp:   (0.32 + Math.random() * 0.20) * 0.3,   // reduced 70%
        tiltYPhase: Math.random() * Math.PI * 2,
      }

      return { pivot, mats, width: size.x, anim }
    })

    // Step 2 — compute total row width and distribute left-to-right
    const validWidths = pieces.map(p => p ? p.width : 0)
    const totalWidth  = validWidths.reduce((s, w) => s + w, 0)
      + LETTER_GAP * (chars.length - 1)

    let x = -totalWidth / 2
    pieces.forEach((p, i) => {
      if (!p) { x += validWidths[i] + LETTER_GAP; return }

      p.pivot.position.set(x + validWidths[i] / 2, rowY, 0)
      p.pivot.frustumCulled = false   // prevent camera culling the whole group
      p.pivot.visible = false
      this._scene.add(p.pivot)
      const entry = { pivot: p.pivot, mats: p.mats, anim: p.anim, baseY: rowY }
      this._letters[key][i] = entry
      this._allLetters.push(entry)

      x += validWidths[i] + LETTER_GAP
    })
  }

  // ── Fit orthographic camera to the full content bounding box ──────────────
  _fitCamera() {
    const box = new THREE.Box3()
    ROWS.forEach(row => {
      this._letters[row.key].forEach(entry => {
        if (!entry) return
        // Temporarily make visible so setFromObject works
        entry.pivot.visible = true
        box.expandByObject(entry.pivot)
        entry.pivot.visible = false
      })
    })

    const size   = new THREE.Vector3()
    const centre = new THREE.Vector3()
    box.getSize(size)
    box.getCenter(centre)

    // Store content bounds for resize
    this._contentW  = size.x
    this._contentH  = size.y
    this._contentCX = centre.x
    this._contentCY = centre.y

    this._updateCameraFrustum()
  }

  // ── Set camera frustum to content + padding, preserving aspect ratio ───────
  _updateCameraFrustum() {
    if (!this._contentW) return
    const aspect = window.innerWidth / window.innerHeight

    // Fit to whichever axis is more constrained
    const fitH = (this._contentH * (1 + PADDING * 2)) / 2
    const fitW = (this._contentW * (1 + PADDING * 2)) / 2

    let halfH, halfW
    if (fitW / fitH > aspect) {
      // Content wider than viewport — fit to width
      halfW = fitW
      halfH = fitW / aspect
    } else {
      // Content taller — fit to height
      halfH = fitH
      halfW = fitH * aspect
    }

    this._camera.left   = this._contentCX - halfW
    this._camera.right  = this._contentCX + halfW
    this._camera.top    = this._contentCY + halfH
    this._camera.bottom = this._contentCY - halfH
    this._camera.updateProjectionMatrix()
  }

  // ── Flicker loop (matches TextScrambler CSS flicker feel) ─────────────────
  _scheduleFlicker(entry) {
    if (this._disposed) return
    const delay = 2000 + Math.random() * 7000
    const t = setTimeout(() => this._doFlicker(entry), delay)
    this._flickerTimers.push(t)
  }

  _doFlicker(entry) {
    if (this._disposed) return
    const count    = 1 + Math.floor(Math.random() * 3)
    const sequence = []
    if (Math.random() > 0.6) sequence.push({ o: 0.15, d: 80 + Math.random() * 120 })
    for (let i = 0; i < count; i++) {
      sequence.push({ o: 0,   d: 30 + Math.random() * 80 })
      sequence.push({ o: 1,   d: 20 + Math.random() * 50 })
    }

    let idx = 0
    const next = () => {
      if (this._disposed) return
      if (idx >= sequence.length) {
        entry.mats.forEach(m => { m.opacity = 1 })
        this._scheduleFlicker(entry)
        return
      }
      const { o, d } = sequence[idx++]
      entry.mats.forEach(m => { m.opacity = o })
      const t = setTimeout(next, d)
      this._flickerTimers.push(t)
    }
    next()
  }

  // ── Renderer resize ────────────────────────────────────────────────────────
  _onResize() {
    this._renderer.setSize(window.innerWidth, window.innerHeight)
    this._updateCameraFrustum()
  }

  // ── Render loop ───────────────────────────────────────────────────────────
  _startLoop() {
    const loop = (ts = 0) => {
      if (this._disposed) return
      this._animFrame = requestAnimationFrame(loop)

      const t = ts * 0.001   // seconds

      // Bob + tilt — always active, fades only touch opacity so there's no conflict
      this._allLetters.forEach(entry => {
        if (!entry.pivot.visible) return
        const { anim, pivot, baseY } = entry
        pivot.position.y = baseY
          + Math.sin(t * anim.bobSpeed * Math.PI * 2 + anim.bobPhase) * anim.bobAmp
        pivot.rotation.x = Math.sin(t * anim.tiltXSpeed * Math.PI * 2 + anim.tiltXPhase) * anim.tiltXAmp
        pivot.rotation.y = Math.sin(t * anim.tiltYSpeed * Math.PI * 2 + anim.tiltYPhase) * anim.tiltYAmp
      })

      this._renderer.render(this._scene, this._camera)
    }
    loop()
  }

  _loadGLB(url) {
    return new Promise((resolve, reject) =>
      this._loader.load(url, resolve, undefined, reject)
    )
  }

  dispose() {
    this._disposed = true
    cancelAnimationFrame(this._animFrame)
    this._animTimers.forEach(clearTimeout)
    this._flickerTimers.forEach(clearTimeout)
    window.removeEventListener('resize', this._boundResize)
    this._renderer.dispose()
  }
}
