import * as THREE from 'three'
import { MeshSurfaceSampler } from 'three/examples/jsm/math/MeshSurfaceSampler.js'

// ── Tunable constants ─────────────────────────────────────────────────────────
const COUNT         = 10000   // total particles per model
const REPEL_R       = 0.52    // mouse influence radius (model-local units)
const REPEL_FORCE   = 0.11    // push strength at contact
const SPRING_K      = 0.038   // spring stiffness back to rest position
const DAMPING       = 0.86    // velocity drag per frame
const NOISE         = 0.0003  // ambient shimmer magnitude
const CENTRIFUGAL_K = 0.1     // centrifugal scatter scale (ω² × K × r pushes outward)

// ── One shared circle sprite ──────────────────────────────────────────────────
const _sprite = (() => {
  const c   = document.createElement('canvas')
  c.width   = c.height = 64
  const ctx = c.getContext('2d')
  const g   = ctx.createRadialGradient(32, 32, 0, 32, 32, 32)
  g.addColorStop(0,    'rgba(10,10,10,1)')
  g.addColorStop(0.45, 'rgba(10,10,10,0.85)')
  g.addColorStop(1,    'rgba(10,10,10,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 64, 64)
  return new THREE.CanvasTexture(c)
})()

// ─────────────────────────────────────────────────────────────────────────────
export class ParticleSystem {
  constructor() {
    this._rest   = new Float32Array(COUNT * 3)
    this._vel    = new Float32Array(COUNT * 3)
    this._pos    = new Float32Array(COUNT * 3)
    this._mouse  = new THREE.Vector3(9999, 9999, 9999)
    this._omega  = 0   // angular velocity (rad/frame) for centrifugal force
    this._active = false
    this._frame  = 0   // shimmer throttle counter

    // Geometry — position buffer is written every frame
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(this._pos, 3))

    const mat = new THREE.PointsMaterial({
      color:           0x0a0a0a,
      size:            0.019,        // world-unit diameter, perspective-scaled
      sizeAttenuation: true,
      map:             _sprite,
      transparent:     true,
      alphaTest:       0.005,
      depthWrite:      false,
      opacity:         0.9,
    })

    this.points         = new THREE.Points(geo, mat)
    this.points.visible = false
    this._geo           = geo
  }

  // ── Build rest positions from all meshes inside root group ────────────────
  buildFromObject(root) {
    // Ensure world matrices are current before sampling
    root.updateWorldMatrix(false, true)

    const meshes = []
    root.traverse(c => {
      if (c.isMesh && c.geometry?.attributes?.position) meshes.push(c)
    })

    if (!meshes.length) {
      this._fallbackSphere()
    } else {
      this._sampleMeshes(root, meshes)
    }

    // Freeze rest positions
    this._rest.set(this._pos)
    this._geo.attributes.position.needsUpdate = true
  }

  // ── Distribute particles across meshes proportional to vertex count ────────
  _sampleMeshes(root, meshes) {
    const counts = meshes.map(m => m.geometry.attributes.position.count)
    const total  = counts.reduce((a, b) => a + b, 0)
    let filled   = 0

    for (let mi = 0; mi < meshes.length; mi++) {
      const share = mi === meshes.length - 1
        ? COUNT - filled
        : Math.round(COUNT * counts[mi] / total)

      const mesh = meshes[mi]
      const tmpV = new THREE.Vector3()

      try {
        // Area-weighted surface sampling — gives uniform coverage
        const sampler = new MeshSurfaceSampler(mesh).build()

        for (let i = 0; i < share && filled < COUNT; i++, filled++) {
          sampler.sample(tmpV)
          // Transform: mesh-local → world → root-local
          mesh.localToWorld(tmpV)
          root.worldToLocal(tmpV)
          this._pos[filled * 3]     = tmpV.x
          this._pos[filled * 3 + 1] = tmpV.y
          this._pos[filled * 3 + 2] = tmpV.z
        }
      } catch (_) {
        // Fallback: randomly sample existing vertices
        const attr = mesh.geometry.attributes.position
        for (let i = 0; i < share && filled < COUNT; i++, filled++) {
          const vi = Math.floor(Math.random() * attr.count)
          tmpV.set(attr.getX(vi), attr.getY(vi), attr.getZ(vi))
          mesh.localToWorld(tmpV)
          root.worldToLocal(tmpV)
          this._pos[filled * 3]     = tmpV.x
          this._pos[filled * 3 + 1] = tmpV.y
          this._pos[filled * 3 + 2] = tmpV.z
        }
      }
    }
  }

  _fallbackSphere() {
    for (let i = 0; i < COUNT; i++) {
      const θ = Math.random() * Math.PI * 2
      const φ = Math.acos(2 * Math.random() - 1)
      const r = 0.75 * Math.cbrt(Math.random())
      this._pos[i * 3]     = r * Math.sin(φ) * Math.cos(θ)
      this._pos[i * 3 + 1] = r * Math.sin(φ) * Math.sin(θ)
      this._pos[i * 3 + 2] = r * Math.cos(φ)
    }
  }

  // ── Called every frame with mouse position in this object's local space ───
  setMouseLocal(v3) { this._mouse.copy(v3) }

  // ── Angular velocity (rad/frame) driving centrifugal scatter ─────────────
  setAngularVelocity(omega) { this._omega = omega }

  // ── Per-frame physics ─────────────────────────────────────────────────────
  update() {
    if (!this._active) return

    const pos     = this._pos
    const rest    = this._rest
    const vel     = this._vel
    const mx      = this._mouse.x
    const my      = this._mouse.y
    const mz      = this._mouse.z
    const R2      = REPEL_R * REPEL_R
    // Apply shimmer only every 3rd frame — cuts 30k random calls to 10k
    const shimmer = (++this._frame % 3 === 0)
    // Centrifugal: ω² × K applied per-particle as pos[x/z] * centF
    // (force is proportional to radius from Y axis — no sqrt needed)
    const centF   = this._omega * this._omega * CENTRIFUGAL_K

    for (let i = 0; i < COUNT; i++) {
      const ix = i * 3, iy = ix + 1, iz = ix + 2

      // ── Mouse repulsion ────────────────────────────────────────────────────
      const dx = pos[ix] - mx
      const dy = pos[iy] - my
      const dz = pos[iz] - mz
      const d2 = dx * dx + dy * dy + dz * dz

      if (d2 < R2 && d2 > 1e-5) {
        const dist  = Math.sqrt(d2)
        const force = (REPEL_R - dist) / REPEL_R * REPEL_FORCE
        vel[ix] += (dx / dist) * force
        vel[iy] += (dy / dist) * force
        vel[iz] += (dz / dist) * force
      }

      // ── Centrifugal force — outward in XZ plane from Y rotation axis ───────
      // vel += pos * centF because F = ω²·K·r and direction = pos/r → pos·centF
      if (centF > 1e-7) {
        vel[ix] += pos[ix] * centF
        vel[iz] += pos[iz] * centF
      }

      // ── Spring back to rest + ambient shimmer (throttled) ─────────────────
      if (shimmer) {
        vel[ix] += (rest[ix] - pos[ix]) * SPRING_K + (Math.random() - 0.5) * NOISE
        vel[iy] += (rest[iy] - pos[iy]) * SPRING_K + (Math.random() - 0.5) * NOISE
        vel[iz] += (rest[iz] - pos[iz]) * SPRING_K + (Math.random() - 0.5) * NOISE
      } else {
        vel[ix] += (rest[ix] - pos[ix]) * SPRING_K
        vel[iy] += (rest[iy] - pos[iy]) * SPRING_K
        vel[iz] += (rest[iz] - pos[iz]) * SPRING_K
      }

      // ── Dampen + integrate ─────────────────────────────────────────────────
      vel[ix] *= DAMPING;  pos[ix] += vel[ix]
      vel[iy] *= DAMPING;  pos[iy] += vel[iy]
      vel[iz] *= DAMPING;  pos[iz] += vel[iz]
    }

    this._geo.attributes.position.needsUpdate = true
  }

  show() { this._active = true;  this.points.visible = true  }
  hide() { this._active = false; this.points.visible = false }

  dispose() {
    this._geo.dispose()
    this.points.material.dispose()
  }
}
