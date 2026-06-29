import type { Transform } from '@shared/schema'

export interface Layer {
  /** Any uploadable image source: a decoded VideoFrame or a title canvas. */
  frame: TexImageSource
  /** Native frame dimensions, for aspect-correct "contain" fitting. */
  frameWidth: number
  frameHeight: number
  transform: Transform
  /** Extra opacity multiplier for fades / cross-dissolves (default 1). */
  alpha?: number
}

const VERT = `#version 300 es
in vec2 a_pos;
in vec2 a_uv;
uniform mat3 u_matrix;
out vec2 v_uv;
void main() {
  vec3 p = u_matrix * vec3(a_pos, 1.0);
  gl_Position = vec4(p.xy, 0.0, 1.0);
  v_uv = a_uv;
}`

const FRAG = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_tex;
uniform float u_opacity;
out vec4 outColor;
void main() {
  vec4 c = texture(u_tex, v_uv);
  outColor = vec4(c.rgb, c.a * u_opacity);
}`

/**
 * WebGL2 compositor. Renders a stack of decoded video frames (bottom-to-top)
 * onto a canvas sized to the sequence, applying each clip's transform (position,
 * scale, rotation, opacity) with an aspect-correct "contain" fit.
 */
export class Compositor {
  private gl: WebGL2RenderingContext
  private program: WebGLProgram
  private texture: WebGLTexture
  private matrixLoc: WebGLUniformLocation
  private opacityLoc: WebGLUniformLocation

  constructor(private canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl2', { premultipliedAlpha: false, alpha: false })
    if (!gl) throw new Error('WebGL2 is not available')
    this.gl = gl

    this.program = this.link(VERT, FRAG)
    gl.useProgram(this.program)

    // Unit quad (two triangles) with matching UVs.
    const buffer = gl.createBuffer()!
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    // x, y, u, v
    // prettier-ignore
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      -1, -1, 0, 1,
       1, -1, 1, 1,
      -1,  1, 0, 0,
      -1,  1, 0, 0,
       1, -1, 1, 1,
       1,  1, 1, 0
    ]), gl.STATIC_DRAW)

    const posLoc = gl.getAttribLocation(this.program, 'a_pos')
    const uvLoc = gl.getAttribLocation(this.program, 'a_uv')
    gl.enableVertexAttribArray(posLoc)
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 16, 0)
    gl.enableVertexAttribArray(uvLoc)
    gl.vertexAttribPointer(uvLoc, 2, gl.FLOAT, false, 16, 8)

    this.matrixLoc = gl.getUniformLocation(this.program, 'u_matrix')!
    this.opacityLoc = gl.getUniformLocation(this.program, 'u_opacity')!

    this.texture = gl.createTexture()!
    gl.bindTexture(gl.TEXTURE_2D, this.texture)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)

    gl.enable(gl.BLEND)
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)
  }

  /** Build the column-major 2D affine matrix for one layer. */
  private matrixFor(t: Transform, fw: number, fh: number): Float32Array {
    const W = this.canvas.width
    const H = this.canvas.height
    const frameAspect = fh > 0 ? fw / fh : 1
    const canvasAspect = H > 0 ? W / H : 1

    let drawW: number
    let drawH: number
    if (frameAspect > canvasAspect) {
      drawW = W
      drawH = W / frameAspect
    } else {
      drawH = H
      drawW = H * frameAspect
    }

    const sx = (drawW / W) * t.scale
    const sy = (drawH / H) * t.scale
    const theta = (t.rotation * Math.PI) / 180
    const cos = Math.cos(theta)
    const sin = Math.sin(theta)
    const tx = (t.x / W) * 2
    const ty = -(t.y / H) * 2

    // [ cos*sx  -sin*sy  tx ]   column-major: a,b,0, c,d,0, e,f,1
    // [ sin*sx   cos*sy  ty ]
    return new Float32Array([cos * sx, sin * sx, 0, -sin * sy, cos * sy, 0, tx, ty, 1])
  }

  render(layers: Layer[]): void {
    const gl = this.gl
    gl.viewport(0, 0, this.canvas.width, this.canvas.height)
    gl.clearColor(0, 0, 0, 1)
    gl.clear(gl.COLOR_BUFFER_BIT)

    for (const layer of layers) {
      gl.bindTexture(gl.TEXTURE_2D, this.texture)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, layer.frame)
      gl.uniformMatrix3fv(
        this.matrixLoc,
        false,
        this.matrixFor(layer.transform, layer.frameWidth, layer.frameHeight)
      )
      gl.uniform1f(this.opacityLoc, layer.transform.opacity * (layer.alpha ?? 1))
      gl.drawArrays(gl.TRIANGLES, 0, 6)
    }
  }

  resize(width: number, height: number): void {
    this.canvas.width = width
    this.canvas.height = height
  }

  private link(vertSrc: string, fragSrc: string): WebGLProgram {
    const gl = this.gl
    const compile = (type: number, src: string): WebGLShader => {
      const sh = gl.createShader(type)!
      gl.shaderSource(sh, src)
      gl.compileShader(sh)
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        throw new Error(`Shader compile failed: ${gl.getShaderInfoLog(sh)}`)
      }
      return sh
    }
    const program = gl.createProgram()!
    gl.attachShader(program, compile(gl.VERTEX_SHADER, vertSrc))
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fragSrc))
    gl.linkProgram(program)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(`Program link failed: ${gl.getProgramInfoLog(program)}`)
    }
    return program
  }

  dispose(): void {
    const gl = this.gl
    gl.deleteTexture(this.texture)
    gl.deleteProgram(this.program)
  }
}
