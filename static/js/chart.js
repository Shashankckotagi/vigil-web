/**
 * SSIM Waveform Canvas Renderer
 */

export class SsimChart {
  constructor(canvasElement, options = {}) {
    this.canvas = canvasElement;
    this.ctx = canvasElement.getContext('2d');
    this.maxPoints = options.maxPoints || 60;
    this.history = [];
    this.getTau = options.getTau || (() => 0.92);

    this.resize = this.resize.bind(this);
    window.addEventListener('resize', this.resize);
    setTimeout(this.resize, 50);
  }

  resize() {
    if (!this.canvas) return;
    const parentWidth = this.canvas.parentElement ? this.canvas.parentElement.clientWidth : 600;
    const dpr = window.devicePixelRatio || 1;
    const width = Math.max(parentWidth - 36, 260);
    const height = 80;

    this.canvas.width = width * dpr;
    this.canvas.height = height * dpr;
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;

    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.render();
  }

  addPoint(score, kept) {
    this.history.push({ score, kept });
    if (this.history.length > this.maxPoints) {
      this.history.shift();
    }
    this.render();
  }

  clear() {
    this.history = [];
    this.render();
  }

  render() {
    if (!this.ctx || !this.canvas) return;
    const w = parseFloat(this.canvas.style.width) || (this.canvas.width / (window.devicePixelRatio || 1));
    const h = parseFloat(this.canvas.style.height) || (this.canvas.height / (window.devicePixelRatio || 1));

    this.ctx.clearRect(0, 0, w, h);

    const tau = parseFloat(this.getTau()) || 0.92;
    const tauY = h - (tau * h);

    // Subtle horizontal grid lines
    this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    this.ctx.lineWidth = 1;
    for (let y = 0.2; y <= 1.0; y += 0.2) {
      const gy = h - (y * h);
      this.ctx.beginPath();
      this.ctx.moveTo(0, gy);
      this.ctx.lineTo(w, gy);
      this.ctx.stroke();
    }

    // Threshold Line
    this.ctx.strokeStyle = 'rgba(56, 189, 248, 0.75)';
    this.ctx.lineWidth = 1.5;
    this.ctx.setLineDash([4, 4]);
    this.ctx.beginPath();
    this.ctx.moveTo(0, tauY);
    this.ctx.lineTo(w, tauY);
    this.ctx.stroke();
    this.ctx.setLineDash([]);

    if (this.history.length < 2) return;

    const step = w / (this.maxPoints - 1);

    // Connect line
    this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
    this.ctx.lineWidth = 1.5;
    this.ctx.beginPath();
    for (let i = 0; i < this.history.length; i++) {
      const pt = this.history[i];
      const x = i * step;
      const y = h - (Math.min(Math.max(pt.score, 0), 1) * h);
      if (i === 0) this.ctx.moveTo(x, y);
      else this.ctx.lineTo(x, y);
    }
    this.ctx.stroke();

    // Data points (dots)
    for (let i = 0; i < this.history.length; i++) {
      const pt = this.history[i];
      const x = i * step;
      const y = h - (Math.min(Math.max(pt.score, 0), 1) * h);

      this.ctx.fillStyle = pt.kept ? '#10b981' : '#f43f5e';
      this.ctx.beginPath();
      this.ctx.arc(x, y, 3, 0, Math.PI * 2);
      this.ctx.fill();
    }
  }
}
