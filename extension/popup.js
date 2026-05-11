// popup.js

// Lucide SVG icons (inline, no external dependency)
const ICONS = {
  // Data selling → share-2
  sell: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
    <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
  </svg>`,
  // Retention → clock
  retain: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
  </svg>`,
  // User rights → user-check
  rights: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
    <circle cx="12" cy="7" r="4"/>
    <polyline points="16 11 18 13 22 9"/>
  </svg>`,
  // Globe
  globe: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="12" cy="12" r="10"/>
    <line x1="2" y1="12" x2="22" y2="12"/>
    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
  </svg>`,
  // Alert for error
  alert: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
  </svg>`,
  // Shield for idle
  shield: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
  </svg>`
};

const ROW_META = [
  { label: 'Data Selling', icon: ICONS.sell },
  { label: 'Retention',    icon: ICONS.retain },
  { label: 'User Rights',  icon: ICONS.rights },
];

const STATUS_LABELS = { low: 'Safe', med: 'Caution', high: 'Risky', scanning: 'Scanning' };

function setStatus(level) {
  const pill = document.getElementById('status-pill');
  const text = document.getElementById('status-text');
  pill.className = `status-pill ${level}`;
  text.textContent = STATUS_LABELS[level] || level;
}

function renderIdle(hostname) {
  setStatus('scanning');
  document.getElementById('status-text').textContent = 'Inactive';
  document.getElementById('main-content').innerHTML = `
    <div class="idle-state">
      <div class="idle-icon">${ICONS.shield}</div>
      <div class="idle-title">No policy page detected</div>
      <div class="idle-sub">Navigate to a Privacy Policy or Terms page for Aura analysis.</div>
    </div>
  `;
}

function renderLoading(hostname) {
  document.getElementById('main-content').innerHTML = `
    <div class="content">
      <div class="skeleton-base skeleton-url"></div>
      <div class="skeleton-base skeleton-label"></div>
      <div class="skeleton-base skeleton-row"></div>
      <div class="skeleton-base skeleton-row"></div>
      <div class="skeleton-base skeleton-row"></div>
    </div>
  `;
}

function renderResult(hostname, riskLevel, summary) {
  setStatus(riskLevel || 'low');

  const rows = ROW_META.map((meta, i) => {
    const text = (summary && summary[i]) ? summary[i] : '—';
    // Strip any leading label like "Data Selling:" that Gemini might still include
    const clean = text.replace(/^(Data Selling|Retention|User Rights)\s*[:–-]\s*/i, '').trim();
    return `
      <div class="summary-row">
        <div class="row-icon">${meta.icon}</div>
        <div>
          <div class="row-label">${meta.label}</div>
          <div class="row-text">${clean}</div>
        </div>
      </div>
      ${i < 2 ? '<div class="divider"></div>' : ''}
    `;
  }).join('');

  document.getElementById('main-content').innerHTML = `
    <div class="content">
      <div class="url-bar">${ICONS.globe}<span class="url-text">${hostname}</span></div>
      <div class="section-label">Privacy Summary</div>
      <div class="summary-list">${rows}</div>
    </div>
  `;
}

function renderError() {
  setStatus('high');
  document.getElementById('main-content').innerHTML = `
    <div class="idle-state">
      <div class="idle-icon" style="color:#3f3f3f;">${ICONS.alert}</div>
      <div class="idle-title">Analysis failed</div>
      <div class="idle-sub">Backend unreachable. Ensure the Next.js server is running on port 3000.</div>
    </div>
  `;
}

// ── Main ──
chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  const tab = tabs[0];
  if (!tab || !tab.url) { renderIdle(''); return; }

  const url = tab.url;
  if (url.startsWith('chrome://') || url.startsWith('chrome-extension://') || url.startsWith('about:')) {
    renderIdle(''); return;
  }

  let hostname = url;
  try { hostname = new URL(url).hostname; } catch (_) {}

  const isPrivacyPage = url.toLowerCase().includes('privacy') || url.toLowerCase().includes('terms');
  if (!isPrivacyPage) { renderIdle(hostname); return; }

  const storageKey = `aura_result_${tab.id}`;
  let resolved = false;

  function tryRender(stored) {
    if (resolved) return;
    if (!stored) return;
    resolved = true;
    stored.error ? renderError() : renderResult(hostname, stored.riskLevel, stored.summary);
  }

  // Show loading state
  renderLoading(hostname);

  // 1. Read immediately — result might already be cached from a prior load
  chrome.storage.local.get([storageKey], (data) => {
    tryRender(data[storageKey]);
  });

  // 2. Live listener — catches result if it lands while popup is open
  chrome.storage.onChanged.addListener(function listener(changes, area) {
    if (area === 'local' && changes[storageKey]) {
      tryRender(changes[storageKey].newValue);
      if (resolved) chrome.storage.onChanged.removeListener(listener);
    }
  });

  // 3. Polling fallback — catches result if onChanged fired before listener registered
  let polls = 0;
  const poll = setInterval(() => {
    if (resolved || polls >= 20) { clearInterval(poll); return; } // max 10s
    polls++;
    chrome.storage.local.get([storageKey], (data) => {
      if (data[storageKey]) {
        clearInterval(poll);
        tryRender(data[storageKey]);
      }
    });
  }, 500);
});

// ── Download Risk: listen for real-time alert from background.js ───
chrome.runtime.onMessage.addListener((message) => {
  if (message.action === 'downloadRiskUpdate') {
    renderDownloadAlert(message.url);
  }
});

/**
 * Injects a calm inline banner at the top of the popup's main-content
 * when a suspicious download is detected while the popup is open.
 */
function renderDownloadAlert(url) {
  const existing = document.getElementById('download-alert-banner');
  if (existing) return; // already showing

  let hostname = url;
  try { hostname = new URL(url).hostname; } catch (_) {}

  const banner = document.createElement('div');
  banner.id = 'download-alert-banner';
  banner.style.cssText = `
    margin: 14px 16px 0;
    padding: 10px 12px;
    background: #fef2f2;
    border: 1px solid #fecaca;
    border-left: 4px solid #ef4444;
    border-radius: 8px;
    font-size: 11.5px;
    line-height: 1.5;
    color: #991b1b;
  `;
  banner.innerHTML = `
    <div style="font-weight:600;color:#111827;margin-bottom:3px;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;">Download Notice</div>
    <div style="color:#4b5563;">${hostname} — source metadata inconsistent with browsing flow.</div>
  `;

  const mainContent = document.getElementById('main-content');
  if (mainContent) mainContent.prepend(banner);
}
