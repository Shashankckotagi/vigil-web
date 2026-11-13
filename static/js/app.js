/**
 * VIGIL Application Controller
 */
import { apiUrl, fetchStatus, fetchPricing, startPipeline, stopPipeline, uploadVideoFile, setBackendUrl, getBackendUrl } from './api.js';
import { PipelineSocket } from './ws.js';
import { SsimChart } from './chart.js';
import { TimelineManager } from './timeline.js';
import { StatePresenter } from './state.js';

(function () {
  const $ = (id) => document.getElementById(id);

  // Initialize Clock
  setInterval(() => {
    const d = new Date();
    const clockEl = $('clock');
    if (clockEl) clockEl.textContent = d.toTimeString().split(' ')[0];
  }, 1000);

  // Error Banner Helper
  function showError(msg) {
    const banner = $('errBanner');
    if (!banner) return;
    banner.textContent = msg;
    banner.style.display = 'block';
    setTimeout(() => {
      banner.style.display = 'none';
    }, 7000);
  }

  // Setup DOM mappings for StatePresenter
  const presenter = new StatePresenter({
    statusPill: $('statusPill'),
    statusText: $('statusText'),
    btnStart: $('btnStart'),
    btnStop: $('btnStop'),
    streamTypeTag: $('streamTypeTag'),
    statKept: $('statKept'),
    statKeptSub: $('statKeptSub'),
    statDropped: $('statDropped'),
    statRetention: $('statRetention'),
    retentionBar: $('retentionBar'),
    statTokens: $('statTokens'),
    statTokensRate: $('statTokensRate'),
    statLatency: $('statLatency'),
    statLatencySub: $('statLatencySub'),
    statSource: $('statSource'),
    statReconnects: $('statReconnects'),
    statMemory: $('statMemory'),
    statCompaction: $('statCompaction')
  });

  // Load pricing async
  fetchPricing().then(pricing => presenter.setPricing(pricing)).catch(() => {});

  // Setup SSIM Chart
  const ssimChart = new SsimChart($('ssimChart'), {
    maxPoints: 60,
    getTau: () => parseFloat($('tau').value) || 0.92
  });

  // Setup Timeline Manager
  const timeline = new TimelineManager({
    feedList: $('timelineFeed'),
    cntFreeEl: $('cntFree'),
    cntBilledEl: $('cntBilled'),
    cntRatioEl: $('cntRatio'),
    ciBodyEl: $('ciBody'),
    ciTimestampEl: $('ciTimestamp'),
    maxRows: 500
  });

  // Restart/Reload Live Video Stream
  function restartFeed() {
    const img = $('liveFeedImg');
    const placeholder = $('placeholder');
    if (!img) return;
    img.src = apiUrl('/api/feed?t=' + Date.now());
    img.style.display = 'block';
    if (placeholder) placeholder.style.display = 'none';
  }

  $('btnRefreshFeed').onclick = restartFeed;

  // Fullscreen Viewport
  $('btnFullscreen').onclick = () => {
    const vp = $('viewport');
    if (!document.fullscreenElement) {
      if (vp.requestFullscreen) vp.requestFullscreen().catch(() => {});
    } else {
      if (document.exitFullscreen) document.exitFullscreen().catch(() => {});
    }
  };

  // Provider Selection: Reveal API Key input if Gemini
  $('provider').onchange = (e) => {
    $('geminiKeyGroup').style.display = (e.target.value === 'gemini') ? 'flex' : 'none';
  };

  // Tau Slider Input
  $('tau').oninput = (e) => {
    $('tauVal').textContent = parseFloat(e.target.value).toFixed(2);
    ssimChart.render();
  };

  // Filter Chips Click
  document.querySelectorAll('#filterChips .chip').forEach((btn) => {
    btn.onclick = () => {
      document.querySelectorAll('#filterChips .chip').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      timeline.setFilter(btn.dataset.filter);
    };
  });

  // Filter Search Input
  $('filterInput').oninput = (e) => {
    timeline.setSearchQuery(e.target.value);
  };

  // Auto-Scroll Toggle
  $('btnAutoScroll').onclick = () => {
    timeline.autoScroll = !timeline.autoScroll;
    $('btnAutoScroll').classList.toggle('active', timeline.autoScroll);
  };

  // Clear Timeline
  $('btnClearTimeline').onclick = () => {
    timeline.clear();
    ssimChart.clear();
  };

  // Export Events JSON & CSV
  if ($('btnExportJson')) {
    $('btnExportJson').onclick = () => timeline.exportJson();
  }
  if ($('btnExportCsv')) {
    $('btnExportCsv').onclick = () => timeline.exportCsv();
  }

  // Quick Preset Buttons
  document.querySelectorAll('.preset-btn').forEach((btn) => {
    btn.onclick = () => {
      $('url').value = btn.dataset.url;
    };
  });

  // Setup WebSocket Connection
  const socket = new PipelineSocket({
    onEvent: (ev) => {
      if (ev.type === 'frame') {
        ssimChart.addPoint(ev.ssim, ev.kept);
        presenter.applyStatus({ gate: ev.gate, running: true });
      } else if (ev.type === 'started' || ev.type === 'stopped') {
        presenter.applyStatus(ev.status);
      } else {
        timeline.addEvent(ev);
        if (ev.type === 'description' && ev.status) {
          presenter.applyStatus(ev.status);
        }
        if (ev.error) showError(ev.error);
      }
    },
    onError: (err) => {
      console.warn('Pipeline WebSocket warning:', err);
    }
  });

  socket.connect();

  // Start Pipeline Handler
  $('btnStart').onclick = async () => {
    const url = $('url').value.trim();
    if (!url) {
      showError('Please enter a valid video stream URL or file path.');
      return;
    }

    $('btnStart').disabled = true;
    try {
      const data = await startPipeline({
        url: url,
        tau: parseFloat($('tau').value),
        escalation: $('esc').checked,
        gate: $('gate').checked,
        bounded: $('bounded').checked,
        audio: $('audio') ? $('audio').checked : true,
        provider: $('provider').value,
        api_key: $('geminiKey').value.trim() || undefined,
        run_id: $('runId') ? $('runId').value.trim() || undefined : undefined
      });
      presenter.applyStatus(data.status);
      restartFeed();
    } catch (err) {
      showError(String(err.message || err));
      $('btnStart').disabled = false;
    }
  };

  // Stop Pipeline Handler
  $('btnStop').onclick = async () => {
    try {
      const data = await stopPipeline();
      presenter.applyStatus(data.status);
    } catch (err) {
      showError(String(err.message || err));
    }
  };

  // Video File Upload Handler
  $('btnUpload').onclick = () => $('filePicker').click();
  $('filePicker').onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    $('btnUpload').disabled = true;
    $('btnUpload').textContent = 'Uploading...';

    try {
      const data = await uploadVideoFile(file);
      if (data.path) {
        $('url').value = data.path;
        $('btnStart').click();
      }
    } catch (err) {
      showError('Video upload failed: ' + (err.message || err));
    } finally {
      $('btnUpload').disabled = false;
      $('btnUpload').innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
        Upload Video`;
    }
  };

  // Backend URL Configuration
  const backendInput = $('backendUrl');
  if (backendInput) {
    backendInput.value = getBackendUrl();
    backendInput.onchange = (e) => {
      setBackendUrl(e.target.value);
      socket.reconnect();
      fetchStatus().then(s => presenter.applyStatus(s)).catch(() => {});
      restartFeed();
    };
  }

  // Initial status check
  fetchStatus().then(s => presenter.applyStatus(s)).catch(() => {});
})();
