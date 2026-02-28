/**
 * Input — mouse/touch event handling & placement state machine.
 *
 * Phases:
 *   'idle'     → waiting for mousedown
 *   'dragging' → mousedown held, showing ghost + arrow
 *   'placed'   → mouseup, intent queued
 */
export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.placement = { phase: 'idle', anchorX: 0, anchorY: 0, tipX: 0, tipY: 0 };
    this._intents = [];

    canvas.addEventListener('mousedown', this._onDown.bind(this));
    canvas.addEventListener('mousemove', this._onMove.bind(this));
    canvas.addEventListener('mouseup',   this._onUp.bind(this));
    canvas.addEventListener('mouseleave', this._onLeave.bind(this));

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

  // ── Mouse ─────────────────────────────────────────────────────────────────

  _onDown(e) {
    const { x, y } = this._canvasPos(e);
    this.placement = { phase: 'dragging', anchorX: x, anchorY: y, tipX: x, tipY: y };
  }

  _onMove(e) {
    if (this.placement.phase !== 'dragging') return;
    const { x, y } = this._canvasPos(e);
    this.placement.tipX = x;
    this.placement.tipY = y;
  }

  _onUp(e) {
    if (this.placement.phase !== 'dragging') return;
    const { x, y } = this._canvasPos(e);
    this.placement.tipX = x;
    this.placement.tipY = y;
    this._commit();
  }

  _onLeave() {
    // Cancel drag if mouse leaves canvas without releasing
    if (this.placement.phase === 'dragging') {
      this._commit();
    }
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
    this._intents.push({
      x: p.anchorX,
      y: p.anchorY,
      vx: (p.tipX - p.anchorX) * 1.5,  // VELOCITY_SCALE = 1.5
      vy: (p.tipY - p.anchorY) * 1.5,
    });
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
