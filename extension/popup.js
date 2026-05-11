// popup.js

// ─── Tab switching ───────────────────────────────────────────────
function switchTab(name) {
  ['privacy', 'security'].forEach(t => {
    document.getElementById(`tab-${t}`).classList.toggle('active', t === name);
    document.getElementById(`panel-${t}`).classList.toggle('active', t === name);
  });
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('tab-privacy').addEventListener('click', () => switchTab('privacy'));
  document.getElementById('tab-security').addEventListener('click', () => switchTab('security'));
});

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
    background: rgba(224, 122, 95, 0.1);
    border: 1px solid rgba(171, 92, 72, 0.3);
    border-left: 4px solid #E07A5F;
    border-radius: 8px;
    font-size: 11.5px;
    line-height: 1.5;
    color: #AB5C48;
  `;
  banner.innerHTML = `
    <div style="font-weight:600;color:#AB5C48;margin-bottom:3px;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;">Download Notice</div>
    <div style="color:#AB5C48;">${hostname} — source metadata inconsistent with browsing flow.</div>
  `;

  const mainContent = document.getElementById('main-content');
  if (mainContent) mainContent.prepend(banner);
}

// ═══════════════════════════════════════════════════════════
// ── Phase 1: Security Tab ───────────────────────────────────
// ═══════════════════════════════════════════════════════════

function renderSecurityLoading() {
  document.getElementById('security-content').innerHTML = `
    <div class="content">
      <div class="sec-skeleton">
        <div class="skeleton-base sec-skeleton-row"></div>
        <div class="skeleton-base sec-skeleton-row"></div>
        <div class="skeleton-base sec-skeleton-row"></div>
        <div class="skeleton-base sec-skeleton-row"></div>
      </div>
    </div>
  `;
}

function renderSecurityError(msg) {
  document.getElementById('security-content').innerHTML = `
    <div class="content">
      <div class="idle-state">
        <div class="idle-icon">${ICONS.alert}</div>
        <div class="idle-title">Security check failed</div>
        <div class="idle-sub">${msg || 'Backend unreachable. Ensure the Next.js server is running.'}</div>
      </div>
    </div>
  `;
}

/**
 * renderSecurity — renders the full Security tab content.
 * @param {object} integrity — aura_integrity_{tabId} object from chrome.storage
 * @param {object} threat    — aura_threat_{tabId} object from chrome.storage
 * @param {object} ai        — aura_ai_{tabId} object from chrome.storage
 * @param {object} dbInfo    — metadata about the local threat database
 */
function renderSecurity({ integrity, threat, ai, dbInfo }) {
  const container = document.getElementById('security-content');

  // ─ Certificate & Integrity ─────────────────────────────
  const cert = integrity ? integrity.certificate : null;
  const isSecure = integrity ? integrity.connectionSecure : false;

  let certHTML = '';
  if (cert) {
    const expiryClass = cert.isExpired
      ? 'expiry-err'
      : cert.isExpiringSoon ? 'expiry-warn' : 'expiry-ok';
    const expiryLabel = cert.isExpired
      ? `EXPIRED ${Math.abs(cert.daysRemaining)}d ago`
      : `${cert.daysRemaining}d remaining`;

    // Format validTo date nicely
    let expiryDisplay = cert.validTo;
    try { expiryDisplay = new Date(cert.validTo).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' }); } catch (_) {}

    certHTML = `
      <div class="cert-row">
        <div class="cert-key">Domain</div>
        <div class="cert-val">${cert.subjectName}</div>
      </div>
      <div class="cert-row">
        <div class="cert-key">Issuer</div>
        <div class="cert-val">${cert.issuerName}</div>
      </div>
      <div class="cert-row">
        <div class="cert-key">Expires</div>
        <div class="cert-val ${expiryClass}">${expiryDisplay} &mdash; <strong>${expiryLabel}</strong></div>
      </div>
    `;
  } else {
    certHTML = `<div class="cert-row"><div class="cert-val" style="color:#555">Certificate data unavailable</div></div>`;
  }

  // ─ Security headers grid ────────────────────────────
  const sh = integrity ? (integrity.securityHeaders || {}) : {};
  const headerPills = [
    { label: 'HSTS',           key: 'hsts' },
    { label: 'CSP',            key: 'csp' },
    { label: 'X-Frame',        key: 'xFrameOptions' },
    { label: 'X-Content-Type', key: 'xContentTypeOptions' },
    { label: 'Referrer Policy',key: 'referrerPolicy' },
  ].map(h => `
    <div class="header-pill ${sh[h.key] ? 'ok' : 'fail'}">
      <div class="h-dot"></div>${h.label}
    </div>
  `).join('');

  // ─ Issues list ────────────────────────────────────
  const issues = integrity ? (integrity.issues || []) : [];
  const issuesHTML = issues.length === 0
    ? `<div class="no-issues">✓ No security issues detected</div>`
    : issues.map(i => `
        <div class="issue-row">
          <div class="issue-dot"></div>
          <div class="issue-text">${i}</div>
        </div>
      `).join('');

  container.innerHTML = `
    <div class="content">
      <!-- Protocol + connection bar -->
      <div class="url-bar" style="margin-bottom:10px;">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="${isSecure ? '#7fc8a9' : '#b06060'}" stroke-width="2">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
        </svg>
        <span class="url-text" style="color:${isSecure ? '#5a9e82' : '#9e5a5a'}">
          ${isSecure ? 'Connection Secure' : 'Connection Not Fully Secure'}
        </span>
        <span class="protocol-badge" style="margin-left:auto;flex-shrink:0">${integrity ? (integrity.protocol || 'HTTPS') : 'N/A'}</span>
      </div>

      <!-- Threat Shield Banner -->
      <div class="section-label" style="display:flex;justify-content:space-between;">
        Database Shield
        <span style="color:#555;font-size:9px;font-weight:400;text-transform:none;letter-spacing:0;">
          ${dbInfo ? `${(dbInfo.count / 1000).toFixed(0)}k records (24h)` : 'No DB'}
        </span>
      </div>
      <div class="threat-banner ${threat && threat.blacklisted ? 'warn' : 'safe'}">
        <div class="threat-banner-icon">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="${threat && threat.blacklisted ? '#b06060' : '#7fc8a9'}" stroke-width="2">
            ${threat && threat.blacklisted 
                ? '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>'
                : '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 12 11 14 15 10"/>'
            }
          </svg>
        </div>
        <div class="threat-banner-text">
          <div class="threat-title">${threat && threat.blacklisted ? 'Threat Detected' : 'No Database Threats'}</div>
          <div class="threat-desc">
            ${threat && threat.blacklisted 
               ? `Domain matched in ${threat.source || 'blocklist'}. Phishing risk high.`
               : 'Domain is not listed in offline threat databases.'}
          </div>
        </div>
      </div>

      <!-- AI Inference Banner -->
      <div class="section-label">AI Zero-Day Inference</div>
      <div class="ai-banner ${ai && ai.riskLevel === 'high' ? 'warn' : 'safe'}">
        <div class="threat-banner-icon">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
          </svg>
        </div>
        <div class="threat-banner-text">
          <div class="threat-title">${ai && ai.riskLevel === 'high' ? 'Zero-Day Detected' : 'No AI Anomalies'} ${ai ? `(Score: ${ai.score})` : ''}</div>
          <div class="threat-desc">${ai ? ai.reason : 'Heuristic evaluation complete. Continuous AI monitoring active.'}</div>
        </div>
      </div>

      <!-- Certificate -->
      <div class="section-label">TLS Certificate</div>
      <div class="cert-card">
        <div class="cert-card-header">
          <div class="cert-card-title">Certificate Details</div>
          <div class="cert-secure-badge ${isSecure && cert ? 'ok' : 'err'}">
            ${isSecure && cert ? 'Valid' : 'Issue Detected'}
          </div>
        </div>
        ${certHTML}
      </div>

      <!-- Security headers -->
      <div class="section-label">Security Headers</div>
      <div class="headers-grid">${headerPills}</div>

      <!-- Issues -->
      ${issues.length > 0 ? '<div class="section-label">Issues Found</div>' : ''}
      <div class="issues-list">${issuesHTML}</div>
    </div>
  `;
}

// ── Load Security data when popup opens ───────────────────────
// Runs immediately (data may already be in storage from background.js)
chrome.tabs.query({ active: true, currentWindow: true }, (tabsForSec) => {
  const tab = tabsForSec[0];
  if (!tab) return;

  function loadSecurityData() {
    Promise.all([
      new Promise(r => chrome.runtime.sendMessage({ action: 'getIntegrityReport', tabId: tab.id }, r)),
      new Promise(r => chrome.runtime.sendMessage({ action: 'getThreatReport', tabId: tab.id }, r)),
      new Promise(r => chrome.runtime.sendMessage({ action: 'getAIReport', tabId: tab.id }, r))
    ]).then(([integRes, threatRes, aiRes]) => {
      const integrity = integRes?.data || null;
      const threat    = threatRes?.threat || null;
      const dbInfo    = threatRes?.dbInfo || null;
      const ai        = aiRes?.data || null;

      if (integrity) {
        renderSecurity({ integrity, threat, ai, dbInfo });
      } else {
        // Data missing (maybe popup opened on an already-loaded tab before the extension ran)
        // Trigger a manual audit and leave the skeleton loader up
        chrome.runtime.sendMessage({ action: 'runAudit', tabId: tab.id });
      }
    });
  }

  // Initial load
  loadSecurityData();

  // Also listen for changes (since checkDomainThreat, runIntegrityAudit, runZeroDayInference are async)
  const integKey  = `aura_integrity_${tab.id}`;
  const threatKey = `aura_threat_${tab.id}`;
  const aiKey     = `aura_ai_${tab.id}`;
  
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && (changes[integKey] || changes[threatKey] || changes[aiKey])) {
      loadSecurityData();
    }
  });
});
