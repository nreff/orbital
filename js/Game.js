import { CelestialBody, Star } from './Body.js';
import { Physics }  from './Physics.js';
import { Renderer } from './Renderer.js';
import { Input }    from './Input.js';
import { UI }       from './UI.js';
import { PRESETS }  from './Presets.js';

const ESCAPE_RADIUS = 5000;
const UI_REFRESH_INTERVAL = 6; // update body list every N frames (~10 fps)
const DENSITY = 100 / (8 ** 3); // matches UI.js

export class Game {
  constructor(canvas) {
    this.canvas  = canvas;
    this.bodies  = [];
    this.paused  = false;
    this.mode    = 'star'; // 'star' | 'freeform'

    this._frameCount = 0;
    this._rafId      = null;
    this._lastTime   = null;
    this._centred    = false; // deferred star centering (layout not guaranteed at construction)

    // Camera: world→screen:  sx = wx * zoom + panX
    this.camera = { panX: 0, panY: 0, zoom: 1 };

    this._inspectedId = null;

    // Placeholder position; corrected in first rAF when layout is guaranteed
    this.star = new Star(0, 0);

    this._physics  = new Physics();
    this._renderer = new Renderer(canvas);
    this._input    = new Input(canvas, this.camera);
    this._ui       = new UI(
      () => this.togglePause(),
      () => this.reset(),
      (id) => this._removeBody(id),
      (mode) => this._setMode(mode),
      (name) => this._applyPreset(name),
      () => this._save(),
      () => this._load(),
    );

    window.addEventListener('resize', () => this._onResize());
  }

  start() {
    this._lastTime = null;
    this._rafId = requestAnimationFrame((ts) => this._loop(ts));
  }

  stop() {
    if (this._rafId !== null) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }
  }

  togglePause() {
    this.paused = !this.paused;
    this._ui.setPaused(this.paused);
    if (!this.paused && this._rafId === null) {
      this._lastTime = null;
      this._rafId = requestAnimationFrame((ts) => this._loop(ts));
    }
  }

  reset() {
    this.bodies = [];
    this._inspectedId = null;
    this._ui.updateBodyList([]);
  }

  // ── Main loop ─────────────────────────────────────────────────────────────

  _loop(timestamp) {
    this._rafId = requestAnimationFrame((ts) => this._loop(ts));

    // Fix star position on very first frame — getBoundingClientRect() is
    // reliable inside rAF whereas clientWidth at construction time may lag
    // behind CSS flex layout, causing the star to appear off-centre.
    if (!this._centred) {
      const rect = this.canvas.getBoundingClientRect();
      this.star.position.x = rect.width  / 2;
      this.star.position.y = rect.height / 2;
      this._renderer._resize();
      this._centred = true;
    }

    let dt = 0;
    if (this._lastTime !== null) {
      dt = (timestamp - this._lastTime) / 1000;
      if (dt > 0.1) dt = 0.1; // cap after tab unfocus
      dt *= this._ui.config.timeScale;
    }
    this._lastTime = timestamp;

    // 1. Consume placement intents
    if (!this.paused) {
      for (const intent of this._input.flush()) {
        this._spawnBody(intent);
      }
    } else {
      this._input.flush(); // discard while paused
    }

    // 2. Process click intents (works even when paused)
    for (const click of this._input.flushClicks()) {
      const { x: wx, y: wy } = this._screenToWorld(click.x, click.y);
      let found = null;
      for (const b of this.bodies) {
        const dx = b.position.x - wx;
        const dy = b.position.y - wy;
        if (Math.sqrt(dx * dx + dy * dy) < b.radius + 8) { found = b; break; }
      }
      this._inspectedId = found ? found.id : null;
    }

    // 3. Physics — pass null star in freeform mode
    const activeStar = this.mode === 'star' ? this.star : null;
    if (activeStar) {
      // Keep star mass in sync with the slider
      activeStar.mass = this._ui.config.starMass;
    }
    if (!this.paused && dt > 0) {
      const { fragments } = this._physics.step(
        this.bodies, activeStar, dt,
        { explosions: this._ui.config.explosions },
      );
      for (const f of fragments) {
        this.bodies.push(new CelestialBody(f));
      }
    }

    // 4. Escape detection (measured from star in star-mode, canvas centre in freeform)
    const escSq = ESCAPE_RADIUS * ESCAPE_RADIUS;
    const ecx = activeStar ? activeStar.position.x : this.canvas.width  / 2;
    const ecy = activeStar ? activeStar.position.y : this.canvas.height / 2;
    for (const b of this.bodies) {
      const dx = b.position.x - ecx;
      const dy = b.position.y - ecy;
      if (dx * dx + dy * dy > escSq) b.escaped = true;
    }

    // 5. Prune escaped / merged bodies
    this.bodies = this.bodies.filter(b => !b.escaped && !b.merged);

    // 6. Render
    const inspectedBody = this.bodies.find(b => b.id === this._inspectedId) ?? null;
    this._renderer.draw(
      this.bodies, activeStar,
      this._input.placement, this._ui.config,
      this.camera, inspectedBody,
    );

    // 7. UI body list (throttled)
    this._frameCount++;
    if (this._frameCount % UI_REFRESH_INTERVAL === 0) {
      this._ui.updateBodyList(this.bodies);
    }
  }

  // ── Mode ──────────────────────────────────────────────────────────────────

  _setMode(mode) {
    this.mode = mode;
    // Invalidate background gradient so it redraws centred correctly
    this._renderer._bgGradient = null;
  }

  // ── Presets ───────────────────────────────────────────────────────────────

  _applyPreset(name) {
    const preset = PRESETS[name];
    if (!preset) return;
    const mode = preset.mode ?? 'star';
    this._ui.setSimMode(mode);
    this._setMode(mode);
    if (mode === 'star') this._ui.setStarMass(preset.starMass ?? 1_000_000);
    this.bodies = [];
    this._inspectedId = null;
    this.camera.panX = 0;
    this.camera.panY = 0;
    this.camera.zoom = 1;
    const cx = mode === 'star' ? this.star.position.x : this.canvas.width  / 2;
    const cy = mode === 'star' ? this.star.position.y : this.canvas.height / 2;
    for (const b of preset.bodies) {
      this.bodies.push(new CelestialBody({
        x: cx + b.dx, y: cy + b.dy,
        vx: b.vx, vy: b.vy,
        mass:   b.mass ?? this._massFromRadius(b.radius),
        radius: b.radius,
        color:  b.color,
        type:   b.type,
      }));
    }
  }

  _massFromRadius(r) {
    return Math.max(1, Math.round(DENSITY * r ** 3));
  }

  // ── Save / Load ───────────────────────────────────────────────────────────

  _save() {
    const refX = this.mode === 'star' ? this.star.position.x : this.canvas.width  / 2;
    const refY = this.mode === 'star' ? this.star.position.y : this.canvas.height / 2;
    const data = {
      mode:     this.mode,
      starMass: this._ui.config.starMass,
      bodies:   this.bodies.map(b => ({
        dx: b.position.x - refX, dy: b.position.y - refY,
        vx: b.velocity.vx,       vy: b.velocity.vy,
        mass: b.mass, radius: b.radius, color: b.color, type: b.type,
      })),
    };
    localStorage.setItem('orbit-save-v1', JSON.stringify(data));
  }

  _load() {
    const raw = localStorage.getItem('orbit-save-v1');
    if (!raw) return;
    const data = JSON.parse(raw);
    this._ui.setSimMode(data.mode);
    this._setMode(data.mode);
    this._ui.setStarMass(data.starMass);
    this.bodies = [];
    this._inspectedId = null;
    const refX = data.mode === 'star' ? this.star.position.x : this.canvas.width  / 2;
    const refY = data.mode === 'star' ? this.star.position.y : this.canvas.height / 2;
    for (const b of data.bodies) {
      this.bodies.push(new CelestialBody({
        x: refX + b.dx, y: refY + b.dy,
        vx: b.vx, vy: b.vy,
        mass: b.mass, radius: b.radius, color: b.color, type: b.type,
      }));
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  /** Convert screen pixel (sx, sy) to world coordinates. */
  _screenToWorld(sx, sy) {
    const { panX, panY, zoom } = this.camera;
    return { x: (sx - panX) / zoom, y: (sy - panY) / zoom };
  }

  // ── Body management ───────────────────────────────────────────────────────

  _spawnBody(intent) {
    // Intent carries screen-space position and screen-space velocity.
    // Convert both to world space using the camera.
    const { x: wx, y: wy } = this._screenToWorld(intent.x, intent.y);
    const { zoom } = this.camera;
    const vx = intent.vx / zoom;
    const vy = intent.vy / zoom;
    const cfg = this._ui.config;

    // In star mode: don't spawn inside the star
    if (this.mode === 'star') {
      const dx = wx - this.star.position.x;
      const dy = wy - this.star.position.y;
      if (Math.sqrt(dx * dx + dy * dy) < this.star.radius + cfg.radius) return;
    }

    this.bodies.push(new CelestialBody({
      x: wx, y: wy, vx, vy,
      mass:   cfg.mass,
      radius: cfg.radius,
      color:  cfg.newBodyColor,
      type:   cfg.type,
    }));
  }

  _removeBody(id) {
    this.bodies = this.bodies.filter(b => b.id !== id);
    if (this._inspectedId === id) this._inspectedId = null;
    this._ui.updateBodyList(this.bodies);
  }

  _onResize() {
    const rect = this.canvas.getBoundingClientRect();
    this.star.position.x = rect.width  / 2;
    this.star.position.y = rect.height / 2;
    this.camera.panX = 0;
    this.camera.panY = 0;
    this._renderer._resize();
  }
}
