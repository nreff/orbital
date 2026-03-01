/**
 * UI — manages the sidebar DOM panel.
 * Reads sliders, exposes current config, updates body list.
 *
 * Size model: one slider controls radius (3–40 px).
 * Mass is auto-computed as DENSITY × r³, so bigger bodies are heavier.
 */

const DENSITY = 100 / (8 ** 3); // r=8 → mass≈100
const STAR_DEFAULT_COLOR = '#ffe066';
const PLANET_DEFAULT_COLOR = '#4fc3f7';

export class UI {
  constructor(onPause, onReset, onRemoveBody, onModeChange, onPreset, onSave, onLoad) {
    this._onPause      = onPause;
    this._onReset      = onReset;
    this._onRemoveBody = onRemoveBody;
    this._onModeChange = onModeChange;
    this._onPreset     = onPreset;
    this._onSave       = onSave;
    this._onLoad       = onLoad;
    this._bodyType     = 'planet';
    this._simMode      = 'star';

    this._showPredictor  = true;
    this._showVelArrows  = false;
    this._explosions     = false;

    this._sizeSlider     = document.getElementById('size-slider');
    this._sizeReadout    = document.getElementById('size-readout');
    this._massReadout    = document.getElementById('mass-readout');
    this._colorPicker    = document.getElementById('color-picker');
    this._previewCanvas  = document.getElementById('body-preview');
    this._starMassSlider = document.getElementById('star-mass-slider');
    this._starMassValue  = document.getElementById('star-mass-value');
    this._starControls   = document.getElementById('star-controls');
    this._speedSlider    = document.getElementById('speed-slider');
    this._speedValue     = document.getElementById('speed-value');
    this._btnPause       = document.getElementById('btn-pause');
    this._btnReset       = document.getElementById('btn-reset');
    this._btnModeStar    = document.getElementById('btn-mode-star');
    this._btnModeFree    = document.getElementById('btn-mode-free');
    this._bodyList       = document.getElementById('body-list');
    this._bodyCount      = document.getElementById('body-count');

    this._sizeSlider.addEventListener('input',  () => this._onSizeChange());
    this._colorPicker.addEventListener('input', () => this._drawPreview());
    this._speedSlider.addEventListener('input', () => this._onSpeedChange());
    this._starMassSlider.addEventListener('input', () => this._updateStarMassLabel());
    this._btnPause.addEventListener('click', () => this._onPause());
    this._btnReset.addEventListener('click', () => this._onReset());
    this._btnModeStar.addEventListener('click', () => this._selectMode('star'));
    this._btnModeFree.addEventListener('click', () => this._selectMode('freeform'));

    this._btnTypePlanet = document.getElementById('btn-type-planet');
    this._btnTypeStar   = document.getElementById('btn-type-star');
    this._btnTypePlanet.addEventListener('click', () => this._selectBodyType('planet'));
    this._btnTypeStar.addEventListener('click',   () => this._selectBodyType('star'));

    // Save / Load
    document.getElementById('btn-save').addEventListener('click', () => this._onSave());
    document.getElementById('btn-load').addEventListener('click', () => this._onLoad());

    // Display toggles
    this._btnPredictor  = document.getElementById('btn-predictor');
    this._btnVelArrows  = document.getElementById('btn-vel-arrows');
    this._btnPredictor.addEventListener('click', () => {
      this._showPredictor = !this._showPredictor;
      this._btnPredictor.classList.toggle('active', this._showPredictor);
    });
    this._btnVelArrows.addEventListener('click', () => {
      this._showVelArrows = !this._showVelArrows;
      this._btnVelArrows.classList.toggle('active', this._showVelArrows);
    });

    this._btnExplosions = document.getElementById('btn-explosions');
    this._btnExplosions.addEventListener('click', () => {
      this._explosions = !this._explosions;
      this._btnExplosions.classList.toggle('active', this._explosions);
    });

    // Presets
    for (const btn of document.querySelectorAll('.preset-btn')) {
      btn.addEventListener('click', () => this._onPreset(btn.dataset.preset));
    }

    this._onSizeChange();
    this._updateStarMassLabel();
    this._onSpeedChange();
  }

  /** Current new-body config derived from UI controls. */
  get config() {
    const r        = +this._sizeSlider.value;
    const starMass = this._sliderToStarMass(+this._starMassSlider.value);
    return {
      radius:           r,
      // Star-type bodies get star-scale mass so they have real gravitational pull
      mass:             this._bodyType === 'star' ? starMass : this._radiusToMass(r),
      newBodyColor:     this._colorPicker.value,
      newBodyRadius:    r,
      type:             this._bodyType,
      starMass,
      timeScale:        Math.pow(2, +this._speedSlider.value),
      showPredictor:      this._showPredictor,
      showVelocityArrows: this._showVelArrows,
      explosions:         this._explosions,
    };
  }

  /** Call when pause state changes. */
  setPaused(paused) {
    this._btnPause.textContent = paused ? 'Resume' : 'Pause';
    this._btnPause.classList.toggle('active', paused);
  }

  /** Set star mass slider to match the given mass value. */
  setStarMass(mass) {
    const v = (Math.log10(mass) - 4) * 100 / 3;
    this._starMassSlider.value = Math.round(Math.max(0, Math.min(100, v)));
    this._updateStarMassLabel();
  }

  /** Set the sim mode (star/freeform) via the UI. */
  setSimMode(mode) {
    this._selectMode(mode);
  }

  /**
   * Refresh the body list panel.
   * @param {CelestialBody[]} bodies
   */
  updateBodyList(bodies) {
    this._bodyCount.textContent = `(${bodies.length})`;

    // Remove stale items
    for (const el of [...this._bodyList.querySelectorAll('li')]) {
      if (!bodies.some(b => String(b.id) === el.dataset.id)) el.remove();
    }

    // Add or update
    for (const b of bodies) {
      const sid = String(b.id);
      let li = this._bodyList.querySelector(`li[data-id="${sid}"]`);
      if (!li) {
        li = this._makeBodyItem(b);
        this._bodyList.appendChild(li);
      }
      const speed = Math.sqrt(b.velocity.vx ** 2 + b.velocity.vy ** 2);
      li.querySelector('.body-vel').textContent = `v=${speed.toFixed(1)} px/s  m=${Math.round(b.mass)}`;
    }
  }

  // ── Private ───────────────────────────────────────────────────────────────

  _selectMode(mode) {
    this._simMode = mode;
    this._btnModeStar.classList.toggle('active', mode === 'star');
    this._btnModeFree.classList.toggle('active', mode === 'freeform');
    this._updateStarControlsVisibility();
    this._onModeChange(mode);
  }

  _selectBodyType(type) {
    this._bodyType = type;
    this._btnTypePlanet.classList.toggle('active', type === 'planet');
    this._btnTypeStar.classList.toggle('active',   type === 'star');
    if (type === 'star')   this._colorPicker.value = STAR_DEFAULT_COLOR;
    if (type === 'planet') this._colorPicker.value = PLANET_DEFAULT_COLOR;
    this._updateStarControlsVisibility();
    this._updateMassReadout();
    this._drawPreview();
  }

  // Star controls are shown when there's a central star OR when placing a star
  _updateStarControlsVisibility() {
    const show = this._simMode === 'star' || this._bodyType === 'star';
    this._starControls.classList.toggle('hidden', !show);
  }

  _onSizeChange() {
    const r = +this._sizeSlider.value;
    this._sizeReadout.textContent = `${r} px`;
    this._updateMassReadout();
    this._drawPreview();
  }

  _updateStarMassLabel() {
    const m = this._sliderToStarMass(+this._starMassSlider.value);
    this._starMassValue.textContent = m.toLocaleString();
    this._updateMassReadout(); // star mass slider affects placed-star mass too
  }

  _updateMassReadout() {
    const r = +this._sizeSlider.value;
    const m = this._bodyType === 'star'
      ? this._sliderToStarMass(+this._starMassSlider.value)
      : this._radiusToMass(r);
    this._massReadout.textContent = m.toLocaleString();
  }

  _drawPreview() {
    const canvas = this._previewCanvas;
    const ctx    = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    const cx = w / 2;
    const cy = h / 2;

    ctx.clearRect(0, 0, w, h);

    const r     = +this._sizeSlider.value;
    const color = this._colorPicker.value;
    const maxR  = Math.min(w, h) * 0.28; // leave room for corona
    const drawR = Math.min(r, maxR);

    if (this._bodyType === 'star') {
      // Corona
      const coronaR = Math.min(drawR * 3.5, Math.min(w, h) * 0.48);
      const corona = ctx.createRadialGradient(cx, cy, drawR * 0.5, cx, cy, coronaR);
      corona.addColorStop(0,   hexToRgba(color, 0.25));
      corona.addColorStop(0.4, hexToRgba(color, 0.1));
      corona.addColorStop(1,   hexToRgba(color, 0));
      ctx.beginPath();
      ctx.arc(cx, cy, coronaR, 0, Math.PI * 2);
      ctx.fillStyle = corona;
      ctx.fill();
      // Inner glow
      const ig = ctx.createRadialGradient(cx, cy, 0, cx, cy, drawR * 2);
      ig.addColorStop(0, hexToRgba(color, 0.7));
      ig.addColorStop(1, hexToRgba(color, 0));
      ctx.beginPath();
      ctx.arc(cx, cy, drawR * 2, 0, Math.PI * 2);
      ctx.fillStyle = ig;
      ctx.fill();
      // Disc
      const disc = ctx.createRadialGradient(cx - drawR * 0.25, cy - drawR * 0.25, 0, cx, cy, drawR);
      disc.addColorStop(0,   '#fffde0');
      disc.addColorStop(0.5, color);
      disc.addColorStop(1,   color);
      ctx.beginPath();
      ctx.arc(cx, cy, drawR, 0, Math.PI * 2);
      ctx.fillStyle = disc;
      ctx.fill();
    } else {
      // Glow
      const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, drawR * 2.5);
      glow.addColorStop(0, hexToRgba(color, 0.4));
      glow.addColorStop(1, hexToRgba(color, 0));
      ctx.beginPath();
      ctx.arc(cx, cy, drawR * 2.5, 0, Math.PI * 2);
      ctx.fillStyle = glow;
      ctx.fill();
      // Solid body
      ctx.beginPath();
      ctx.arc(cx, cy, drawR, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      // Specular highlight
      const spec = ctx.createRadialGradient(cx - drawR * 0.3, cy - drawR * 0.3, 0, cx, cy, drawR);
      spec.addColorStop(0, 'rgba(255,255,255,0.45)');
      spec.addColorStop(0.5, 'rgba(255,255,255,0)');
      spec.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.beginPath();
      ctx.arc(cx, cy, drawR, 0, Math.PI * 2);
      ctx.fillStyle = spec;
      ctx.fill();
    }
  }

  _makeBodyItem(b) {
    const li = document.createElement('li');
    li.className = 'body-item';
    li.dataset.id = String(b.id);

    const dot = document.createElement('span');
    dot.className = 'body-dot';
    dot.style.background = b.color;

    const info = document.createElement('div');
    info.className = 'body-info';

    const name = document.createElement('div');
    name.className = 'body-name';
    name.textContent = b.type === 'star' ? `⭐ Star #${b.id}` : `Body #${b.id}`;

    const vel = document.createElement('div');
    vel.className = 'body-vel';
    vel.textContent = 'v=0 px/s';

    const btn = document.createElement('button');
    btn.className = 'body-remove';
    btn.textContent = '✕';
    btn.title = 'Remove body';
    btn.addEventListener('click', () => this._onRemoveBody(b.id));

    info.append(name, vel);
    li.append(dot, info, btn);
    return li;
  }

  _onSpeedChange() {
    const scale = Math.pow(2, +this._speedSlider.value);
    this._speedValue.textContent = `${parseFloat(scale.toPrecision(3))}×`;
  }

  _radiusToMass(r) {
    return Math.max(1, Math.round(DENSITY * r ** 3));
  }

  _sliderToStarMass(v) {
    // Logarithmic: 0 → 10^4 (10k), 100 → 10^7 (10M)
    return Math.round(10 ** (4 + v / 100 * 3));
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
