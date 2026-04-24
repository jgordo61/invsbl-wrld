import * as THREE from 'three'

/**
 * Uniformly samples N random points on the surface of a BufferGeometry.
 * Uses area-weighted sampling so dense triangle areas don't over-represent.
 *
 * Returns a Float32Array of positions: [x0,y0,z0, x1,y1,z1, ...]
 */
export function sampleSurface(geometry, count) {
  // Work with a non-indexed copy so every face is explicit
  const geo = geometry.index ? geometry.toNonIndexed() : geometry.clone()
  geo.computeVertexNormals()

  const posAttr = geo.getAttribute('position')
  const triCount = posAttr.count / 3

  // ── Build cumulative area table ─────────────────────────────────────────
  const vA = new THREE.Vector3()
  const vB = new THREE.Vector3()
  const vC = new THREE.Vector3()
  const areas = new Float32Array(triCount)
  let totalArea = 0

  for (let i = 0; i < triCount; i++) {
    vA.fromBufferAttribute(posAttr, i * 3)
    vB.fromBufferAttribute(posAttr, i * 3 + 1)
    vC.fromBufferAttribute(posAttr, i * 3 + 2)
    const area = new THREE.Triangle(vA, vB, vC).getArea()
    totalArea += area
    areas[i] = totalArea
  }

  // ── Sample ───────────────────────────────────────────────────────────────
  const result = new Float32Array(count * 3)
  const target = new THREE.Vector3()

  for (let i = 0; i < count; i++) {
    // Pick a triangle proportional to its area
    const r = Math.random() * totalArea
    let lo = 0, hi = triCount - 1
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (areas[mid] < r) lo = mid + 1
      else hi = mid
    }

    // Sample a random point inside that triangle (uniform barycentric)
    vA.fromBufferAttribute(posAttr, lo * 3)
    vB.fromBufferAttribute(posAttr, lo * 3 + 1)
    vC.fromBufferAttribute(posAttr, lo * 3 + 2)

    let u = Math.random()
    let v = Math.random()
    if (u + v > 1) { u = 1 - u; v = 1 - v }
    const w = 1 - u - v

    target.set(
      vA.x * w + vB.x * u + vC.x * v,
      vA.y * w + vB.y * u + vC.y * v,
      vA.z * w + vB.z * u + vC.z * v
    )

    result[i * 3]     = target.x
    result[i * 3 + 1] = target.y
    result[i * 3 + 2] = target.z
  }

  geo.dispose()
  return result
}

/**
 * Builds cloud positions: each particle gets a pre-computed
 * "exploded" destination that's randomized around the mesh's bounding sphere.
 */
export function buildCloudPositions(targetPositions, spreadRadius = 2.5) {
  const count  = targetPositions.length / 3
  const result = new Float32Array(count * 3)

  for (let i = 0; i < count; i++) {
    // Start from the surface sample, then scatter outward
    const ox = targetPositions[i * 3]
    const oy = targetPositions[i * 3 + 1]
    const oz = targetPositions[i * 3 + 2]

    // Random direction + random distance
    const theta = Math.random() * Math.PI * 2
    const phi   = Math.acos(2 * Math.random() - 1)
    const r     = spreadRadius * (0.5 + Math.random())

    result[i * 3]     = ox + r * Math.sin(phi) * Math.cos(theta)
    result[i * 3 + 1] = oy + r * Math.sin(phi) * Math.sin(theta)
    result[i * 3 + 2] = oz + r * Math.cos(phi)
  }

  return result
}
