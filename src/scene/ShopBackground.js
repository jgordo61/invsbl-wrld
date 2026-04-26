/**
 * ShopBackground
 *
 * Renders a regular grid of perfectly circular black dots onto a
 * dedicated transparent fullscreen canvas behind the shop UI.
 * Gaussian blur is applied via CSS filter on the canvas element.
 */
export class ShopBackground {
  constructor (canvas) {
    this._canvas = canvas
    this._raf    = null

    const gl = canvas.getContext('webgl', {
      alpha: true,   // transparent so white body shows through between dots
      antialias: false,
      depth: false,
      stencil: false,
      premultipliedAlpha: false,
    })
    if (!gl) { console.warn('[ShopBackground] WebGL not available'); return }
    this._gl = gl

    // Transparent clear
    gl.clearColor(0, 0, 0, 0)

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

    this._drawOnce()
  }

  start ()   {}
  stop ()    {}
  dispose () {
    window.removeEventListener('resize', this._resize.bind(this))
    if (this._gl) {
      this._gl.deleteProgram(this._program)
      this._gl.deleteBuffer(this._buf)
    }
  }

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
    gl.clear(gl.COLOR_BUFFER_BIT)
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
        // halved dot count (×√2 pitch) → 56 * 1.414 ≈ 79px
        float pitch  = 79.0;
        // 20% smaller → 2.88 * 0.8 = 2.3px
        float radius = 2.3;
        float soft   = 1.0;

        vec2 px     = gl_FragCoord.xy;
        vec2 cell   = mod(px, pitch);
        vec2 offset = cell - pitch * 0.5;

        float dist    = length(offset);
        float dotMask = 1.0 - smoothstep(radius - soft, radius + soft, dist);

        // Layer 1 — soft blooming dots
        float centerFalloff = 1.0 - smoothstep(0.0, radius * 9.0, dist);
        float alpha1 = dotMask * mix(0.06, 0.99, centerFalloff);

        // Layer 2 — plain black dots, same grid, no falloff
        float radius2 = 3.0;
        float soft2   = 0.8;
        float dotMask2 = 1.0 - smoothstep(radius2 - soft2, radius2 + soft2, dist);
        float alpha2   = dotMask2 * 0.90;

        // Composite both layers (Porter-Duff over)
        float alpha = 1.0 - (1.0 - alpha1) * (1.0 - alpha2);

        gl_FragColor = vec4(0.0, 0.0, 0.0, alpha);
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
