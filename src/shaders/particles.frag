precision highp float;

varying float vAlpha;
varying vec3  vColor;
varying float vExplosion;

void main() {
  // ── Circular soft-edged point sprite ──────────────────────────────────────
  vec2  uv   = gl_PointCoord - 0.5;
  float dist = length(uv);

  // Hard clip at circle edge
  if (dist > 0.5) discard;

  // ── Core glow: bright center, soft falloff ─────────────────────────────────
  float coreGlow   = 1.0 - smoothstep(0.0, 0.2,  dist);
  float softFalloff= 1.0 - smoothstep(0.2, 0.5,  dist);

  // When exploded, particles have a wider halo; when formed they're tight dots
  float alpha = vAlpha * mix(softFalloff, softFalloff + coreGlow * 0.5, vExplosion);
  alpha = clamp(alpha, 0.0, 1.0);

  // ── Specular sparkle: tiny bright highlight offset from center ────────────
  vec2  sparkleUV  = uv - vec2(0.1, 0.1);
  float sparkle    = 1.0 - smoothstep(0.0, 0.08, length(sparkleUV));
  sparkle *= (1.0 - vExplosion) * 0.6; // only on formed jewelry

  vec3 finalColor = vColor + vec3(sparkle);

  gl_FragColor = vec4(finalColor, alpha);
}
