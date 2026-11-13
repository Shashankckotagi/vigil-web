/**
 * VIGIL Timeline & Perception Feed Manager
 */

export function escapeHtml(str) {
  return String(str || '').replace(/[&<>'"]/g, tag => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  }[tag] || tag));
}

export function formatEventRow(ev) {
  const type = ev.type;
  let tag = '';
  let cat = 'system';
  let body = '';
  let rawT = ev.t ?? 0;
  let textToSearch = '';

  switch (type) {
    case 'description':
      tag = 'LLM';
      cat = 'llm';
      rawT = ev.t ?? 0;
      const badges = [
        ev.tokens ? `<span class="badge badge-tokens">${ev.tokens} tok</span>` : '',
        ev.latency_s != null ? `<span class="badge badge-latency">${ev.latency_s}s</span>` : ''
      ].filter(Boolean).join(' ');
      body = `${escapeHtml(ev.text || '')} ${badges}`;
      textToSearch = ev.text || '';
      break;

    case 'frame_kept':
      tag = 'KEPT';
      cat = 'gate';
      rawT = ev.t ?? 0;
      const ssimVal = (ev.ssim ?? 0).toFixed(2);
      const tauVal = (ev.tau ?? 0.92).toFixed(2);
      body = `frame passed — SSIM ${ssimVal} below τ ${tauVal}`;
      textToSearch = body;
      break;

    case 'gate_drop_run':
      tag = 'DROPPED';
      cat = 'gate';
      rawT = ev.t_start ?? ev.t_end ?? 0;
      const minS = (ev.ssim_min ?? 0).toFixed(2);
      const maxS = (ev.ssim_max ?? 0).toFixed(2);
      body = `${ev.count} frames dropped, no change (SSIM ${minS}–${maxS})`;
      textToSearch = body;
      break;

    case 'audio_speech':
      tag = 'HEARD';
      cat = 'audio';
      rawT = ev.t_start ?? 0;
      const durS = ((ev.duration_ms ?? 0) / 1000).toFixed(1);
      const peak = (ev.peak_rms ?? 0).toFixed(2);
      body = `speech detected, ${durS}s duration, peak ${peak} RMS`;
      textToSearch = body;
      break;

    case 'audio_silence':
      tag = 'SILENT';
      cat = 'audio';
      rawT = ev.t_start ?? 0;
      const silS = ((ev.duration_ms ?? 0) / 1000).toFixed(1);
      body = `${silS}s silence window, ${ev.frames_dropped ?? 0} frames dropped`;
      textToSearch = body;
      break;

    case 'escalation':
      tag = 'ESCALATED';
      cat = 'audio';
      rawT = ev.t ?? 0;
      const escTau = (ev.tau ?? 0.98).toFixed(2);
      body = `loud acoustic event — τ relaxed to ${escTau} for 30s`;
      textToSearch = body;
      break;

    case 'chunk_queued':
      tag = 'QUEUED';
      cat = 'system';
      rawT = ev.t ?? 0;
      body = `chunk ${ev.chunk} — ${ev.images} frames, ${ev.speech_ms ?? 0}ms speech, queue depth ${ev.queue_depth}/10`;
      textToSearch = body;
      break;

    case 'memory_compacted':
      tag = 'MEMORY';
      cat = 'system';
      rawT = ev.t ?? 0;
      body = `context memory compacted — ${ev.events_folded ?? 0} events folded, summary length ${ev.summary_chars ?? 0} chars`;
      textToSearch = body;
      break;

    case 'backpressure':
      tag = 'WAITED';
      cat = 'system';
      rawT = ev.t ?? 0;
      const waitS = (ev.waited_s ?? 0).toFixed(1);
      body = `producer throttled ${waitS}s, queue saturated`;
      textToSearch = body;
      break;

    case 'rate_limit_wait':
      tag = 'THROTTLED';
      cat = 'system';
      rawT = ev.t ?? 0;
      const rateS = (ev.waited_s ?? 0).toFixed(1);
      body = `rate limiter holding for ${rateS}s`;
      textToSearch = body;
      break;

    case 'error':
      tag = 'ERROR';
      cat = 'system';
      rawT = ev.t ?? 0;
      body = escapeHtml(ev.error || 'pipeline error occurred');
      textToSearch = body;
      break;

    default:
      return null;
  }

  return { tag, cat, body, rawT, textToSearch };
}

export class TimelineManager {
  constructor(options = {}) {
    this.feedList = options.feedList;
    this.cntFreeEl = options.cntFreeEl;
    this.cntBilledEl = options.cntBilledEl;
    this.cntRatioEl = options.cntRatioEl;
    this.ciBodyEl = options.ciBodyEl;
    this.ciTimestampEl = options.ciTimestampEl;
    this.maxRows = options.maxRows || 500;

    this.countFree = 0;
    this.countBilled = 0;
    this.currentFilter = 'all';
    this.searchQuery = '';
    this.autoScroll = true;
    this.eventsHistory = [];
  }

  addEvent(ev) {
    if (ev.type === 'frame') return; // High-rate frame telemetry

    const rowData = formatEventRow(ev);
    if (!rowData) return;

    this.eventsHistory.push(ev);
    if (this.eventsHistory.length > 2000) this.eventsHistory.shift();

    const placeholder = this.feedList.querySelector('.timeline-empty');
    if (placeholder) placeholder.remove();

    const cost = ev.cost === 'billed' ? 'billed' : 'free';
    this._updateCounters(cost);

    const secs = Math.floor(rowData.rawT || 0);
    const mm = String(Math.floor(secs / 60)).padStart(2, '0');
    const ss = String(secs % 60).padStart(2, '0');
    const timeStr = `${mm}:${ss}`;

    // Update hero banner if LLM description
    if (ev.type === 'description' && ev.text) {
      if (this.ciBodyEl) this.ciBodyEl.textContent = ev.text;
      if (this.ciTimestampEl) this.ciTimestampEl.textContent = timeStr;
    }

    const li = document.createElement('li');
    li.className = `feed-row ${cost === 'billed' ? 'row-billed' : 'row-free'}`;
    li.dataset.category = rowData.cat;
    li.dataset.text = (timeStr + ' ' + rowData.tag + ' ' + rowData.textToSearch).toLowerCase();

    li.innerHTML = `
      <span class="row-time">${timeStr}</span>
      <span class="row-tag tag-${rowData.tag.toLowerCase()}">${rowData.tag}</span>
      <span class="row-body">${rowData.body}</span>
    `;

    const visible = this._rowMatches(li);
    li.style.display = visible ? 'flex' : 'none';

    this.feedList.appendChild(li);

    while (this.feedList.children.length > this.maxRows) {
      this.feedList.removeChild(this.feedList.firstChild);
    }

    if (this.autoScroll) {
      this.feedList.scrollTop = this.feedList.scrollHeight;
    }
  }

  _updateCounters(cost) {
    if (cost === 'billed') this.countBilled++;
    else this.countFree++;

    const total = this.countFree + this.countBilled;
    const ratio = total > 0 ? (this.countFree / total * 100).toFixed(1) + '%' : '100%';

    if (this.cntFreeEl) this.cntFreeEl.textContent = this.countFree.toLocaleString();
    if (this.cntBilledEl) this.cntBilledEl.textContent = this.countBilled.toLocaleString();
    if (this.cntRatioEl) this.cntRatioEl.textContent = ratio;
  }

  _rowMatches(row) {
    const cat = row.dataset.category;
    const txt = row.dataset.text || '';
    const matchesCat = (this.currentFilter === 'all') || (cat === this.currentFilter);
    const matchesQuery = !this.searchQuery || txt.includes(this.searchQuery);
    return matchesCat && matchesQuery;
  }

  setFilter(filterName) {
    this.currentFilter = filterName;
    this.applyFilters();
  }

  setSearchQuery(q) {
    this.searchQuery = (q || '').toLowerCase().trim();
    this.applyFilters();
  }

  applyFilters() {
    const rows = this.feedList.querySelectorAll('.feed-row');
    rows.forEach(row => {
      row.style.display = this._rowMatches(row) ? 'flex' : 'none';
    });
  }

  clear() {
    this.countFree = 0;
    this.countBilled = 0;
    this.eventsHistory = [];
    if (this.cntFreeEl) this.cntFreeEl.textContent = '0';
    if (this.cntBilledEl) this.cntBilledEl.textContent = '0';
    if (this.cntRatioEl) this.cntRatioEl.textContent = '100%';
    this.feedList.innerHTML = `
      <li class="timeline-empty">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="12" y1="8" x2="12" y2="12"></line>
          <line x1="12" y1="16" x2="12.01" y2="16"></line>
        </svg>
        <div>Feed cleared. Awaiting new pipeline events...</div>
      </li>
    `;
  }

  exportJson() {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(this.eventsHistory, null, 2));
    const dlAnchor = document.createElement('a');
    dlAnchor.setAttribute('href', dataStr);
    dlAnchor.setAttribute('download', `vigil-events-${Date.now()}.json`);
    dlAnchor.click();
  }

  exportCsv() {
    const rows = [["timestamp_s", "type", "cost", "details"]];
    this.eventsHistory.forEach(ev => {
      const rowData = formatEventRow(ev);
      if (rowData) {
        rows.push([
          ev.t ?? ev.t_start ?? 0,
          ev.type,
          ev.cost || "free",
          `"${(rowData.textToSearch || '').replace(/"/g, '""')}"`
        ]);
      }
    });
    const csvContent = "data:text/csv;charset=utf-8," + rows.map(e => e.join(",")).join("\n");
    const dlAnchor = document.createElement('a');
    dlAnchor.setAttribute('href', encodeURI(csvContent));
    dlAnchor.setAttribute('download', `vigil-events-${Date.now()}.csv`);
    dlAnchor.click();
  }
}
