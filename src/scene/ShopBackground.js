/**
 * ShopBackground
 *
 * Renders a depth-perspective dot grid into a dedicated fullscreen canvas
 * that sits behind the Three.js WebGL canvas and all HUD elements.
 *
 * The dot grid simulates a floor receding into the distance:
 *   • Top of screen  — tiny, nearly-invisible dots  (far / deep space)
 *   • Bottom         — slightly larger, faintly darker dots (close / foreground)
 *
 * Uses its own WebGL context so it never interferes with the main
 * EffectComposer / SMAA pipeline.
 */
export class ShopBackground {
  /**
   * @param {HTMLCanvasElement} canvas – the dedicated background canvas element
   */
  constructor (canvas) {
    this._canvas = canvas
    this._raf    = null

    const gl = canvas.getContext('webgl', {
      alpha:     false,   // opaque white bg rendered by shader
      antialias: false,
      depth:     false,
      stencil:   false,
    })
    if (!gl) { console.warn('[ShopBackground] WebGL not available'); return }
    this._gl = gl

    this._resize()
    window.addEventListener('resize', this._resize.bind(this))

    this._program = this._buildProgram(gl)
    if (!this._program) return

    // Fullscreen triangle strip (2 triangles = quad)
    const buf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      -1, -1,
       1, -1,
      -1,  1,
       1,  1,
    ]), gl.STATIC_DRAW)
    this._buf = buf

    const loc = gl.getAttribLocation(this._program, 'aPos')
    gl.enableVertexAttribArray(loc)
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0)
    this._aPos = loc

    this._uRes  = gl.getUniformLocation(this._program, 'uResolution')
    this._uTime = gl.getUniformLocation(this._program, 'uTime')

    this._startTime = performance.now()
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  start () {
    if (this._raf) return
    const tick = (now) => {
      this._draw(now)
      this._raf = requestAnimationFrame(tick)
    }
    this._raf = requestAnimationFrame(tick)
  }

  stop () {
    if (this._raf) { cancelAnimationFrame(this._raf); this._raf = null }
  }

  dispose () {
    this.stop()
    window.removeEventListener('resize', this._resize.bind(this))
    if (this._gl) {
      this._gl.deleteProgram(this._program)
      this._gl.deleteBuffer(this._buf)
    }
  }

  // ── Internal ────────────────────────────────────────────────────────────────

  _resize () {
    const dpr = Math.min(window.devicePixelRatio, 2)
    const w   = window.innerWidth
    const h   = window.innerHeight
    this._canvas.width  = w * dpr
    this._canvas.height = h * dpr
    if (this._gl) this._gl.viewport(0, 0, w * dpr, h * dpr)
    this._w = w * dpr
    this._h = h * dpr
  }

  _draw (now) {
    const gl = this._gl
    if (!gl) return

    const t = (now - this._startTime) * 0.001   // seconds

    gl.useProgram(this._program)
    gl.uniform2f(this._uRes, this._w, this._h)
    gl.uniform1f(this._uTime, t)

    gl.bindBuffer(gl.ARRAY_BUFFER, this._buf)
    gl.vertexAttribPointer(this._aPos, 2, gl.FLOAT, false, 0, 0)
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
  }

  _buildProgram (gl) {
    const vert = /* glsl */`
      attribute vec2 aPos;
      void main () {
        gl_Position = vec4(aPos, 0.0, 1.0);
      }
    `

    // ── Fragment shader — depth-perspective dot grid ─────────────────────────
    //
    // Coordinate system:
    //   uv.y = 0  →  top of screen  (far / horizon)
    //   uv.y = 1  →  bottom of screen (close / foreground)
    //
    // Depth mapping (quadratic):
    //   near top    → tiny, barely-visible dots, tightly packed
    //   near bottom → larger, slightly more visible, spread apart
    //
    // "Vertical black dots in rows" = regular grid with equal physical
    // column and row pitch, rendered as circular dots.
    //
    // Two subtle animation passes keep it alive without being distracting:
    //   1. A very slow drift of the entire grid (paralax scroll feel)
    //   2. A faint per-dot twinkle / breath (±5% alpha, very slow)
    const frag = /* glsl */`
      precision mediump float;

      uniform vec2  uResolution;
      uniform float uTime;

      // ── Smooth pseudo-random (one hash per dot center) ──────────────────────
      float hash (vec2 p) {
        p = fract(p * vec2(127.1, 311.7));
        p += dot(p, p + 19.19);
        return fract(p.x * p.y);
      }

      void main () {
        // gl_FragCoord has (0,0) at bottom-left; flip so y=0 is top
        vec2 fc  = gl_FragCoord.xy;
        vec2 res = uResolution;
        float aspect = res.x / res.y;

        vec2 uv = vec2(fc.x / res.x, 1.0 - fc.y / res.y);

        // ── Depth parameter: 0 at top (far), 1 at bottom (close) ───────────
        float depth  = uv.y;
        float d2     = depth * depth;           // quadratic — more dramatic at bottom
        float d3     = d2 * depth;              // cubic for spacing (steeper at bottom)

        // ── Very slow vertical drift (≈ 1 cell every 40 s) ─────────────────
        float drift  = uTime * 0.0025;

        // ── Grid spacing ─────────────────────────────────────────────────────
        // rowSpacing is in UV-y units.
        // colSpacing in UV-x = rowSpacing / aspect → equal physical pixel pitch
        // → dots are perfectly circular without any cell correction.
        //
        // Mix range: 0.020 (18 rows near top) → 0.056 (≈11 rows near bottom)
        float rowSpacing = mix(0.020, 0.056, d3);
        float colSpacing = rowSpacing / aspect;

        // ── Grid cell (0..1 per cell, then centred at origin) ──────────────
        float col = uv.x / colSpacing;
        float row = (uv.y + drift) / rowSpacing;

        vec2  cell     = fract(vec2(col, row)) - 0.5;
        vec2  cellId   = floor(vec2(col, row));   // unique id per dot

        // ── Dot radius ───────────────────────────────────────────────────────
        // Fraction of cell half-extent (0.5 = fills cell edge-to-edge).
        // Range: barely a speck at top, small solid circle at bottom.
        float radius = mix(0.09, 0.27, d2);
        float soft   = mix(0.018, 0.048, d2);

        // ── Alpha ─────────────────────────────────────────────────────────────
        // Keep everything very faint — 0.03…0.10 range.
        // Per-dot breath: each dot pulses at its own phase (very slow, ±8%).
        float phase = hash(cellId) * 6.2832;
        float breath = 0.92 + 0.08 * sin(uTime * 0.4 + phase);

        float baseAlpha = mix(0.025, 0.095, d2) * breath;

        // Fade dots in smoothly from top so there's no hard cutoff edge
        float topFade = smoothstep(0.0, 0.10, depth);

        // ── Dot mask ─────────────────────────────────────────────────────────
        float dist    = length(cell);
        float dotMask = 1.0 - smoothstep(radius - soft, radius + soft, dist);

        float alpha = dotMask * baseAlpha * topFade;

        // Output: white background with black dots composited in
        // (opaque canvas, no alpha blending needed)
        float lum = 1.0 - alpha;
        gl_FragColor = vec4(lum, lum, lum, 1.0);
      }
    `

    const vs = this._compile(gl, gl.VERTEX_SHADER,   vert)
    const fs = this._compile(gl, gl.FRAGMENT_SHADER, frag)
    if (!vs || !fs) return null

    const prog = gl.createProgram()
    gl.attachShader(prog, vs)
    gl.attachShader(prog, fs)
    gl.linkProgram(prog)
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.error('[ShopBackground] Link error:', gl.getProgramInfoLog(prog))
      return null
    }
    return prog
  }

  _compile (gl, type, src) {
    const sh = gl.createShader(type)
    gl.shaderSource(sh, src)
    gl.compileShader(sh)
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      console.error('[ShopBackground] Shader error:', gl.getShaderInfoLog(sh))
      gl.deleteShader(sh)
      return null
    }
    return sh
  }
}
