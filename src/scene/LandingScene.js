import * as THREE from 'three'
import { gsap } from 'gsap'
import vertShader from '../shaders/landing.vert'
import fragShader from '../shaders/particles.frag'

const AMBIENT_COUNT = 6000

/**
 * LandingScene
 *
 * Full-screen atmospheric gold-dust particle field for the landing page.
 * Slow curl-noise drift, no interactivity — pure ambience.
 */
export class LandingScene {
  constructor(renderer, scene, camera) {
    this.renderer = renderer
    this.scene    = scene
    this.camera   = camera
    this.group    = new THREE.Group()
    this.material = null
    scene.add(this.group)
    this._build()
  }

  _build() {
    const positions = new Float32Array(AMBIENT_COUNT * 3)
    const randoms   = new Float32Array(AMBIENT_COUNT)
    const phases    = new Float32Array(AMBIENT_COUNT)

    for (let i = 0; i < AMBIENT_COUNT; i++) {
      // Random cloud in a sphere
      const theta = Math.random() * Math.PI * 2
      const phi   = Math.acos(2 * Math.random() - 1)
      const r     = 2.5 + Math.random() * 2.5
      positions[i * 3]     = r * Math.sin(phi) * Math.cos(theta)
      positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta)
      positions[i * 3 + 2] = r * Math.cos(phi)
      randoms[i] = Math.random()
      phases[i]  = Math.random() * Math.PI * 2
    }

    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geo.setAttribute('aPos',     new THREE.BufferAttribute(positions.slice(), 3))
    geo.setAttribute('aRandom',  new THREE.BufferAttribute(randoms, 1))
    geo.setAttribute('aPhase',   new THREE.BufferAttribute(phases, 1))

    this.material = new THREE.ShaderMaterial({
      vertexShader:   vertShader,
      fragmentShader: fragShader,
      uniforms: {
        uTime:       { value: 0 },
        uExplosion:  { value: 0 },
        uScale:      { value: 0 },     // fades in on enter
        uColor:      { value: new THREE.Color('#c9a84c') },
        uColorShift: { value: new THREE.Color('#fff8e7') },
        uRotSpeed:   { value: 0 }
      },
      transparent: true,
      depthWrite:  false,
      blending:    THREE.AdditiveBlending
    })

    const points = new THREE.Points(geo, this.material)
    this.group.add(points)
  }

  enter() {
    // Fade particles in
    gsap.to(this.material.uniforms.uScale, {
      value: 1.0, duration: 2.5, ease: 'power2.out'
    })
  }

  exit(onComplete) {
    gsap.to(this.material.uniforms.uScale, {
      value: 0, duration: 1.0, ease: 'power2.in', onComplete
    })
  }

  update(time) {
    if (!this.material) return
    this.material.uniforms.uTime.value = time
    // Slow drift rotation
    this.group.rotation.y = time * 0.04
  }

  dispose() {
    this.group.children.forEach(c => {
      c.geometry.dispose()
      c.material.dispose()
    })
    this.scene.remove(this.group)
  }
}
