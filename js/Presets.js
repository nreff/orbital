// G = 2.0 in this engine, so v_circ(r, M) = sqrt(2*M/r)
const vc = (r, M) => Math.sqrt(2 * M / r);

// Tangential velocity for clockwise orbit at polar angle θ
const vel = (r, theta, M) => {
  const v = vc(r, M);
  return { vx: -Math.sin(theta) * v, vy: Math.cos(theta) * v };
};

export const PRESETS = {
  solar: {
    starMass: 1_000_000,
    bodies: [
      { dx:  70, dy: 0, ...vel(70,  0, 1e6), radius: 3,  color: '#a0a0a0', type: 'planet' }, // Mercury
      { dx: 110, dy: 0, ...vel(110, 0, 1e6), radius: 5,  color: '#d4a030', type: 'planet' }, // Venus
      { dx: 165, dy: 0, ...vel(165, 0, 1e6), radius: 6,  color: '#4fc3f7', type: 'planet' }, // Earth
      { dx: 240, dy: 0, ...vel(240, 0, 1e6), radius: 4,  color: '#c05030', type: 'planet' }, // Mars
      { dx: 380, dy: 0, ...vel(380, 0, 1e6), radius: 14, color: '#c49060', type: 'planet' }, // Jupiter
    ],
  },

  resonance: {
    // Three bodies in 1:2:4 orbital period ratios (Laplace resonance like Io/Europa/Ganymede).
    // r ratios: 1 : 2^(2/3) : 4^(2/3) ≈ 1 : 1.587 : 2.52 → T ratios ≈ 1:2:4
    starMass: 1_000_000,
    bodies: (() => {
      const angles = [0, Math.PI / 3, 2 * Math.PI / 3];
      const params = [
        { r: 120, radius: 6, color: '#e07040' },
        { r: 190, radius: 7, color: '#40c0e0' },
        { r: 302, radius: 9, color: '#a060d0' },
      ];
      return params.map(({ r, radius, color }, i) => {
        const theta = angles[i];
        return {
          dx: r * Math.cos(theta), dy: r * Math.sin(theta),
          ...vel(r, theta, 1e6),
          radius, color, type: 'planet',
        };
      });
    })(),
  },

  asteroids: {
    // 15 small bodies in a ring with slight orbital variation
    starMass: 1_000_000,
    bodies: (() => {
      const ring = [];
      for (let i = 0; i < 15; i++) {
        const theta = (i / 15) * 2 * Math.PI;
        const r = 280 + (i % 3 - 1) * 20; // 260, 280, or 300
        const vPerturb = 1 + (i % 5 - 2) * 0.04; // ±8% eccentricity
        const v = vc(r, 1e6) * vPerturb;
        ring.push({
          dx: r * Math.cos(theta), dy: r * Math.sin(theta),
          vx: -Math.sin(theta) * v, vy: Math.cos(theta) * v,
          radius: 3 + (i % 3), color: ['#888888', '#a07050', '#707090'][i % 3], type: 'planet',
        });
      }
      return ring;
    })(),
  },

  trojans: {
    // Jupiter-like planet + 2 Trojan groups at L4 (+60°) and L5 (-60°)
    starMass: 1_000_000,
    bodies: (() => {
      const R = 320, M = 1e6;
      const make = (theta, r, radius, color) => ({
        dx: r * Math.cos(theta), dy: r * Math.sin(theta),
        ...vel(r, theta, M), radius, color, type: 'planet',
      });
      return [
        make(0,                      R,      14, '#c49060'), // Jupiter
        make(Math.PI / 3,            R,       4, '#80b0e0'), // L4 Trojan 1
        make(Math.PI / 3 + 0.18,     R - 10,  3, '#70a0d0'), // L4 Trojan 2
        make(-Math.PI / 3,           R,       4, '#80e0b0'), // L5 Trojan 1
        make(-Math.PI / 3 - 0.15,    R + 8,   3, '#70d0a0'), // L5 Trojan 2
      ];
    })(),
  },

  chaos: {
    // Three medium-sized bodies at 120° intervals with varied eccentricities
    // → mutual gravity causes long-term chaotic orbital precession
    starMass: 1_000_000,
    bodies: [
      {
        dx: 200, dy: 0,
        vx: 0, vy: vc(200, 1e6) * 1.15,
        radius: 11, color: '#f06080', type: 'planet',
      },
      {
        dx: 200 * Math.cos(2 * Math.PI / 3), dy: 200 * Math.sin(2 * Math.PI / 3),
        vx: -Math.sin(2 * Math.PI / 3) * vc(200, 1e6) * 0.88,
        vy:  Math.cos(2 * Math.PI / 3) * vc(200, 1e6) * 0.88,
        radius: 11, color: '#60f080', type: 'planet',
      },
      {
        dx: 200 * Math.cos(4 * Math.PI / 3), dy: 200 * Math.sin(4 * Math.PI / 3),
        vx: -Math.sin(4 * Math.PI / 3) * vc(200, 1e6) * 1.05,
        vy:  Math.cos(4 * Math.PI / 3) * vc(200, 1e6) * 1.05,
        radius: 11, color: '#8080f0', type: 'planet',
      },
    ],
  },

  figure8: {
    // Chenciner–Montgomery figure-8 three-body solution (freeform, no central star).
    // Three equal masses chase each other along a shared figure-8 path.
    // Scaled for G=2 engine: S=150px, mass=75000, v_scale=31.6 px/s per natural unit.
    mode: 'freeform',
    bodies: [
      { dx:  145.5, dy: -36.5, vx:  14.7, vy:  13.7, mass: 75000, radius: 14, color: '#f06080', type: 'planet' },
      { dx: -145.5, dy:  36.5, vx:  14.7, vy:  13.7, mass: 75000, radius: 14, color: '#60c060', type: 'planet' },
      { dx:      0, dy:    0,  vx: -29.5, vy: -27.3, mass: 75000, radius: 14, color: '#6080f0', type: 'planet' },
    ],
  },

  binary: {
    // Two equal-mass stars orbiting their common CoM + one circumbinary planet.
    // Stars: separation=160px, v=25px/s each. Planet: r=260px from CoM, v=39px/s.
    mode: 'freeform',
    bodies: [
      { dx: -80,  dy: 0, vx: 0, vy: -25, mass: 100000, radius: 20, color: '#ffe066', type: 'star'   },
      { dx:  80,  dy: 0, vx: 0, vy:  25, mass: 100000, radius: 20, color: '#f8a840', type: 'star'   },
      { dx: 260,  dy: 0, vx: 0, vy:  39, mass: 5000,   radius:  8, color: '#4fc3f7', type: 'planet' },
    ],
  },

  comet: {
    // Highly eccentric comet (e=0.8). Starts at aphelion (450px), falls toward star,
    // whips around at perihelion (50px), flies back out. Watch at 2–4× speed.
    mode: 'star',
    starMass: 1_000_000,
    bodies: [
      { dx: 450, dy: 0, vx: 0, vy: 30, mass: 80, radius: 5, color: '#c8d8e0', type: 'planet' },
    ],
  },
};
