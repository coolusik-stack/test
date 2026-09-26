// World camera: position (world meters, y up), zoom (CSS px per meter), smooth targets.
import { clamp, damp } from './util.js';
import { WORLD } from './terrain.js';

export class Camera {
  constructor() {
    this.x = WORLD.W / 2;
    this.y = 14;
    this.zoom = 30;
    this.tx = this.x;
    this.ty = this.y;
    this.tz = this.zoom;
    this.vw = 800;
    this.vh = 400;
    this.rate = 4;
    this.manual = 0; // seconds of manual control left before auto targets resume
  }

  resize(vw, vh) {
    this.vw = vw;
    this.vh = vh;
  }

  // Zoom that shows the default play area (~27m wide on landscape phones).
  get baseZoom() {
    // portrait phones: trade some width for a less sky-heavy view
    if (this.vh > this.vw) return Math.max(this.vw / 22, this.vh / 34);
    return Math.max(12, Math.min(this.vw / 27, this.vh / 12.5));
  }

  get fitZoom() {
    return Math.min(this.vw / (WORLD.W + 2), this.vh / 26);
  }

  get minZoom() {
    return this.fitZoom * 0.95;
  }

  get maxZoom() {
    return this.baseZoom * 2.2;
  }

  focus(x, y, zoom, rate = 4) {
    this.tx = x;
    this.ty = y;
    if (zoom) this.tz = zoom;
    this.rate = rate;
  }

  snap() {
    this.x = this.tx;
    this.y = this.ty;
    this.zoom = this.tz;
    this._clamp();
  }

  update(dt) {
    if (this.manual > 0) {
      this.manual -= dt;
    } else {
      this.x = damp(this.x, this.tx, this.rate, dt);
      this.y = damp(this.y, this.ty, this.rate, dt);
      this.zoom = damp(this.zoom, this.tz, this.rate * 0.8, dt);
    }
    this._clamp();
  }

  _clamp() {
    this.zoom = clamp(this.zoom, this.minZoom, this.maxZoom);
    const hw = this.vw / 2 / this.zoom;
    const hh = this.vh / 2 / this.zoom;
    const minX = -3 + hw, maxX = WORLD.W + 3 - hw;
    this.x = minX > maxX ? WORLD.W / 2 : clamp(this.x, minX, maxX);
    const minY = WORLD.SEA - 3.5 + hh;
    const maxY = WORLD.H + 6 - hh;
    this.y = minY > maxY ? minY : clamp(this.y, minY, maxY);
  }

  pan(dxPx, dyPx) {
    this.x -= dxPx / this.zoom;
    this.y += dyPx / this.zoom;
    this.manual = 3.5;
    this._clamp();
  }

  zoomAt(factor, sx, sy) {
    const before = this.toWorld(sx, sy);
    this.zoom = clamp(this.zoom * factor, this.minZoom, this.maxZoom);
    const after = this.toWorld(sx, sy);
    this.x += before.x - after.x;
    this.y += before.y - after.y;
    this.manual = 3.5;
    this.tz = this.zoom;
    this._clamp();
  }

  toWorld(sx, sy) {
    return { x: this.x + (sx - this.vw / 2) / this.zoom, y: this.y - (sy - this.vh / 2) / this.zoom };
  }

  toScreen(x, y) {
    return { x: (x - this.x) * this.zoom + this.vw / 2, y: (this.y - y) * this.zoom + this.vh / 2 };
  }

  view() {
    const hw = this.vw / 2 / this.zoom, hh = this.vh / 2 / this.zoom;
    return { x0: this.x - hw, x1: this.x + hw, y0: this.y - hh, y1: this.y + hh };
  }

  // Canvas transform: world render-space (x, -y) → device pixels.
  apply(ctx, dpr, sx = 0, sy = 0) {
    const z = this.zoom * dpr;
    ctx.setTransform(z, 0, 0, z, (this.vw / 2 - (this.x + sx) * this.zoom) * dpr, (this.vh / 2 + (this.y + sy) * this.zoom) * dpr);
  }
}
