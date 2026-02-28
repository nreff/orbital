import { CelestialBody, Star } from './Body.js';
import { Physics }  from './Physics.js';
import { Renderer } from './Renderer.js';
import { Input }    from './Input.js';
import { UI }       from './UI.js';

const ESCAPE_RADIUS = 5000;
const UI_REFRESH_INTERVAL = 6; // update body list every N frames (~10 fps)

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

    // Placeholder position; corrected in first rAF when layout is guaranteed
    this.star = new Star(0, 0);

    this._physics  = new Physics();
    this._renderer = new Renderer(canvas);
    this._input    = new Input(canvas);
    this._ui       = new UI(
      () => this.togglePause(),
      () => this.reset(),
      (id) => this._removeBody(id),
      (mode) => this._setMode(mode),
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

    // 2. Physics — pass null star in freeform mode
    const activeStar = this.mode === 'star' ? this.star : null;
    if (activeStar) {
      // Keep star mass in sync with the slider
      activeStar.mass = this._ui.config.starMass;
    }
    if (!this.paused && dt > 0) {
      this._physics.step(this.bodies, activeStar, dt);
    }

    // 3. Escape detection (measured from star in star-mode, canvas centre in freeform)
    const escSq = ESCAPE_RADIUS * ESCAPE_RADIUS;
    const ecx = activeStar ? activeStar.position.x : this.canvas.width  / 2;
    const ecy = activeStar ? activeStar.position.y : this.canvas.height / 2;
    for (const b of this.bodies) {
      const dx = b.position.x - ecx;
      const dy = b.position.y - ecy;
      if (dx * dx + dy * dy > escSq) b.escaped = true;
    }

    // 4. Prune escaped / merged bodies
    this.bodies = this.bodies.filter(b => !b.escaped && !b.merged);

    // 5. Render
    this._renderer.draw(this.bodies, activeStar, this._input.placement, this._ui.config);

    // 6. UI body list (throttled)
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

  // ── Body management ───────────────────────────────────────────────────────

  _spawnBody(intent) {
    const { x, y, vx, vy } = intent;
    const cfg = this._ui.config;

    // In star mode: don't spawn inside the star
    if (this.mode === 'star') {
      const dx = x - this.star.position.x;
      const dy = y - this.star.position.y;
      if (Math.sqrt(dx * dx + dy * dy) < this.star.radius + cfg.radius) return;
    }

    this.bodies.push(new CelestialBody({
      x, y, vx, vy,
      mass:   cfg.mass,
      radius: cfg.radius,
      color:  cfg.newBodyColor,
      type:   cfg.type,
    }));
  }

  _removeBody(id) {
    this.bodies = this.bodies.filter(b => b.id !== id);
    this._ui.updateBodyList(this.bodies);
  }

  _onResize() {
    const rect = this.canvas.getBoundingClientRect();
    this.star.position.x = rect.width  / 2;
    this.star.position.y = rect.height / 2;
    this._renderer._resize();
  }
}
