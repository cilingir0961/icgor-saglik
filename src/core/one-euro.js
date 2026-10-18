// One Euro filtresi (Casiez ve ark., CHI 2012): hızlı harekette gecikmeyi az,
// yavaş/durağan durumda titremeyi düşük tutan uyarlamalı alçak geçiren filtre.
// Poz algılayıcıdan gelen titrek işaret noktalarını yumuşatmak için kullanılır.

const alpha = (cutoff, dt) => {
  const tau = 1 / (2 * Math.PI * cutoff);
  return 1 / (1 + tau / dt);
};

export class OneEuroFilter {
  constructor({ minCutoff = 1.0, beta = 0.01, dCutoff = 1.0 } = {}) {
    this.minCutoff = minCutoff;
    this.beta = beta;
    this.dCutoff = dCutoff;
    this.reset();
  }

  reset() {
    this.x = null;
    this.dx = 0;
    this.t = null;
  }

  /** @param {number} value @param {number} t saniye cinsinden zaman damgası */
  filter(value, t) {
    if (this.x === null) {
      this.x = value;
      this.t = t;
      return value;
    }
    const dt = t - this.t;
    if (dt <= 0) return this.x;
    this.t = t;
    const rawDx = (value - this.x) / dt;
    this.dx += alpha(this.dCutoff, dt) * (rawDx - this.dx);
    const cutoff = this.minCutoff + this.beta * Math.abs(this.dx);
    this.x += alpha(cutoff, dt) * (value - this.x);
    return this.x;
  }
}

/** [x, y] noktaları için iki eksenli sarmalayıcı. */
export class PointFilter {
  constructor(opts) {
    this.fx = new OneEuroFilter(opts);
    this.fy = new OneEuroFilter(opts);
  }
  filter(p, t) {
    return [this.fx.filter(p[0], t), this.fy.filter(p[1], t)];
  }
  reset() {
    this.fx.reset();
    this.fy.reset();
  }
}
