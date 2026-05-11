// Aura Natural/Ambient Popup Logic

const ICONS = {
  sell: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
    <path d="M12 8v4M12 16h.01"/>
  </svg>`,
  retain: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
  </svg>`,
  rights: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
    <circle cx="12" cy="7" r="4"/>
  </svg>`,
  idle: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
  </svg>`,
  error: `<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
  </svg>`
};

const ROW_META = [
  { label: 'Data Selling', icon: ICONS.sell },
  { label: 'Retention',    icon: ICONS.retain },
  { label: 'User Rights',  icon: ICONS.rights },
];

const STATUS_LABELS = { low: 'Safe', med: 'Caution', high: 'Risky', scanning: 'Listening', inactive: 'Inactive' };

function setStatus(level) {
  const badge = document.getElementById('status-badge');
  const text = document.getElementById('status-text');
  
  // Reset styles
  badge.style.borderColor = 'var(--text-primary)';
  badge.style.color = 'var(--text-primary)';

  if (level === 'low') {
    badge.style.borderColor = 'var(--sage-green)';
    badge.style.color = 'var(--sage-green)';
  } else if (level === 'med' || level === 'high') {
    badge.style.borderColor = 'var(--terracotta)';
    badge.style.color = 'var(--terracotta)';
  }

  text.textContent = STATUS_LABELS[level] || level;
}

function renderIdle() {
  setStatus('inactive');
  document.getElementById('main-content').innerHTML = `
    <div class="empty-state">
      <div class="hand-drawn-icon">${ICONS.idle}</div>
      <h2 class="empty-title">Resting</h2>
      <p class="empty-sub">Aura is currently inactive. Navigate to a privacy policy or terms page to begin.</p>
    </div>
  `;
}

function renderLoading() {
  setStatus('scanning');
  document.getElementById('main-content').innerHTML = `
    <div class="empty-state loading-pulse">
      <div class="hand-drawn-icon">${ICONS.idle}</div>
      <h2 class="empty-title">Listening...</h2>
      <p class="empty-sub">Aura is analyzing the privacy landscape of this page.</p>
    </div>
  `;
}

function renderResult(hostname, riskLevel, summary) {
  setStatus(riskLevel || 'low');

  const rows = ROW_META.map((meta, i) => {
    const text = (summary && summary[i]) ? summary[i] : '—';
    const clean = text.replace(/^(Data Selling|Retention|User Rights)\s*[:–-]\s*/i, '').trim();
    
    // Determine if this card should have a warning style
    const isWarning = (riskLevel === 'med' && i === 1) || (riskLevel === 'high'); // Simplified logic for demo
    
    return `
      <div class="summary-card ${isWarning ? 'warning' : ''}">
        <div class="card-icon">${meta.icon}</div>
        <div class="card-content">
          <div class="card-label">${meta.label}</div>
          <div class="card-text">${clean}</div>
        </div>
      </div>
    `;
  }).join('');

  document.getElementById('main-content').innerHTML = `
    <div class="summary-list">
      <div style="margin-bottom: 8px; text-align: left;">
        <span class="card-label" style="opacity: 0.6;">Aura Analysis for ${hostname}</span>
      </div>
      ${rows}
    </div>
  `;
}

function renderError() {
  setStatus('high');
  document.getElementById('main-content').innerHTML = `
    <div class="empty-state">
      <div class="hand-drawn-icon" style="color: var(--terracotta); opacity: 0.5;">${ICONS.error}</div>
      <h2 class="empty-title">Signal Lost</h2>
      <p class="empty-sub">We couldn't reach the analysis server. Please check your connection.</p>
    </div>
  `;
}

// ── Main ──
chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  const tab = tabs[0];
  if (!tab || !tab.url) { renderIdle(); return; }

  const url = tab.url;
  if (url.startsWith('chrome://') || url.startsWith('chrome-extension://') || url.startsWith('about:')) {
    renderIdle(); return;
  }

  let hostname = url;
  try { hostname = new URL(url).hostname; } catch (_) {}

  const isPrivacyPage = url.toLowerCase().includes('privacy') || url.toLowerCase().includes('terms');
  if (!isPrivacyPage) { renderIdle(); return; }

  const storageKey = `aura_result_${tab.id}`;
  let resolved = false;

  function tryRender(stored) {
    if (resolved) return;
    if (!stored) return;
    resolved = true;
    stored.error ? renderError() : renderResult(hostname, stored.riskLevel, stored.summary);
  }

  // Show loading state
  renderLoading();

  // 1. Read immediately
  chrome.storage.local.get([storageKey], (data) => {
    tryRender(data[storageKey]);
  });

  // 2. Live listener
  chrome.storage.onChanged.addListener(function listener(changes, area) {
    if (area === 'local' && changes[storageKey]) {
      tryRender(changes[storageKey].newValue);
      if (resolved) chrome.storage.onChanged.removeListener(listener);
    }
  });

  // 3. Polling fallback
  let polls = 0;
  const poll = setInterval(() => {
    if (resolved || polls >= 20) { clearInterval(poll); return; }
    polls++;
    chrome.storage.local.get([storageKey], (data) => {
      if (data[storageKey]) {
        clearInterval(poll);
        tryRender(data[storageKey]);
      }
    });
  }, 500);
});
