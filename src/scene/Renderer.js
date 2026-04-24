import * as THREE from 'three'
import {
  EffectComposer,
  RenderPass,
  EffectPass,
  SMAAEffect,
} from 'postprocessing'

/**
 * Renderer — clean mesh display on white background.
 *
 * Lighting rig:
 *   - HemisphereLight   sky/ground wrap for soft fill
 *   - DirectionalLight  key from upper-left
 *   - DirectionalLight  soft fill from lower-right
 *   - PointLight        tight specular highlight
 *
 * Post: SMAA anti-aliasing only — no bloom/vignette that would
 * show artefacts against the white background.
 */
export class Renderer {
  constructor(canvas) {
    this.canvas = canvas

    // ── WebGL renderer ──────────────────────────────────────────────────────
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias:       false,
      alpha:           true,
      powerPreference: 'high-performance',
      stencil:         false,
    })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.setSize(window.innerWidth, window.innerHeight)
    this.renderer.setClearColor(0x000000, 0)   // transparent — white body shows through
    this.renderer.shadowMap.enabled = false
    this.renderer.toneMapping        = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.0
    this.renderer.outputColorSpace   = THREE.SRGBColorSpace

    // ── Scene & Camera ──────────────────────────────────────────────────────
    this.scene  = new THREE.Scene()
    this.camera = new THREE.PerspectiveCamera(
      45,
      window.innerWidth / window.innerHeight,
      0.01,
      100
    )
    this.camera.position.set(0, 0, 4.5)

    // ── Lighting rig for white-background mesh display ──────────────────────
    // Hemisphere: warm sky, cool ground — wraps the model softly
    const hemi = new THREE.HemisphereLight(0xffffff, 0xe0e8ff, 1.2)
    this.scene.add(hemi)

    // Key light: upper-left, slightly warm
    const key = new THREE.DirectionalLight(0xfff5e8, 2.5)
    key.position.set(-3, 4, 3)
    this.scene.add(key)

    // Fill light: lower-right, cool and dim
    const fill = new THREE.DirectionalLight(0xe8f0ff, 0.8)
    fill.position.set(3, -2, 2)
    this.scene.add(fill)

    // Rim / backlight: pops edges against white bg
    const rim = new THREE.DirectionalLight(0xffffff, 1.2)
    rim.position.set(0, 0, -4)
    this.scene.add(rim)

    // ── Post-processing: SMAA only ──────────────────────────────────────────
    this.composer = new EffectComposer(this.renderer, {
      multisampling: Math.min(4, this.renderer.capabilities.maxSamples)
    })
    this.composer.addPass(new RenderPass(this.scene, this.camera))
    this.composer.addPass(new EffectPass(this.camera, new SMAAEffect()))

    // ── Resize ──────────────────────────────────────────────────────────────
    this._onResize = this._onResize.bind(this)
    window.addEventListener('resize', this._onResize)
  }

  render() { this.composer.render() }

  _onResize() {
    const w = window.innerWidth
    const h = window.innerHeight
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(w, h)
    this.composer.setSize(w, h)
  }

  dispose() {
    window.removeEventListener('resize', this._onResize)
    this.composer.dispose()
    this.renderer.dispose()
  }
}
