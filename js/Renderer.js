const STAR_CORONA_RADIUS = 80;
const STARFIELD_COUNT = 200;

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this._starfield = null;
    this._bgGradient = null;
    this._resize();
  }

  /** Call on window resize. */
  _resize() {
    this.canvas.width = this.canvas.clientWidth;
    this.canvas.height = this.canvas.clientHeight;
    this._bgGradient = null; // invalidate cache
    this._starfield = this._generateStarfield();
  }

  _generateStarfield() {
    const stars = [];
    for (let i = 0; i < STARFIELD_COUNT; i++) {
      stars.push({
        x: Math.random() * this.canvas.width,
        y: Math.random() * this.canvas.height,
        r: Math.random() * 1.2 + 0.2,
        a: Math.random() * 0.7 + 0.3,
      });
    }
    return stars;
  }

  /**
   * Main draw call — invoked once per animation frame.
   * @param {CelestialBody[]} bodies
   * @param {Star} star
   * @param {object} placement   — from Input.placement
   * @param {object} config      — { newBodyColor }
   */
  draw(bodies, star, placement, config) {
    const { ctx, canvas } = this;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    this._drawBackground(star);
    this._drawTrails(bodies);
    this._drawBodies(bodies);
    if (star) this._drawStar(star);
    this._drawPlacement(placement, star, config);
  }

  // ── Background ────────────────────────────────────────────────────────────

  _drawBackground(star) {
    const { ctx, canvas } = this;

    // Deep space gradient centred on star (or canvas centre in freeform)
    if (!this._bgGradient) {
      const cx = star ? star.position.x : canvas.width  / 2;
      const cy = star ? star.position.y : canvas.height / 2;
      const g = ctx.createRadialGradient(
        cx, cy, 0,
        cx, cy, Math.max(canvas.width, canvas.height) * 0.8
      );
      g.addColorStop(0, '#0e0e20');
      g.addColorStop(1, '#05050e');
      this._bgGradient = g;
    }
    ctx.fillStyle = this._bgGradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Static starfield
    for (const s of this._starfield) {
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255,255,255,${s.a})`;
      ctx.fill();
    }
  }

  // ── Trails ────────────────────────────────────────────────────────────────

  _drawTrails(bodies) {
    const { ctx } = this;
    for (const b of bodies) {
      if (b.trail.length < 2) continue;
      const n = b.trail.length;
      for (let i = 1; i < n; i++) {
        const t = i / n; // 0→old, 1→newest
        ctx.beginPath();
        ctx.moveTo(b.trail[i - 1].x, b.trail[i - 1].y);
        ctx.lineTo(b.trail[i].x, b.trail[i].y);
        ctx.strokeStyle = hexToRgba(b.color, t * 0.55);
        ctx.lineWidth = Math.max(1, b.radius * 0.18 * t);
        ctx.stroke();
      }
    }
  }

  // ── Bodies ────────────────────────────────────────────────────────────────

  _drawBodies(bodies) {
    for (const b of bodies) {
      if (b.type === 'star') {
        this._drawStarAt(b.position.x, b.position.y, b.radius, b.color);
      } else {
        this._drawPlanet(b);
      }
    }
  }

  _drawPlanet(b) {
    const { ctx } = this;
    const { x, y } = b.position;
    const r = b.radius;

    // Glow
    const glow = ctx.createRadialGradient(x, y, 0, x, y, r * 2.5);
    glow.addColorStop(0, hexToRgba(b.color, 0.35));
    glow.addColorStop(1, hexToRgba(b.color, 0));
    ctx.beginPath();
    ctx.arc(x, y, r * 2.5, 0, Math.PI * 2);
    ctx.fillStyle = glow;
    ctx.fill();

    // Solid body
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = b.color;
    ctx.fill();

    // Specular highlight
    const spec = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, 0, x, y, r);
    spec.addColorStop(0, 'rgba(255,255,255,0.45)');
    spec.addColorStop(0.5, 'rgba(255,255,255,0)');
    spec.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = spec;
    ctx.fill();
  }

  // ── Star rendering (shared by fixed star + placed star-type bodies) ────────

  /** Draw a star visual centred at (x,y) with given radius and tint color. */
  _drawStarAt(x, y, r, color) {
    const { ctx } = this;
    const coronaR = r * 3.5;

    // Outer corona
    const corona = ctx.createRadialGradient(x, y, r * 0.5, x, y, coronaR);
    corona.addColorStop(0,   hexToRgba(color, 0.22));
    corona.addColorStop(0.4, hexToRgba(color, 0.08));
    corona.addColorStop(1,   hexToRgba(color, 0));
    ctx.beginPath();
    ctx.arc(x, y, coronaR, 0, Math.PI * 2);
    ctx.fillStyle = corona;
    ctx.fill();

    // Inner glow
    const innerGlow = ctx.createRadialGradient(x, y, 0, x, y, r * 2);
    innerGlow.addColorStop(0, hexToRgba(color, 0.7));
    innerGlow.addColorStop(1, hexToRgba(color, 0));
    ctx.beginPath();
    ctx.arc(x, y, r * 2, 0, Math.PI * 2);
    ctx.fillStyle = innerGlow;
    ctx.fill();

    // Disc with hot-centre gradient
    const disc = ctx.createRadialGradient(x - r * 0.25, y - r * 0.25, 0, x, y, r);
    disc.addColorStop(0,   '#fffde0');
    disc.addColorStop(0.5, color);
    disc.addColorStop(1,   shiftHue(color, -20));
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = disc;
    ctx.fill();
  }

  _drawStar(star) {
    this._drawStarAt(star.position.x, star.position.y, star.radius, '#ffe066');
  }

  // ── Placement preview ─────────────────────────────────────────────────────

  _drawPlacement(placement, star, config) {
    if (placement.phase !== 'dragging') return;
    const { ctx } = this;
    const { anchorX, anchorY, tipX, tipY } = placement;
    const color = config.newBodyColor || '#4fc3f7';
    const radius = config.newBodyRadius || 8;

    // Ghost body at anchor
    ctx.beginPath();
    ctx.arc(anchorX, anchorY, radius, 0, Math.PI * 2);
    ctx.strokeStyle = hexToRgba(color, 0.6);
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 3]);
    ctx.stroke();
    ctx.setLineDash([]);

    // Velocity arrow
    const dx = tipX - anchorX;
    const dy = tipY - anchorY;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 2) return;

    const ux = dx / len;
    const uy = dy / len;
    const arrowLen = len;
    const headLen = Math.min(14, arrowLen * 0.35);
    const ex = anchorX + ux * arrowLen;
    const ey = anchorY + uy * arrowLen;

    ctx.beginPath();
    ctx.moveTo(anchorX, anchorY);
    ctx.lineTo(ex, ey);
    ctx.strokeStyle = hexToRgba(color, 0.85);
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Arrowhead
    const angle = Math.atan2(dy, dx);
    ctx.beginPath();
    ctx.moveTo(ex, ey);
    ctx.lineTo(ex - headLen * Math.cos(angle - 0.4), ey - headLen * Math.sin(angle - 0.4));
    ctx.lineTo(ex - headLen * Math.cos(angle + 0.4), ey - headLen * Math.sin(angle + 0.4));
    ctx.closePath();
    ctx.fillStyle = hexToRgba(color, 0.85);
    ctx.fill();

    // Speed label
    const VELOCITY_SCALE = 1.5;
    const speed = Math.round(len * VELOCITY_SCALE);
    ctx.font = '11px monospace';
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    const label = star
      ? `v=${speed}  v_circ≈${Math.round(this._circularSpeed(anchorX, anchorY, star))}`
      : `v=${speed}`;
    ctx.fillText(label, ex + 8, ey - 6);
  }

  _circularSpeed(x, y, star) {
    const dx = x - star.position.x;
    const dy = y - star.position.y;
    const r = Math.sqrt(dx * dx + dy * dy);
    if (r < 1) return 0;
    return Math.sqrt(2.0 * star.mass / r);
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function hexToRgba(hex, alpha) {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

/** Shift a hex colour toward a warmer/cooler edge for the star disc gradient. */
function shiftHue(hex, degrees) {
  const h = hex.replace('#', '');
  let r = parseInt(h.substring(0, 2), 16) / 255;
  let g = parseInt(h.substring(2, 4), 16) / 255;
  let b = parseInt(h.substring(4, 6), 16) / 255;

  // RGB → HSL
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let hue = 0, sat = 0;
  const lig = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    sat = lig > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: hue = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: hue = ((b - r) / d + 2) / 6; break;
      case b: hue = ((r - g) / d + 4) / 6; break;
    }
  }
  hue = (hue + degrees / 360 + 1) % 1;

  // HSL → RGB
  const q = lig < 0.5 ? lig * (1 + sat) : lig + sat - lig * sat;
  const p = 2 * lig - q;
  const hue2rgb = (t) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1/6) return p + (q - p) * 6 * t;
    if (t < 1/2) return q;
    if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
    return p;
  };
  r = hue2rgb(hue + 1/3);
  g = hue2rgb(hue);
  b = hue2rgb(hue - 1/3);
  const toHex = (v) => Math.round(v * 255).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}
