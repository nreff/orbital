/**
 * Input — mouse/touch event handling & placement state machine.
 *
 * Phases:
 *   'idle'     → waiting for mousedown
 *   'dragging' → mousedown held, showing ghost + arrow
 *   'placed'   → mouseup, intent queued
 *
 * Camera controls:
 *   Scroll wheel → zoom centred on cursor
 *   Right-click drag → pan
 */
export class Input {
  constructor(canvas, camera) {
    this.canvas   = canvas;
    this._camera  = camera;
    this.placement = { phase: 'idle', anchorX: 0, anchorY: 0, tipX: 0, tipY: 0 };
    this._intents      = [];
    this._clickIntents = [];

    // Right-click pan state
    this._isPanning  = false;
    this._panStartX  = 0;
    this._panStartY  = 0;

    canvas.addEventListener('mousedown',   this._onDown.bind(this));
    canvas.addEventListener('mousemove',   this._onMove.bind(this));
    canvas.addEventListener('mouseup',     this._onUp.bind(this));
    canvas.addEventListener('mouseleave',  this._onLeave.bind(this));
    canvas.addEventListener('wheel',       this._onWheel.bind(this), { passive: false });
    canvas.addEventListener('contextmenu', e => e.preventDefault());

    // Touch support
    canvas.addEventListener('touchstart',  this._onTouchStart.bind(this), { passive: true });
    canvas.addEventListener('touchmove',   this._onTouchMove.bind(this),  { passive: true });
    canvas.addEventListener('touchend',    this._onTouchEnd.bind(this));
  }

  /** Returns and clears any pending placement intents. */
  flush() {
    const out = this._intents;
    this._intents = [];
    return out;
  }

  /** Returns and clears any pending click intents (short drag < 6px). */
  flushClicks() {
    const out = this._clickIntents;
    this._clickIntents = [];
    return out;
  }

  // ── Mouse ─────────────────────────────────────────────────────────────────

  _onDown(e) {
    if (e.button === 2) {
      this._isPanning = true;
      this._panStartX = e.clientX;
      this._panStartY = e.clientY;
      return;
    }
    if (e.button !== 0) return;
    const { x, y } = this._canvasPos(e);
    this.placement = { phase: 'dragging', anchorX: x, anchorY: y, tipX: x, tipY: y };
  }

  _onMove(e) {
    if (this._isPanning) {
      const dx = e.clientX - this._panStartX;
      const dy = e.clientY - this._panStartY;
      this._camera.panX += dx;
      this._camera.panY += dy;
      this._panStartX = e.clientX;
      this._panStartY = e.clientY;
      return;
    }
    if (this.placement.phase !== 'dragging') return;
    const { x, y } = this._canvasPos(e);
    this.placement.tipX = x;
    this.placement.tipY = y;
  }

  _onUp(e) {
    if (e.button === 2) {
      this._isPanning = false;
      return;
    }
    if (e.button !== 0) return;
    if (this.placement.phase !== 'dragging') return;
    const { x, y } = this._canvasPos(e);
    this.placement.tipX = x;
    this.placement.tipY = y;
    this._commit();
  }

  _onLeave() {
    this._isPanning = false;
    if (this.placement.phase === 'dragging') {
      this._commit();
    }
  }

  _onWheel(e) {
    e.preventDefault();
    const { x: mx, y: my } = this._canvasPos(e);
    const factor = e.deltaY < 0 ? 1.1 : 0.9;
    this._camera.panX = mx - (mx - this._camera.panX) * factor;
    this._camera.panY = my - (my - this._camera.panY) * factor;
    this._camera.zoom = Math.min(20, Math.max(0.1, this._camera.zoom * factor));
  }

  // ── Touch ─────────────────────────────────────────────────────────────────

  _onTouchStart(e) {
    const { x, y } = this._canvasTouchPos(e.touches[0]);
    this.placement = { phase: 'dragging', anchorX: x, anchorY: y, tipX: x, tipY: y };
  }

  _onTouchMove(e) {
    if (this.placement.phase !== 'dragging') return;
    const { x, y } = this._canvasTouchPos(e.touches[0]);
    this.placement.tipX = x;
    this.placement.tipY = y;
  }

  _onTouchEnd(e) {
    if (this.placement.phase !== 'dragging') return;
    if (e.changedTouches.length > 0) {
      const { x, y } = this._canvasTouchPos(e.changedTouches[0]);
      this.placement.tipX = x;
      this.placement.tipY = y;
    }
    this._commit();
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  _commit() {
    const p = this.placement;
    const dx = p.tipX - p.anchorX;
    const dy = p.tipY - p.anchorY;

    if (dx * dx + dy * dy < 36) {
      // Short tap/click → inspect intent
      this._clickIntents.push({ x: p.anchorX, y: p.anchorY });
    } else {
      this._intents.push({
        x:  p.anchorX,
        y:  p.anchorY,
        vx: dx * 1.5,  // VELOCITY_SCALE = 1.5
        vy: dy * 1.5,
      });
    }
    this.placement = { phase: 'idle', anchorX: 0, anchorY: 0, tipX: 0, tipY: 0 };
  }

  _canvasPos(e) {
    const rect = this.canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  _canvasTouchPos(touch) {
    const rect = this.canvas.getBoundingClientRect();
    return { x: touch.clientX - rect.left, y: touch.clientY - rect.top };
  }
}
