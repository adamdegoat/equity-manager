'use strict';

const DATA = 'data/';
let equityChart = null;

// ── Fetch helpers ────────────────────────────────────────────────────────────
async function _json(file) {
  const r = await fetch(DATA + file + '?t=' + Date.now());
  if (!r.ok) throw new Error(r.status);
  return r.json();
}

async function refresh() {
  try {
    const [market, watchlist, scanner, l9, meta] = await Promise.all([
      _json('market.json'),
      _json('watchlist.json'),
      _json('scanner.json'),
      _json('l9.json'),
      _json('meta.json'),
    ]);
    renderHeader(market, meta);
    renderStatus(meta, scanner);
    renderMarketOverview(market);
    renderWatchlist(watchlist);
    renderScanner(scanner);
    renderSignals(watchlist);
    renderL9(l9);
    renderPortfolio(l9);
    renderNews(market);
    document.getElementById('last-ts').textContent = fmtTs(meta.last_updated);
  } catch (e) {
    console.error('Refresh failed:', e);
  }
}

// ── System Status ────────────────────────────────────────────────────────────
function renderStatus(meta, scanner) {
  const ts   = meta.last_updated;
  const now  = Date.now();
  const diff = ts ? Math.floor((now - new Date(ts).getTime()) / 1000) : null;

  // Main timestamp
  document.getElementById('status-ts-main').textContent = fmtTs(ts);
  // Time ago sub-line
  document.getElementById('status-ts-sub').textContent =
    diff != null ? timeAgo(diff) + ' · Auto-refreshes every 15 min' : '—';

  // Runs today
  _setText('status-cycles', meta.cycles_today ?? '—');

  // Engine last run
  document.getElementById('sched-engine-last').textContent = fmtTs(ts);
  const staleMin = diff != null ? Math.floor(diff / 60) : null;
  const engineOk = staleMin != null && staleMin < 20;
  document.getElementById('sched-engine-status').innerHTML =
    engineOk ? '<span class="sched-ok">&#10003;</span>' : '<span class="sched-pending">&#9679;</span>';

  // Scanner last run
  const scannerTs = scanner ? scanner.as_of : null;
  document.getElementById('sched-scanner-last').textContent = scannerTs ? fmtTs(scannerTs) : '—';

  // L9 last run
  const l9Ts = meta.last_l9_run;
  document.getElementById('sched-l9-last').textContent = l9Ts ? fmtTs(l9Ts) : 'Not yet run';
  document.getElementById('sched-l9-status').innerHTML = l9Ts
    ? '<span class="sched-ok">&#10003;</span>'
    : '<span class="sched-pending">&#9679;</span>';
}

function timeAgo(diffSec) {
  if (diffSec < 60)   return diffSec + 's ago';
  if (diffSec < 3600) return Math.floor(diffSec / 60) + 'm ago';
  if (diffSec < 86400)return Math.floor(diffSec / 3600) + 'h ago';
  return Math.floor(diffSec / 86400) + 'd ago';
}

// ── Header ───────────────────────────────────────────────────────────────────
function renderHeader(market, meta) {
  const statusKey   = market.market_status || 'closed';
  const statusLabel = market.market_label  || 'Closed';
  const badge       = document.getElementById('market-status-badge');
  badge.className   = 'market-badge ' + statusKey;
  badge.innerHTML   = '&#9679; ' + statusLabel;

  const regime   = market.regime || 'NEUTRAL';
  const regimeEl = document.getElementById('regime-val');
  regimeEl.textContent = regime;
  regimeEl.className   = 'regime-tag ' + regime;

  const vix = (market.vix || {}).value;
  document.getElementById('vix-val').textContent = vix != null ? vix.toFixed(1) : '—';
}

// ── Market Overview ──────────────────────────────────────────────────────────
function renderMarketOverview(market) {
  _fillMarketCard('spy', market.spy, market);
  _fillMarketCard('qqq', market.qqq, market);

  // VIX
  const vix = market.vix || {};
  document.getElementById('vix-price').textContent = vix.value != null ? vix.value.toFixed(2) : '—';
  const vixChg = document.getElementById('vix-chg');
  if (vix.change != null) {
    vixChg.textContent = (vix.change > 0 ? '+' : '') + vix.change.toFixed(2) + '%';
    vixChg.className = 'mc-chg ' + (vix.change > 0 ? 'neg' : 'pos'); // VIX up = bad
  }
  document.getElementById('vix-detail').textContent = vix.label || '';

  document.getElementById('regime-desc').textContent = market.regime_desc || '—';
}

function _fillMarketCard(id, data, market) {
  if (!data) return;
  document.getElementById(id + '-price').textContent = '$' + (data.price || 0).toFixed(2);
  const chgEl = document.getElementById(id + '-chg');
  const chg1d = data.change_1d || 0;
  chgEl.textContent = (chg1d > 0 ? '+' : '') + chg1d.toFixed(2) + '%';
  chgEl.className   = 'mc-chg ' + (chg1d >= 0 ? 'pos' : 'neg');
  const sig = (data.signals || {}).daily || {};
  document.getElementById(id + '-detail').textContent =
    `EMA: ${sig.ema_stack || '—'} | RSI: ${sig.rsi || '—'} | MACD: ${sig.macd || '—'}`;
}

// ── Watchlist cards ──────────────────────────────────────────────────────────
function renderWatchlist(watchlist) {
  const grid = document.getElementById('watchlist-grid');
  if (!watchlist || !watchlist.length) {
    grid.innerHTML = '<div class="loading-state">No watchlist data.</div>';
    return;
  }
  grid.innerHTML = watchlist.map(s => _stockCard(s)).join('');
}

function _stockCard(s) {
  const v      = s.verdict || 'AVOID';
  const chgCls = s.change_1d >= 0 ? 'pos' : 'neg';
  const chgStr = (s.change_1d >= 0 ? '+' : '') + (s.change_1d || 0).toFixed(2) + '%';
  const sig    = (s.signals || {}).daily || {};
  const lvl    = s.levels || {};
  const rStr   = s.rs_vs_spy != null ? (s.rs_vs_spy > 0 ? '+' : '') + s.rs_vs_spy.toFixed(2) + '% vs SPY' : '';
  const earn   = s.earnings_risk ? `⚠ Earnings: ${s.earnings_date}` : '';
  const action = (s.moomoo || {}).note || '';
  const supp   = lvl.support  ? 'S: $' + lvl.support.toFixed(2)   : '';
  const res    = lvl.resistance ? 'R: $' + lvl.resistance.toFixed(2) : '';

  return `<div class="stock-card ${v}">
    <div class="sc-header">
      <span class="sc-sym">${s.symbol}</span>
      <div style="text-align:right">
        <div class="sc-price">$${(s.price||0).toFixed(2)}</div>
        <div class="sc-chg ${chgCls}">${chgStr}</div>
      </div>
    </div>
    <span class="verdict-badge ${v}">${v}</span>
    <div class="sc-summary">${s.summary || ''}</div>
    ${action ? `<div class="sc-action">${action}</div>` : ''}
    ${rStr   ? `<div class="sc-rs">${rStr}</div>` : ''}
    ${earn   ? `<div class="sc-earn">${earn}</div>` : ''}
    ${supp || res ? `<div class="sc-levels">${supp ? `<span class="sc-lvl">${supp}</span>` : ''}${res ? `<span class="sc-lvl">${res}</span>` : ''}</div>` : ''}
  </div>`;
}

// ── A+ Scanner ───────────────────────────────────────────────────────────────
function renderScanner(scanner) {
  const results  = scanner.results || [];
  const meta     = document.getElementById('scanner-meta');
  meta.textContent = `Scanned ${scanner.scanned || 0} stocks — ${results.length} A+ setups — as of ${fmtTs(scanner.as_of)}`;

  const tbody = document.getElementById('scanner-body');
  if (!results.length) {
    tbody.innerHTML = '<tr><td colspan="9" class="empty-row">No A+ setups found in current scan.</td></tr>';
    return;
  }
  tbody.innerHTML = results.map(s => {
    const sig    = (s.signals || {}).daily || {};
    const chgCls = s.change_1d >= 0 ? 'pos' : 'neg';
    const chgStr = (s.change_1d >= 0 ? '+' : '') + (s.change_1d || 0).toFixed(2) + '%';
    const rsCls  = s.rs_vs_spy > 0 ? 'pos' : s.rs_vs_spy < 0 ? 'neg' : 'neutral';
    const rStr   = (s.rs_vs_spy > 0 ? '+' : '') + (s.rs_vs_spy || 0).toFixed(2) + '%';
    const earn   = s.earnings_risk ? `<span style="color:var(--yellow)">⚠ ${s.earnings_date}</span>` : '—';
    return `<tr>
      <td><strong>${s.symbol}</strong></td>
      <td>$${(s.price||0).toFixed(2)}</td>
      <td class="${chgCls}">${chgStr}</td>
      <td><strong>${s.score}</strong></td>
      <td><span class="verdict-badge ${s.verdict}">${s.verdict}</span></td>
      <td class="tag-${sig.ema_stack}">${sig.ema_stack || '—'}</td>
      <td>${sig.rsi || '—'}</td>
      <td class="${rsCls}">${rStr}</td>
      <td>${earn}</td>
    </tr>`;
  }).join('');
}

// ── Signal breakdown table ───────────────────────────────────────────────────
function renderSignals(watchlist) {
  const tbody = document.getElementById('signals-body');
  if (!watchlist || !watchlist.length) {
    tbody.innerHTML = '<tr><td colspan="8" class="empty-row">No data.</td></tr>';
    return;
  }
  tbody.innerHTML = watchlist.map(s => {
    const sig   = (s.signals || {}).daily || {};
    const rsCls = s.rs_vs_spy > 0 ? 'pos' : s.rs_vs_spy < 0 ? 'neg' : 'neutral';
    const rStr  = (s.rs_vs_spy > 0 ? '+' : '') + (s.rs_vs_spy || 0).toFixed(2) + '%';
    const earn  = s.earnings_risk
      ? `<span style="color:var(--yellow)">⚠ ${s.earnings_date}</span>`
      : '<span class="neutral">—</span>';
    return `<tr>
      <td><strong>${s.symbol}</strong></td>
      <td><span class="verdict-badge ${s.verdict}">${s.verdict}</span></td>
      <td class="tag-${sig.ema_stack}">${sig.ema_stack || '—'}</td>
      <td>${sig.rsi || '—'}</td>
      <td class="tag-${sig.macd}">${sig.macd || '—'}</td>
      <td class="tag-${sig.volume}">${sig.volume || '—'}</td>
      <td class="${rsCls}">${rStr}</td>
      <td>${earn}</td>
    </tr>`;
  }).join('');
}

// ── L9 Intelligence ──────────────────────────────────────────────────────────
function renderL9(l9) {
  if (!l9) return;
  _setText('l9-active',   l9.active_count   ?? '—');
  _setText('l9-paper',    l9.paper_count    ?? '—');
  _setText('l9-promoted', l9.promoted_count ?? '—');
  _setText('l9-retired',  l9.retired_count  ?? '—');
  _setText('l9-rejected', l9.rejected_count ?? '—');

  const tbody   = document.getElementById('l9-body');
  const strats  = l9.active_strategies || [];
  if (!strats.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="empty-row">No active strategies yet — L9 cycle pending</td></tr>';
    return;
  }
  tbody.innerHTML = strats.map(s => {
    const trades  = s.paper_trades || 0;
    const wins    = s.paper_wins   || 0;
    const wr      = trades > 0 ? (wins / trades * 100).toFixed(0) + '%' : '—';
    const promoted = fmtDate(s.promoted_at || s.created_at);
    const symbols = (s.target_symbols || []).join(', ');
    return `<tr>
      <td>${s.name}</td>
      <td><span style="color:var(--text-muted)">${s.family || '—'}</span></td>
      <td><span class="verdict-badge ${s.status === 'paper' ? 'HOLD' : 'ACCUMULATE'}">${s.status}</span></td>
      <td>${symbols}</td>
      <td>${trades}</td>
      <td>${wr}</td>
      <td>${promoted}</td>
    </tr>`;
  }).join('');
}

// ── Paper Portfolio ──────────────────────────────────────────────────────────
function renderPortfolio(l9) {
  const p = (l9 || {}).portfolio || {};

  const equity  = p.equity   || 10000;
  const start   = p.starting || 10000;
  const roi     = p.roi_pct  || 0;
  const roiCls  = roi >= 0 ? 'pos' : 'neg';

  _setText('port-equity', '$' + equity.toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2}));
  document.getElementById('port-roi').textContent = (roi >= 0 ? '+' : '') + roi.toFixed(2) + '%';
  document.getElementById('port-roi').className   = 'ps-val ' + roiCls;
  _setText('port-open',   p.open_trades  || 0);
  _setText('port-trades', p.total_trades || 0);
  _setText('port-wr',     p.win_rate != null ? (p.win_rate * 100).toFixed(0) + '%' : '—');

  // Equity curve
  const hist = p.equity_history || [];
  _renderEquityChart(hist, start);

  // Open positions
  const openTbody = document.getElementById('open-pos-body');
  const openPos   = p.open_positions || [];
  if (!openPos.length) {
    openTbody.innerHTML = '<tr><td colspan="7" class="empty-row">No open positions</td></tr>';
  } else {
    openTbody.innerHTML = openPos.map(t => {
      const unreal    = t.unrealized_pnl || 0;
      const unrealCls = unreal >= 0 ? 'pos' : 'neg';
      const days = t.entry_date ? Math.round((Date.now() - new Date(t.entry_date)) / 86400000) : '—';
      return `<tr>
        <td><strong>${t.symbol}</strong></td>
        <td>${t.strategy_name || '—'}</td>
        <td>$${(t.entry_price||0).toFixed(2)}</td>
        <td>$${(t.current_price||0).toFixed(2)}</td>
        <td>${t.qty || 0}</td>
        <td class="${unrealCls}">${unreal >= 0 ? '+' : ''}$${unreal.toFixed(2)}</td>
        <td>${days}d</td>
      </tr>`;
    }).join('');
  }

  // Closed trades
  const closedTbody  = document.getElementById('closed-trades-body');
  const closedTrades = p.recent_trades || [];
  if (!closedTrades.length) {
    closedTbody.innerHTML = '<tr><td colspan="6" class="empty-row">No closed trades yet</td></tr>';
  } else {
    closedTbody.innerHTML = [...closedTrades].reverse().map(t => {
      const pnlPct = (t.pnl_pct || 0) * 100;
      const pnlCls = pnlPct >= 0 ? 'pos' : 'neg';
      const resBg  = t.result === 'win'
        ? 'rgba(34,197,94,.12)'
        : 'rgba(239,68,68,.12)';
      return `<tr>
        <td><strong>${t.symbol}</strong></td>
        <td><span style="background:${resBg};padding:.15rem .4rem;border-radius:3px;">${t.result || '—'}</span></td>
        <td>$${(t.entry_price||0).toFixed(2)}</td>
        <td>$${(t.exit_price||0).toFixed(2)}</td>
        <td class="${pnlCls}">${pnlPct >= 0 ? '+' : ''}${pnlPct.toFixed(2)}%</td>
        <td>${t.days_held || '—'}d</td>
      </tr>`;
    }).join('');
  }
}

function _renderEquityChart(hist, start) {
  const labels = hist.length ? hist.map(h => h.date) : ['—'];
  const values = hist.length ? hist.map(h => h.equity) : [start];
  const ctx    = document.getElementById('equity-chart').getContext('2d');

  if (equityChart) equityChart.destroy();
  equityChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        data:          values,
        borderColor:   '#3a7bd5',
        backgroundColor:'rgba(58,123,213,.07)',
        borderWidth:   2,
        pointRadius:   0,
        tension:       0.4,
        fill:          true,
      }],
    },
    options: {
      responsive:          true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: {
        callbacks: { label: ctx => '$' + ctx.parsed.y.toFixed(2) },
      }},
      scales: {
        x: { ticks: { color:'#6b7d93', maxTicksLimit:8, maxRotation:0 }, grid: { color:'rgba(30,45,66,.5)' } },
        y: { ticks: { color:'#6b7d93', callback: v => '$' + v.toLocaleString() }, grid: { color:'rgba(30,45,66,.5)' } },
      },
    },
  });
}

// ── News ─────────────────────────────────────────────────────────────────────
function renderNews(market) {
  const news = market.news || [];
  const ul   = document.getElementById('news-list');
  if (!news.length) {
    ul.innerHTML = '<li class="news-loading">No headlines available.</li>';
    return;
  }
  ul.innerHTML = news.map(n => {
    const dot = n.sentiment || 'neutral';
    return `<li class="news-item">
      <span class="news-dot ${dot}">&#9679;</span>
      <a href="${n.url || '#'}" target="_blank" rel="noopener">${n.title}</a>
    </li>`;
  }).join('');
}

// ── Utilities ─────────────────────────────────────────────────────────────────
function _setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

function fmtTs(iso) {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return d.toLocaleString('en-SG', { timeZone:'Asia/Singapore', month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' });
  } catch { return iso; }
}

function fmtDate(iso) {
  if (!iso) return '—';
  try { return iso.slice(0, 10); } catch { return iso; }
}

// ── Init ──────────────────────────────────────────────────────────────────────
refresh();
setInterval(refresh, 120_000);
setInterval(() => {
  const el = document.getElementById('last-ts');
  if (el && el.textContent !== '—') {
    // Re-read from meta without full refresh — update timestamp display
  }
}, 30_000);
