let _nextId = 1;

export class CelestialBody {
  constructor({ x, y, vx = 0, vy = 0, mass = 100, radius = 8, color = '#4fc3f7', type = 'planet' }) {
    this.id = _nextId++;
    this.position = { x, y };
    this.velocity = { vx, vy };
    this.mass = mass;
    this.radius = radius;
    this.color = color;
    this.type  = type;  // 'planet' | 'star'
    this.trail = [];           // array of {x, y}
    this.acceleration = { ax: 0, ay: 0 };
    this.escaped = false;
    this.merged = false;
  }
}

export class Star {
  constructor(x, y) {
    this.id = 'star';
    this.position = { x, y };
    this.mass = 1_000_000;
    this.radius = 30;
    this.color = '#fff7aa';
  }
}
