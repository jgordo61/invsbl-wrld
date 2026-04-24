#include ./noise.glsl

// ── Uniforms ─────────────────────────────────────────────────────────────────
uniform float uTime;         // elapsed seconds
uniform float uExplosion;    // 0 = fully formed, 1 = fully shattered
uniform float uScale;        // scene scale
uniform vec3  uColor;        // base particle color (gold, silver, etc.)
uniform vec3  uColorShift;   // secondary color for variation
uniform float uRotSpeed;     // current rotation speed (drives shimmer)

// ── Per-particle attributes ───────────────────────────────────────────────────
attribute vec3  aTargetPos;  // position on the jewelry mesh surface
attribute vec3  aCloudPos;   // pre-computed scattered cloud position
attribute float aSize;       // base point size
attribute float aRandom;     // [0,1] random seed per particle
attribute float aPhase;      // noise phase offset (visual variety)

// ── Varyings ─────────────────────────────────────────────────────────────────
varying float vAlpha;
varying vec3  vColor;
varying float vExplosion;

void main() {
  // ── 1. Core position: lerp from mesh → cloud as explosion increases ────────
  vec3 pos = mix(aTargetPos, aCloudPos, uExplosion);

  // ── 2. Curl-noise drift ────────────────────────────────────────────────────
  //    Always-on gentle drift when formed (small multiplier)
  //    Intensifies dramatically when exploded
  float driftTime = uTime * 0.25 + aPhase;
  vec3  curl      = curlNoise(pos * 0.5 + driftTime);

  float formedDrift   = 0.018 * (1.0 - uExplosion);
  float explodedDrift = 1.2   * uExplosion;
  pos += curl * (formedDrift + explodedDrift);

  // ── 3. Rotation shimmer — surface particles pulse when spinning fast ───────
  float shimmer = sin(uTime * 8.0 + aPhase * 6.28318) * 0.5 + 0.5;
  pos += aTargetPos * shimmer * uRotSpeed * 0.04 * (1.0 - uExplosion);

  // ── 4. MVP transform ──────────────────────────────────────────────────────
  vec4 mvPos = modelViewMatrix * vec4(pos, 1.0);
  gl_Position = projectionMatrix * mvPos;

  // ── 5. Point size: distance-attenuated, bigger when exploded ─────────────
  float sizeBase   = aSize * uScale;
  float sizeExplod = mix(1.0, 2.5, uExplosion);
  float sizeShimmer= 1.0 + uRotSpeed * shimmer * 0.5;
  gl_PointSize = sizeBase * sizeExplod * sizeShimmer * (280.0 / -mvPos.z);

  // ── 6. Varyings ───────────────────────────────────────────────────────────
  // Alpha: bright when formed, fades at explosion edges
  vAlpha    = mix(0.85, 0.35, uExplosion) * (0.4 + 0.6 * aRandom);
  // Color: shift from base to secondary as explosion grows
  vColor    = mix(uColor, uColorShift, uExplosion * aRandom);
  vExplosion = uExplosion;
}
