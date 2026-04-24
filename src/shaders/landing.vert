#include ./noise.glsl

uniform float uTime;
uniform float uScale;

attribute vec3  aPos;
attribute float aRandom;
attribute float aPhase;

varying float vAlpha;
varying vec3  vColor;
varying float vExplosion;

void main() {
  // Start from pre-computed position
  vec3 pos = aPos;

  // Slow curl drift — ambient gold dust atmosphere
  float t  = uTime * 0.12 + aPhase;
  pos     += curlNoise(pos * 0.3 + t) * 0.55;

  vec4 mvPos = modelViewMatrix * vec4(pos, 1.0);
  gl_Position = projectionMatrix * mvPos;

  // Size: small twinkling dust
  gl_PointSize = (1.2 + aRandom * 2.2) * uScale * (180.0 / -mvPos.z);

  vAlpha     = (0.2 + 0.5 * aRandom) * uScale;
  vColor     = mix(
    vec3(0.55, 0.42, 0.15),   // deep gold
    vec3(0.98, 0.93, 0.75),   // bright warm white
    aRandom
  );
  vExplosion = 0.0;
}
