/**
 * VIGIL Global State & Metrics Presenter
 */

export class StatePresenter {
  constructor(domElements = {}, pricing = {}) {
    this.dom = domElements;
    this.pricing = pricing;
    this.status = null;
  }

  setPricing(pricing) {
    this.pricing = pricing;
    if (this.status) {
      this.applyStatus(this.status);
    }
  }

  calculateCost(tokensIn = 0, tokensOut = 0, modelName = 'gemini-4-hydrogen') {
    const modelPricing = this.pricing[modelName] || this.pricing['default'] || {
      input_per_million: 1.50,
      output_per_million: 7.50
    };
    const usdIn = (tokensIn / 1_000_000) * modelPricing.input_per_million;
    const usdOut = (tokensOut / 1_000_000) * modelPricing.output_per_million;
    const totalUsd = usdIn + usdOut;
    const usdToInr = this.pricing.usd_to_inr || 86.0;
    const totalInr = totalUsd * usdToInr;

    return { totalUsd, totalInr };
  }

  applyStatus(s) {
    if (!s) return;
    this.status = s;

    const g = s.gate || {};
    const m = s.metrics || {};
    const mem = s.memory || {};
    const isRunning = !!s.running;
    const isEscalated = !!s.escalated;

    // Status Pill & Buttons
    if (this.dom.statusPill) {
      if (isRunning) {
        if (isEscalated) {
          this.dom.statusPill.className = 'status-pill escalated';
          if (this.dom.statusText) this.dom.statusText.textContent = 'ESCALATED (LOUD)';
        } else {
          this.dom.statusPill.className = 'status-pill live';
          if (this.dom.statusText) this.dom.statusText.textContent = 'LIVE STREAMING';
        }
      } else {
        this.dom.statusPill.className = 'status-pill';
        if (this.dom.statusText) this.dom.statusText.textContent = 'IDLE';
      }
    }

    if (this.dom.btnStart) this.dom.btnStart.disabled = isRunning;
    if (this.dom.btnStop) this.dom.btnStop.disabled = !isRunning;
    if (this.dom.streamTypeTag) {
      this.dom.streamTypeTag.textContent = isRunning ? (isEscalated ? 'AUDIO ESCALATED' : 'LIVE OPENCV STREAM') : 'STANDBY';
    }

    // Frames Kept & Dropped
    if (this.dom.statKept) this.dom.statKept.textContent = (g.frames_kept || 0).toLocaleString();
    if (this.dom.statKeptSub) this.dom.statKeptSub.textContent = `${(g.frames_seen || 0).toLocaleString()} frames seen`;

    if (this.dom.statDropped) this.dom.statDropped.textContent = (g.frames_dropped || 0).toLocaleString();
    const ret = g.frame_retention != null ? (g.frame_retention * 100).toFixed(1) : '0.0';
    if (this.dom.statRetention) this.dom.statRetention.textContent = `${ret}% retention`;
    if (this.dom.retentionBar) this.dom.retentionBar.style.width = `${Math.min(parseFloat(ret), 100)}%`;

    // Tokens & Cost
    const tokensTotal = m.tokens_total || 0;
    const tokensIn = m.tokens_in || (tokensTotal * 0.85);
    const tokensOut = m.tokens_out || (tokensTotal * 0.15);
    const { totalUsd, totalInr } = this.calculateCost(tokensIn, tokensOut, s.provider);

    if (this.dom.statTokens) this.dom.statTokens.textContent = tokensTotal.toLocaleString();
    if (this.dom.statTokensRate) {
      const rate = (m.tokens_per_hour || 0).toLocaleString(undefined, { maximumFractionDigits: 0 });
      const costStr = totalUsd > 0 ? ` • $${totalUsd.toFixed(4)} (~₹${totalInr.toFixed(2)})` : '';
      this.dom.statTokensRate.textContent = `${rate} tok/hr${costStr}`;
    }

    // Inference Latency
    const p50 = m.p50_latency_s ? m.p50_latency_s.toFixed(2) + 's' : '—';
    const p95 = m.p95_latency_s ? m.p95_latency_s.toFixed(2) + 's' : '—';
    if (this.dom.statLatency) this.dom.statLatency.textContent = p95 !== '—' ? p95 : p50;
    if (this.dom.statLatencySub) this.dom.statLatencySub.textContent = `p50: ${p50} | p95: ${p95}`;

    // Active Source & Reconnects
    if (this.dom.statSource) {
      const src = s.url || 'IDLE';
      this.dom.statSource.textContent = src.length > 18 ? src.substring(0, 16) + '...' : src;
      this.dom.statSource.title = src;
    }
    if (this.dom.statReconnects) this.dom.statReconnects.textContent = `${s.reconnects || 0} reconnects`;

    // Context Memory & Queue
    const qDepth = s.queue_depth != null ? s.queue_depth : (m.max_queue_depth || 0);
    if (this.dom.statMemory) {
      this.dom.statMemory.textContent = mem.mode ? mem.mode.toUpperCase() : (mem.bounded === false ? 'APPEND-ONLY' : 'BOUNDED');
    }
    if (this.dom.statCompaction) {
      this.dom.statCompaction.textContent = `${mem.compactions || 0} compactions • queue: ${qDepth}`;
    }
  }
}
