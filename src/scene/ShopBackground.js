/**
 * ShopBackground
 *
 * Renders a regular grid of faint, perfectly circular black dots
 * onto a dedicated fullscreen canvas that sits behind the shop UI.
 */
export class ShopBackground {
  constructor (canvas) {
    this._canvas = canvas
    this._raf    = null

    const gl = canvas.getContext('webgl', {
      alpha: false, antialias: false, depth: false, stencil: false,
    })
    if (!gl) { console.warn('[ShopBackground] WebGL not available'); return }
    this._gl = gl

    this._resize()
    window.addEventListener('resize', this._resize.bind(this))

    this._program = this._buildProgram(gl)
    if (!this._program) return

    const buf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      -1, -1,  1, -1,  -1, 1,  1, 1,
    ]), gl.STATIC_DRAW)
    this._buf = buf

    const loc = gl.getAttribLocation(this._program, 'aPos')
    gl.enableVertexAttribArray(loc)
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0)
    this._aPos = loc

    this._uRes = gl.getUniformLocation(this._program, 'uResolution')

    // Draw once — static pattern, no animation loop needed
    this._drawOnce()
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  /** Call when the shop becomes visible. */
  start () {
    // Pattern is static; just ensure one draw has happened (already done in constructor
    // and after each resize). Nothing to loop.
  }

  stop ()    {}
  dispose () {
    window.removeEventListener('resize', this._resize.bind(this))
    if (this._gl) {
      this._gl.deleteProgram(this._program)
      this._gl.deleteBuffer(this._buf)
    }
  }

  // ── Internal ────────────────────────────────────────────────────────────────

  _resize () {
    const dpr = Math.min(window.devicePixelRatio, 2)
    this._canvas.width  = window.innerWidth  * dpr
    this._canvas.height = window.innerHeight * dpr
    if (this._gl) {
      this._gl.viewport(0, 0, this._canvas.width, this._canvas.height)
      this._drawOnce()
    }
  }

  _drawOnce () {
    const gl = this._gl
    if (!gl || !this._program) return
    gl.useProgram(this._program)
    gl.uniform2f(this._uRes, this._canvas.width, this._canvas.height)
    gl.bindBuffer(gl.ARRAY_BUFFER, this._buf)
    gl.vertexAttribPointer(this._aPos, 2, gl.FLOAT, false, 0, 0)
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
  }

  _buildProgram (gl) {
    const vert = `
      attribute vec2 aPos;
      void main () { gl_Position = vec4(aPos, 0.0, 1.0); }
    `

    const frag = `
      precision mediump float;
      uniform vec2 uResolution;

      void main () {
        // Physical dot pitch in pixels — same in x and y → square grid
        float pitch = 28.0;

        // Dot radius and softness in pixels
        float radius = 2.0;
        float soft   = 0.8;

        // Position of this fragment in pixel space
        vec2 px = gl_FragCoord.xy;

        // Nearest dot centre
        vec2 cell   = mod(px, pitch);
        vec2 offset = cell - pitch * 0.5;  // (-pitch/2 .. pitch/2)

        float dist    = length(offset);
        float dotMask = 1.0 - smoothstep(radius - soft, radius + soft, dist);

        // Very faint black on white
        float lum = 1.0 - dotMask * 0.10;
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
