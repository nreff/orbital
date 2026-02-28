const G = 2.0;
const SOFTENING = 5;       // px — prevents force spike at r→0
const SOFTENING_SQ = SOFTENING * SOFTENING;
const SUBSTEPS = 4;
const ESCAPE_RADIUS = 5000;
const TRAIL_MAX_LENGTH = 300;

export class Physics {
  /**
   * Main entry point — advances simulation by frameTimeSec.
   * Mutates bodies[] in-place; handles collisions and escape flagging.
   * @param {CelestialBody[]} bodies
   * @param {Star} star
   * @param {number} frameTimeSec
   */
  step(bodies, star, frameTimeSec) {
    const dt = frameTimeSec / SUBSTEPS;

    for (let s = 0; s < SUBSTEPS; s++) {
      // Velocity Verlet — half-kick, drift, recompute forces, half-kick
      this._computeAccelerations(bodies, star);

      for (const b of bodies) {
        // Half-kick velocity with current acceleration
        b.velocity.vx += 0.5 * b.acceleration.ax * dt;
        b.velocity.vy += 0.5 * b.acceleration.ay * dt;

        // Drift position
        b.position.x += b.velocity.vx * dt;
        b.position.y += b.velocity.vy * dt;
      }

      // Recompute accelerations at new positions
      this._computeAccelerations(bodies, star);

      for (const b of bodies) {
        // Second half-kick
        b.velocity.vx += 0.5 * b.acceleration.ax * dt;
        b.velocity.vy += 0.5 * b.acceleration.ay * dt;
      }

      // Trail: record position every substep (throttled by length cap)
      for (const b of bodies) {
        b.trail.push({ x: b.position.x, y: b.position.y });
        if (b.trail.length > TRAIL_MAX_LENGTH) b.trail.shift();
      }

      // Collision detection after each substep
      this._handleCollisions(bodies, star);
    }
  }

  /** Compute gravitational acceleration on each body from star + all other bodies. */
  _computeAccelerations(bodies, star) {
    for (const b of bodies) {
      b.acceleration.ax = 0;
      b.acceleration.ay = 0;
    }

    // Force from star on each body (star may be null in freeform mode)
    if (star) {
      for (const b of bodies) {
        const dx = star.position.x - b.position.x;
        const dy = star.position.y - b.position.y;
        const distSq = dx * dx + dy * dy + SOFTENING_SQ;
        const dist = Math.sqrt(distSq);
        const forceMag = G * star.mass / distSq;
        b.acceleration.ax += forceMag * dx / dist;
        b.acceleration.ay += forceMag * dy / dist;
      }
    }

    // Pairwise body-body forces (O(n²))
    for (let i = 0; i < bodies.length; i++) {
      for (let j = i + 1; j < bodies.length; j++) {
        const a = bodies[i];
        const b = bodies[j];
        const dx = b.position.x - a.position.x;
        const dy = b.position.y - a.position.y;
        const distSq = dx * dx + dy * dy + SOFTENING_SQ;
        const dist = Math.sqrt(distSq);
        const forceMag = G / distSq;
        const ax = forceMag * dx / dist;
        const ay = forceMag * dy / dist;
        a.acceleration.ax += b.mass * ax;
        a.acceleration.ay += b.mass * ay;
        b.acceleration.ax -= a.mass * ax;
        b.acceleration.ay -= a.mass * ay;
      }
    }
  }

  /** Merge overlapping bodies; flag bodies absorbed by star. */
  _handleCollisions(bodies, star) {
    // Body vs star (star may be null in freeform mode)
    if (star) {
      for (const b of bodies) {
        const dx = b.position.x - star.position.x;
        const dy = b.position.y - star.position.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < star.radius + b.radius * 0.5) {
          b.merged = true; // absorbed
        }
      }
    }

    // Body vs body (merge smaller into larger)
    for (let i = 0; i < bodies.length; i++) {
      if (bodies[i].merged) continue;
      for (let j = i + 1; j < bodies.length; j++) {
        if (bodies[j].merged) continue;
        const a = bodies[i];
        const bdy = bodies[j];
        const dx = bdy.position.x - a.position.x;
        const dy = bdy.position.y - a.position.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < a.radius + bdy.radius) {
          // Merge: momentum conservation, volume conservation
          const totalMass = a.mass + bdy.mass;
          // Weighted position toward more massive
          a.position.x = (a.position.x * a.mass + bdy.position.x * bdy.mass) / totalMass;
          a.position.y = (a.position.y * a.mass + bdy.position.y * bdy.mass) / totalMass;
          // Momentum conservation
          a.velocity.vx = (a.velocity.vx * a.mass + bdy.velocity.vx * bdy.mass) / totalMass;
          a.velocity.vy = (a.velocity.vy * a.mass + bdy.velocity.vy * bdy.mass) / totalMass;
          // Volume conservation: r ∝ mass^(1/3) (roughly)
          a.radius = Math.cbrt(a.radius ** 3 + bdy.radius ** 3);
          a.mass = totalMass;
          bdy.merged = true;
        }
      }
    }
  }

  /**
   * Returns the tangential speed needed for a circular orbit at (x, y).
   * Useful for the UI drag hint label.
   */
  circularOrbitVelocity(x, y, starPos, starMass) {
    const dx = x - starPos.x;
    const dy = y - starPos.y;
    const r = Math.sqrt(dx * dx + dy * dy);
    if (r < 1) return 0;
    return Math.sqrt(G * starMass / r);
  }
}
