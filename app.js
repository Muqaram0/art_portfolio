const state = { market: null, signals: [], charts: {}, institutionFilter: 'All', cultureFilter: 'All' };

const $ = (selector) => document.querySelector(selector);
const formatDate = (value) => value ? new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'short', day: 'numeric' }).format(new Date(value)) : 'Pending first refresh';
const pct = (value) => Number.isFinite(value) ? `${value >= 0 ? '+' : ''}${value.toFixed(1)}%` : '—';

async function loadJson(path) {
  const response = await fetch(`${path}?v=${Date.now()}`);
  if (!response.ok) throw new Error(`${path}: ${response.status}`);
  return response.json();
}

function seriesEntries() {
  return Object.entries(state.market?.series || {}).filter(([, item]) => Array.isArray(item.points) && item.points.length > 2);
}

function populateAssetControls() {
  const entries = seriesEntries();
  const options = entries.map(([symbol, item]) => `<option value="${symbol}">${item.name} · ${symbol}</option>`).join('');
  $('#asset-a').innerHTML = options;
  $('#asset-b').innerHTML = options;
  const preferredA = entries.find(([symbol]) => symbol === 'ES=F')?.[0] || entries[0]?.[0];
  const preferredB = entries.find(([symbol]) => symbol === 'SPY')?.[0] || entries[1]?.[0] || preferredA;
  $('#asset-a').value = preferredA || '';
  $('#asset-b').value = preferredB || '';
}

function alignSeries(a, b, windowSize) {
  const bMap = new Map(b.points.map(point => [point.date, point.close]));
  return a.points.map(point => ({ date: point.date, a: point.close, b: bMap.get(point.date) }))
    .filter(row => Number.isFinite(row.a) && Number.isFinite(row.b))
    .slice(-windowSize);
}

function dailyReturns(values) {
  return values.slice(1).map((value, i) => value / values[i] - 1);
}

function rollingCorrelation(a, b, length = 60) {
  const out = [];
  for (let i = length; i <= a.length; i++) {
    const x = a.slice(i - length, i), y = b.slice(i - length, i);
    const mx = x.reduce((s, v) => s + v, 0) / x.length;
    const my = y.reduce((s, v) => s + v, 0) / y.length;
    let num = 0, dx = 0, dy = 0;
    for (let j = 0; j < x.length; j++) {
      const vx = x[j] - mx, vy = y[j] - my;
      num += vx * vy; dx += vx * vx; dy += vy * vy;
    }
    out.push(num / Math.sqrt(dx * dy));
  }
  return out;
}

function returnFor(points, days) {
  if (points.length < 2) return NaN;
  const start = points[Math.max(0, points.length - 1 - days)].close;
  const end = points.at(-1).close;
  return (end / start - 1) * 100;
}

function chartOptions(yTitle = '') {
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: { legend: { labels: { color: '#a4a7ad', usePointStyle: true, boxWidth: 8 } } },
    scales: {
      x: { ticks: { color: '#7e828a', maxTicksLimit: 7 }, grid: { color: 'rgba(255,255,255,.045)' } },
      y: { title: { display: Boolean(yTitle), text: yTitle, color: '#7e828a' }, ticks: { color: '#7e828a' }, grid: { color: 'rgba(255,255,255,.06)' } }
    }
  };
}

function makeChart(key, canvas, config) {
  state.charts[key]?.destroy();
  state.charts[key] = new Chart(canvas, config);
}

function renderMarkets() {
  const a = state.market?.series?.[$('#asset-a').value];
  const b = state.market?.series?.[$('#asset-b').value];
  const windowSize = Number($('#window-select').value);
  if (!a || !b) {
    $('#market-status').textContent = 'Awaiting data';
    $('#market-metrics').innerHTML = '<div class="empty">The first scheduled data refresh has not completed yet.</div>';
    return;
  }
  const aligned = alignSeries(a, b, windowSize);
  if (aligned.length < 3) return;
  const baseA = aligned[0].a, baseB = aligned[0].b;
  const normalizedA = aligned.map(row => row.a / baseA * 100);
  const normalizedB = aligned.map(row => row.b / baseB * 100);
  const ratio = aligned.map(row => row.a / row.b);
  const ra = dailyReturns(aligned.map(row => row.a));
  const rb = dailyReturns(aligned.map(row => row.b));
  const corr = rollingCorrelation(ra, rb, 60);
  const corrDates = aligned.slice(61).map(row => row.date);

  makeChart('normalized', $('#normalized-chart'), {
    type: 'line',
    data: { labels: aligned.map(row => row.date), datasets: [
      { label: a.name, data: normalizedA, borderColor: '#d8ff68', pointRadius: 0, borderWidth: 2 },
      { label: b.name, data: normalizedB, borderColor: '#72d8ff', pointRadius: 0, borderWidth: 2 }
    ] },
    options: chartOptions('Indexed value')
  });
  makeChart('ratio', $('#ratio-chart'), {
    type: 'line',
    data: { labels: aligned.map(row => row.date), datasets: [{ label: `${a.symbol}/${b.symbol}`, data: ratio, borderColor: '#d8ff68', backgroundColor: 'rgba(216,255,104,.08)', fill: true, pointRadius: 0, borderWidth: 2 }] },
    options: chartOptions('Ratio')
  });
  makeChart('correlation', $('#correlation-chart'), {
    type: 'line',
    data: { labels: corrDates, datasets: [{ label: '60-day correlation', data: corr, borderColor: '#72d8ff', pointRadius: 0, borderWidth: 2 }] },
    options: { ...chartOptions('Correlation'), scales: { ...chartOptions().scales, y: { ...chartOptions().scales.y, min: -1, max: 1 } } }
  });

  const metrics = [
    ['1M return', pct(returnFor(a.points, 21)), returnFor(a.points, 21)],
    ['3M return', pct(returnFor(a.points, 63)), returnFor(a.points, 63)],
    ['1Y return', pct(returnFor(a.points, 252)), returnFor(a.points, 252)],
    ['Latest ratio', ratio.at(-1).toFixed(3), 0]
  ];
  $('#market-metrics').innerHTML = metrics.map(([label, value, direction]) => `<div class="metric-card"><span>${label}</span><strong class="${direction > 0 ? 'positive' : direction < 0 ? 'negative' : ''}">${value}</strong></div>`).join('');
  $('#market-status').textContent = `${seriesEntries().length} assets live`;
  $('#last-refresh').textContent = formatDate(state.market.generated_at);
  $('#market-note').textContent = `${state.market.source}. ${state.market.disclaimer}`;
}

function signalCard(signal) {
  return `<article class="signal-card">
    <div class="signal-top"><span>${signal.entity}</span><span>${formatDate(signal.date)}</span></div>
    <h3>${signal.title}</h3>
    <p>${signal.summary}</p>
    <div class="score-row"><span class="score">Strength ${signal.strength}/5</span><span class="score">Novelty ${signal.novelty}/5</span><span class="score">${signal.category}</span></div>
    <p class="signal-thesis"><strong>Working thesis:</strong> ${signal.thesis}</p>
    <a class="signal-link" href="${signal.source}" target="_blank" rel="noreferrer">Primary source ↗</a>
  </article>`;
}

function renderFilterButtons(target, kind, active) {
  const categories = ['All', ...new Set(state.signals.filter(s => s.kind === kind).map(s => s.category))];
  $(target).innerHTML = categories.map(category => `<button class="filter-button ${category === active ? 'active' : ''}" data-kind="${kind}" data-category="${category}">${category}</button>`).join('');
}

function renderSignals() {
  renderFilterButtons('#institution-filters', 'institution', state.institutionFilter);
  renderFilterButtons('#culture-filters', 'culture', state.cultureFilter);
  const institution = state.signals.filter(s => s.kind === 'institution' && (state.institutionFilter === 'All' || s.category === state.institutionFilter));
  const culture = state.signals.filter(s => s.kind === 'culture' && (state.cultureFilter === 'All' || s.category === state.cultureFilter));
  $('#institution-grid').innerHTML = institution.map(signalCard).join('') || '<div class="empty">No signals in this filter.</div>';
  $('#culture-grid').innerHTML = culture.map(signalCard).join('') || '<div class="empty">No signals in this filter.</div>';
  $('#signal-count').textContent = `${state.signals.length} curated`;
}

function bindEvents() {
  ['#asset-a', '#asset-b', '#window-select'].forEach(selector => $(selector).addEventListener('change', renderMarkets));
  document.addEventListener('click', event => {
    const button = event.target.closest('.filter-button');
    if (!button) return;
    if (button.dataset.kind === 'institution') state.institutionFilter = button.dataset.category;
    if (button.dataset.kind === 'culture') state.cultureFilter = button.dataset.category;
    renderSignals();
  });
}

async function init() {
  try {
    const [market, signalData] = await Promise.all([loadJson('data/market.json'), loadJson('data/signals.json')]);
    state.market = market;
    state.signals = signalData.signals || [];
    populateAssetControls();
    renderMarkets();
    renderSignals();
    bindEvents();
  } catch (error) {
    console.error(error);
    $('#market-status').textContent = 'Data error';
    $('#institution-grid').innerHTML = `<div class="empty">Could not load dashboard data: ${error.message}</div>`;
  }
}

window.addEventListener('DOMContentLoaded', init);
