export class VignetteFX {
  constructor(parentEl) {
    this.canvas = document.createElement('canvas');
    Object.assign(this.canvas.style, {
      position: 'absolute', inset: '0', pointerEvents: 'none', zIndex: '2'
    });
    parentEl.appendChild(this.canvas);
    this.gl = this.canvas.getContext('webgl', { premultipliedAlpha: false });
    this.strength = 0.0; // 0..1 darkness amount
    this.target = 0.0;
    this.running = true;
    this._init();
    this._resize();
    window.addEventListener('resize', () => this._resize(), { passive: true });
  }
  _init() {
    const gl = this.gl; if (!gl) return;
    const vs = `attribute vec2 p;void main(){gl_Position=vec4(p,0.0,1.0);} `;
    const fs = `
precision highp float;
uniform vec2 r; uniform float t; uniform float k;
float hash(vec2 p){return fract(sin(dot(p,vec2(41.3,289.1)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
  float a=hash(i),b=hash(i+vec2(1,0)),c=hash(i+vec2(0,1)),d=hash(i+vec2(1,1));
  return mix(mix(a,b,f.x),mix(c,d,f.x),f.y);
}
void main(){
  vec2 uv = gl_FragCoord.xy / r;
  vec2 q = uv*2.0 - 1.0;
  q.x *= r.x/r.y;
  float d = length(q); // distance from center
  float vign = smoothstep(0.55, 0.9, d); // edge mask
  float n = noise(uv*2.5 + t*0.03) * 0.15;
  float alpha = clamp((vign + n) * k, 0.0, 1.0);
  gl_FragColor = vec4(0.0, 0.0, 0.0, alpha);
}`;
    const prog = gl.createProgram();
    const v = this._shader(gl.VERTEX_SHADER, vs);
    const f = this._shader(gl.FRAGMENT_SHADER, fs);
    gl.attachShader(prog, v); gl.attachShader(prog, f); gl.linkProgram(prog);
    this.prog = prog;
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'p');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    this.uR = gl.getUniformLocation(prog, 'r');
    this.uT = gl.getUniformLocation(prog, 't');
    this.uK = gl.getUniformLocation(prog, 'k');
    gl.disable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    this.start = performance.now();
  }
  _shader(t, s){ const sh=this.gl.createShader(t); this.gl.shaderSource(sh,s); this.gl.compileShader(sh); return sh; }
  _resize(){
    const dpr = Math.min(window.devicePixelRatio||1, 1.5);
    const w = Math.floor(innerWidth*dpr), h = Math.floor(innerHeight*dpr);
    if (this.canvas.width!==w || this.canvas.height!==h){
      this.canvas.width=w; this.canvas.height=h;
      this.canvas.style.width=innerWidth+'px'; this.canvas.style.height=innerHeight+'px';
    }
  }
  render(){
    if (!this.running || !this.gl) return;
    // ease strength toward target
    this.strength += (this.target - this.strength) * 0.12;
    const gl=this.gl;
    gl.viewport(0,0,this.canvas.width,this.canvas.height);
    gl.useProgram(this.prog);
    gl.uniform2f(this.uR, this.canvas.width, this.canvas.height);
    gl.uniform1f(this.uT, (performance.now()-this.start)/1000.0);
    gl.uniform1f(this.uK, this.strength);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
  fadeIn(ms=800, to=0.8){
    this.target = Math.max(0, Math.min(1, to));
    // render loop is driven externally each frame
  }
  fadeOut(ms=600){
    this.target = 0.0;
  }
  stop(){
    this.running = false;
    this.canvas.remove();
    window.removeEventListener('resize', this._resize);
  }
}

