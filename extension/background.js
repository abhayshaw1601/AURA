// background.js

const CACHE_TTL_MS     = 24 * 60 * 60 * 1000; // 24 hours
const INTEGRITY_TTL_MS = 60 * 60 * 1000;       // 1 hour — cert data refreshes faster
const THREAT_DB_TTL_MS = 24 * 60 * 60 * 1000;  // 24 hours — threat list refresh
const API_BASE         = 'http://localhost:3000'; // Next.js backend

// In-memory threat Set — rebuilt from chrome.storage.local on service-worker wake
let _threatSet = null;

// ── Cache helpers ──────────────────────────────────────────────────

function cacheKey(url) {
  // Normalize: strip query params and hash, keep scheme + host + path
  try {
    const u = new URL(url);
    return `aura_cache::${u.hostname}${u.pathname}`;
  } catch (_) {
    return `aura_cache::${url}`;
  }
}

function readCache(url) {
  return new Promise(resolve => {
    const key = cacheKey(url);
    chrome.storage.local.get([key], data => {
      const entry = data[key];
      if (!entry) return resolve(null);
      // Invalidate if expired
      if (Date.now() - entry.cachedAt > CACHE_TTL_MS) {
        chrome.storage.local.remove([key]);
        return resolve(null);
      }
      // Never serve a cached error — force a fresh API call
      if (entry.data && entry.data.error) {
        chrome.storage.local.remove([key]);
        return resolve(null);
      }
      resolve(entry.data);
    });
  });
}

function writeCache(url, data) {
  const key = cacheKey(url);
  chrome.storage.local.set({ [key]: { data, cachedAt: Date.now() } });
}

// ── Store result & update badge for a tab ─────────────────────────

function applyResult(tabId, data) {
  if (tabId) {
    chrome.storage.local.set({ [`aura_result_${tabId}`]: data });
    const riskLevel = data.riskLevel || 'low';
    const badgeColors = { low: '#81B29A', med: '#E07A5F', high: '#AB5C48' }; // Safe, Warning, Danger
    const badgeTexts  = { low: '✓',      med: '!',       high: '✕' };
    chrome.action.setBadgeText({ text: badgeTexts[riskLevel] || '?', tabId });
    chrome.action.setBadgeBackgroundColor({ color: badgeColors[riskLevel] || '#404040', tabId });
  }
}

// ── Message listener ──────────────────────────────────────────────

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {

  if (request.action === 'summarizePrivacyPolicy') {
    const tabId   = sender.tab?.id;
    const pageUrl = request.pageUrl || '';

    // 1. Check cache first
    readCache(pageUrl).then(cached => {
      if (cached) {
        console.log('[Aura] Cache HIT for', pageUrl);
        applyResult(tabId, cached);
        sendResponse({ success: true, data: cached, fromCache: true });
        return;
      }

      // 2. Cache MISS — call the API
      console.log('[Aura] Cache MISS — calling API for', pageUrl);
      fetch(`${API_BASE}/api/summarize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: request.text })
      })
        .then(res => res.json())
        .then(data => {
          writeCache(pageUrl, data);   // only cache valid results
          applyResult(tabId, data);
          sendResponse({ success: true, data, fromCache: false });
        })
        .catch(err => {
          if (tabId) {
            chrome.storage.local.set({ [`aura_result_${tabId}`]: { error: true } });
            chrome.action.setBadgeText({ text: 'ERR', tabId });
            chrome.action.setBadgeBackgroundColor({ color: '#2a2a2a', tabId });
          }
          sendResponse({ success: false, error: err.toString() });
        });
    });

    return true; // async
  }

  if (request.action === 'checkMisinformation') {
    fetch(`${API_BASE}/api/trust-shield`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ texts: request.texts })
    })
      .then(res => res.json())
      .then(data => sendResponse({ success: true, data }))
      .catch(err => sendResponse({ success: false, error: err.toString() }));

    return true;
  }

  // ── Manual Audit Trigger (from popup if tab data is missing) ──────
  if (request.action === 'runAudit') {
    chrome.tabs.get(request.tabId, (tab) => {
      if (tab && tab.url) {
        runIntegrityAudit(tab.id, tab.url);
        checkDomainThreat(tab.id, tab.url);
      }
    });
    // Don't need a response, the popup listens to chrome.storage.onChanged
    sendResponse({ success: true });
    return true;
  }

  // ── Phase 1: Serve cached integrity report to popup ──────────────
  if (request.action === 'getIntegrityReport') {
    const tabId = request.tabId;
    chrome.storage.local.get([`aura_integrity_${tabId}`], (data) => {
      sendResponse({ data: data[`aura_integrity_${tabId}`] || null });
    });
    return true;
  }

  // ── Phase 2: Serve cached threat report to popup ───────────────
  if (request.action === 'getThreatReport') {
    const tabId = request.tabId;
    chrome.storage.local.get(
      [`aura_threat_${tabId}`, 'aura_threat_db'],
      (data) => {
        const threatResult = data[`aura_threat_${tabId}`] || null;
        const db = data['aura_threat_db'];
        sendResponse({
          threat: threatResult,
          dbInfo: db ? { count: db.count, syncedAt: db.syncedAt, source: db.source } : null,
        });
      }
    );
    return true;
  }

  // ── Phase 3: Serve AI inference report to popup ────────────────
  if (request.action === 'getAIReport') {
    const tabId = request.tabId;
    chrome.storage.local.get([`aura_ai_${tabId}`], (data) => {
      sendResponse({ data: data[`aura_ai_${tabId}`] || null });
    });
    return true;
  }

  // ── Phase 2: Manual DB sync trigger (from popup "Refresh" button) ──
  if (request.action === 'syncThreatDb') {
    syncThreatDatabase(true).then(() => sendResponse({ success: true }));
    return true;
  }
});

// ═══════════════════════════════════════════════════════════════════
// ── Phase 1: Integrity Auditor ─────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════

/**
 * runIntegrityAudit — calls the /api/cert-check backend to retrieve
 * real TLS peer certificate data and security headers for a domain.
 * Result stored as aura_integrity_{tabId} with a 1-hour TTL.
 *
 * @param {number} tabId
 * @param {string} pageUrl  — full URL of the navigated page
 */
async function runIntegrityAudit(tabId, pageUrl) {
  let hostname;
  try {
    const parsed = new URL(pageUrl);
    // Only audit HTTPS pages
    if (parsed.protocol !== 'https:') {
      chrome.storage.local.set({
        [`aura_integrity_${tabId}`]: {
          connectionSecure: false,
          protocol: parsed.protocol.replace(':', '').toUpperCase(),
          certificate: null,
          securityHeaders: { hsts: false, csp: false, xFrameOptions: false, xContentTypeOptions: false, referrerPolicy: false },
          issues: ['Page is not served over HTTPS'],
          auditedAt: Date.now(),
        }
      });
      return;
    }
    hostname = parsed.hostname;
  } catch (_) {
    return; // Unparseable URL — skip
  }

  // Check 1-hour integrity cache (keyed by hostname)
  const cacheKey = `aura_integrity_cache::${hostname}`;
  const existing = await new Promise(resolve =>
    chrome.storage.local.get([cacheKey], d => resolve(d[cacheKey]))
  );
  if (existing && (Date.now() - existing.auditedAt) < INTEGRITY_TTL_MS) {
    console.log('[Aura Integrity] Cache HIT for', hostname);
    chrome.storage.local.set({ [`aura_integrity_${tabId}`]: existing });
    return existing;
  }

  console.log('[Aura Integrity] Auditing', hostname);
  try {
    const res  = await fetch(`${API_BASE}/api/cert-check`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ domain: hostname }),
    });
    const data = await res.json();
    const report = { ...data, auditedAt: Date.now() };

    // Store per-tab (for popup display)
    chrome.storage.local.set({ [`aura_integrity_${tabId}`]: report });
    // Store hostname-level cache (shared across tabs on same site)
    chrome.storage.local.set({ [cacheKey]: report });

    console.log('[Aura Integrity] Result for', hostname, '→', report.connectionSecure ? 'SECURE' : 'ISSUES FOUND', `(${report.issues?.length || 0} issues)`);
    return report;
  } catch (err) {
    console.error('[Aura Integrity] Fetch failed:', err);
    chrome.storage.local.set({
      [`aura_integrity_${tabId}`]: {
        connectionSecure: false,
        protocol: 'Unknown',
        certificate: null,
        securityHeaders: { hsts: false, csp: false, xFrameOptions: false, xContentTypeOptions: false, referrerPolicy: false },
        issues: ['Integrity check failed — backend may be offline'],
        auditedAt: Date.now(),
      }
    });
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════
// ── Phase 3: Zero-Day Inference Engine (AI Brain) ──────────────────
// ═══════════════════════════════════════════════════════════════════

/**
 * runZeroDayInference — Phase 3 orchestrator.
 * Sends the Phase 1 metadata (and optionally Phase 2 context) to the Gemini AI
 * to determine if this is a highly deceptive zero-day phishing site.
 */
async function runZeroDayInference(tabId, url, integrityReport) {
  let hostname;
  try { hostname = new URL(url).hostname; } catch (_) { return; }

  console.log('[Aura AI] Triggering Zero-Day Inference for:', hostname);

  try {
    // Attempt to get page text/title from content script, with a short timeout
    let pageContext = { title: '', text: '' };
    try {
      pageContext = await new Promise((resolve, reject) => {
        const timer = setTimeout(() => resolve({ title: '', text: '' }), 1000);
        chrome.tabs.sendMessage(tabId, { action: 'getPageContext' }, (res) => {
          clearTimeout(timer);
          resolve(res || { title: '', text: '' });
        });
      });
    } catch (_) {}

    const res = await fetch(`${API_BASE}/api/judge-site`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        domain: hostname,
        integrityData: integrityReport,
        pageTitle: pageContext.title,
        pageText: pageContext.text,
      })
    });

    const data = await res.json();
    console.log('[Aura AI] Inference Result:', data);

    // Save to storage for popup
    chrome.storage.local.set({ [`aura_ai_${tabId}`]: data });

    // Threshold logic (>60 = high risk)
    if (data.score > 60 || data.riskLevel === 'high') {
      console.warn(`[Aura AI] 🚨 ZERO-DAY DETECTED: ${hostname} (Score: ${data.score}) - ${data.reason}`);
      
      // Update badge to AI threat color (purple-ish/red)
      chrome.action.setBadgeText({ text: 'AI', tabId });
      chrome.action.setBadgeBackgroundColor({ color: '#7e22ce', tabId });

      // Notify content script to show AI threat toast
      chrome.tabs.sendMessage(tabId, {
        action: 'showAIThreatAlert',
        domain: hostname,
        reason: data.reason || 'AI identified zero-day phishing patterns.',
        score: data.score
      }).catch(() => {});

      // Open an OS-level notification so it is never hidden
      chrome.notifications.create(`aura_ai_${tabId}_${Date.now()}`, {
        type: 'basic',
        iconUrl: chrome.runtime.getURL('icons/icon128.png'),
        title: 'Aura AI — Suspicious Site',
        message: `${hostname}: ${data.reason || 'Potential zero-day phishing patterns detected.'}`,
        priority: 2,
        requireInteraction: true
      });
    } else {
      console.log(`[Aura AI] Passed zero-day check (Score: ${data.score})`);
    }

  } catch (err) {
    console.error('[Aura AI] Inference failed:', err);
  }
}

// ── Trigger audits on every tab navigation ────────────────────────
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.url) {
    // Clear previous tab results immediately on navigation
    chrome.storage.local.remove([`aura_result_${tabId}`, `aura_threat_${tabId}`, `aura_ai_${tabId}`]);
    chrome.action.setBadgeText({ text: '', tabId });

    // Run Phase 1 & 2 in parallel
    const [integrityReport, threatReport] = await Promise.all([
      runIntegrityAudit(tabId, changeInfo.url),
      checkDomainThreat(tabId, changeInfo.url)
    ]);

    // If DB Shield caught it, no need for AI
    if (threatReport && threatReport.blacklisted) {
      return;
    }

    // Phase 3 trigger condition:
    // Safe in DB, but Phase 1 detected issues (missing headers, expired certs, etc.)
    if (integrityReport && integrityReport.issues && integrityReport.issues.length > 0) {
      // Small delay to ensure content script is ready to provide text context
      setTimeout(() => {
        runZeroDayInference(tabId, changeInfo.url, integrityReport);
      }, 1500);
    }
  }
});

// ═══════════════════════════════════════════════════════════════════
// ── Phase 2: Database Shield (Local Storage Threat DB) ─────────────
// ═══════════════════════════════════════════════════════════════════

/**
 * syncThreatDatabase — downloads the Steven Black hosts list from the
 * Next.js backend and stores it in chrome.storage.local.
 * Only re-downloads if the cached list is older than 24 hours.
 *
 * @param {boolean} force — if true, skip TTL check and always re-sync
 */
async function syncThreatDatabase(force = false) {
  const stored = await new Promise(resolve =>
    chrome.storage.local.get(['aura_threat_db'], d => resolve(d['aura_threat_db']))
  );

  // Skip if fresh (within 24h TTL) unless forced
  if (!force && stored && (Date.now() - stored.syncedAt) < THREAT_DB_TTL_MS) {
    console.log(`[Aura Shield] DB up to date (${stored.count} domains, synced ${Math.round((Date.now() - stored.syncedAt) / 3600000)}h ago)`);
    return;
  }

  console.log('[Aura Shield] Syncing threat database from server...');

  try {
    const res = await fetch(`${API_BASE}/api/threat-list`, {
      method:  'GET',
      headers: { 'Content-Type': 'application/json' },
    });

    if (!res.ok) throw new Error(`Server returned ${res.status}`);

    const { domains, count, source } = await res.json();

    if (!Array.isArray(domains) || domains.length === 0) {
      throw new Error('Empty or invalid domain list received');
    }

    // Persist to chrome.storage.local (survives service worker sleep)
    await new Promise(resolve =>
      chrome.storage.local.set({
        aura_threat_db: {
          domains,
          count,
          source,
          syncedAt: Date.now(),
        }
      }, resolve)
    );

    // Invalidate in-memory Set so it gets rebuilt on next lookup
    _threatSet = null;

    console.log(`[Aura Shield] Synced ${count} threat domains from ${source}`);
  } catch (err) {
    console.error('[Aura Shield] Sync failed:', err);
    // Don't wipe existing DB on failure — keep stale data
  }
}

/**
 * getThreatSet — returns the in-memory Set of threat domains.
 * Rebuilds from chrome.storage.local if the service worker woke up.
 * Returns null if the DB is not yet populated.
 */
async function getThreatSet() {
  // Fast path: Set already in memory
  if (_threatSet) return _threatSet;

  // Slow path: rebuild from storage
  const stored = await new Promise(resolve =>
    chrome.storage.local.get(['aura_threat_db'], d => resolve(d['aura_threat_db']))
  );

  if (!stored || !Array.isArray(stored.domains) || stored.domains.length === 0) {
    return null;
  }

  _threatSet = new Set(stored.domains);
  console.log(`[Aura Shield] Rebuilt in-memory Set (${_threatSet.size} domains)`);
  return _threatSet;
}

/**
 * checkDomainThreat — Phase 2 lookup.
 * Checks the current tab's domain against the local threat Set.
 * Stores result as aura_threat_{tabId}.
 * Phase 3 (AI Brain) should be called if blacklisted === false.
 *
 * @param {number} tabId
 * @param {string} pageUrl
 */
async function checkDomainThreat(tabId, pageUrl) {
  let hostname;
  try {
    const parsed = new URL(pageUrl);
    if (!parsed.protocol.startsWith('http')) return;
    hostname = parsed.hostname.toLowerCase().replace(/^www\./, '');
  } catch (_) {
    return;
  }

  const resultKey = `aura_threat_${tabId}`;

  try {
    const threatSet = await getThreatSet();

    if (!threatSet) {
      // DB not populated yet — record as unknown, trigger background sync
      chrome.storage.local.set({
        [resultKey]: {
          blacklisted: false,
          source: null,
          status: 'db_not_ready',
          domain: hostname,
          checkedAt: Date.now(),
        }
      });
      // Kick off sync so next navigation will have data
      syncThreatDatabase();
      return null;
    }

    let blacklisted = threatSet.has(hostname);

    // ─── DEMO TEST HOOK: Safely triggers full threat UI for presentation ───
    if (hostname.includes('example.com')) {
      blacklisted = true;
    }

    const report = {
      blacklisted,
      source: blacklisted ? 'StevenBlack/hosts' : null,
      status: 'checked',
      domain: hostname,
      checkedAt: Date.now(),
    };

    chrome.storage.local.set({ [resultKey]: report });

    if (blacklisted) {
      console.warn(`[Aura Shield] ⚠️ BLACKLISTED: ${hostname}`);

      // Update badge to show threat detected
      chrome.action.setBadgeText({ text: '⚠', tabId });
      chrome.action.setBadgeBackgroundColor({ color: '#3a1a1a', tabId });

      // Notify content script to show a Shadow DOM threat toast
      chrome.tabs.sendMessage(tabId, {
        action: 'showThreatAlert',
        domain: hostname,
        source: 'StevenBlack/hosts',
      }).catch(() => {}); // silently ignore if content script not present

      // Open an OS-level notification so it is never hidden
      chrome.notifications.create(`aura_threat_${tabId}_${Date.now()}`, {
        type: 'basic',
        iconUrl: chrome.runtime.getURL('icons/icon128.png'),
        title: 'Aura — Threat Detected',
        message: `${hostname} is flagged in the blacklist database. High risk of phishing.`,
        priority: 2,
        requireInteraction: true
      });
    } else {
      console.log(`[Aura Shield] ✓ Clean: ${hostname}`);
    }
    return report;
  } catch (err) {
    console.error('[Aura Shield] Lookup error:', err);
    return null;
  }
}

// ── Startup: sync threat DB and clear legacy global badge state ─────
chrome.runtime.onInstalled.addListener(() => {
  console.log('[Aura] Extension installed/updated — initial cleanup');
  chrome.action.setBadgeText({ text: '' }); // explicitly clear any global sticky state
  syncThreatDatabase();
});

chrome.runtime.onStartup.addListener(() => {
  console.log('[Aura] Browser started — cleaning global state');
  chrome.action.setBadgeText({ text: '' }); // explicitly clear any global sticky state
  syncThreatDatabase();
});

// ═══════════════════════════════════════════════════════════════════
// ── Download Audit (Ambient Security)  ────────────────────────────
// ═══════════════════════════════════════════════════════════════════

/**
 * checkSuspicious — stub for teammate's implementation.
 * Replace this function body with the actual logic provided.
 * @param {string} url      — the download URL
 * @param {string} referrer — the page that triggered the download
 * @returns {number} 0 = Safe, 1 = Suspicious
 */
function checkSuspicious(url, referrer) {
  // ── Teammate inserts real logic here ──────────────────────────
  
  // 1. Force trigger for our test file
  if (url.includes('dummy.pdf')) {
    return 1;
  }

  // 2. Placeholder heuristic: flag if the download URL's domain
  // doesn't share a root with the referrer domain.
  try {
    const dlHost  = new URL(url).hostname.replace(/^www\./, '');
    const refHost = referrer ? new URL(referrer).hostname.replace(/^www\./, '') : '';
    const dlRoot  = dlHost.split('.').slice(-2).join('.');
    const refRoot = refHost.split('.').slice(-2).join('.');
    return (refRoot && dlRoot !== refRoot) ? 1 : 0;
  } catch (_) {
    return 0; // default safe on parse errors
  }
}

/**
 * Non-blocking download audit listener.
 * The download is NEVER paused or cancelled — only audited.
 */
chrome.downloads.onCreated.addListener((downloadItem) => {
  const { id, url, referrer, mime } = downloadItem;

  console.log(`[Aura Download Audit] id=${id} mime=${mime} url=${url}`);

  // Run audit asynchronously — never blocks the download
  Promise.resolve().then(() => {
    const isSuspicious = checkSuspicious(url, referrer || '');

    if (isSuspicious === 0) {
      // Safe — maintain calm/ambient flow, do nothing
      console.log('[Aura Download Audit] Safe:', url);
      return;
    }

    // ── Suspicious ────────────────────────────────────────────────
    console.warn('[Aura Download Audit] Suspicious download detected:', url);

    // 1. Persist the flagged file ID in chrome.storage
    chrome.storage.local.set({
      [`aura_download_${id}`]: {
        id,
        url,
        referrer: referrer || '',
        mime: mime || '',
        flaggedAt: Date.now(),
        isSuspicious: true,
      }
    });

    // 3. Find the active tab and notify it
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0];
      if (!tab) return;

      // Update the badge ONLY for the current active tab instead of globally
      chrome.action.setBadgeText({ text: '✕', tabId: tab.id });
      chrome.action.setBadgeBackgroundColor({ color: '#E07A5F', tabId: tab.id }); // Danger (Warm)

      // Send to content.js to inject the Shadow DOM toast
      chrome.tabs.sendMessage(tab.id, {
        action: 'showDownloadAlert',
        downloadId: id,
        url,
        referrer: referrer || '',
      }).catch(() => {}); // silently ignore if content script not present

      // Also notify popup if it's open
      chrome.runtime.sendMessage({
        action: 'downloadRiskUpdate',
        downloadId: id,
        url,
        referrer: referrer || '',
        mime: mime || '',
      }).catch(() => {}); // popup may not be open — that's fine

      // Open an OS-level notification instead of a window, so it doesn't get hidden by the "Save As" dialog
      chrome.notifications.create(`aura_dl_${id}`, {
        type: 'basic',
        iconUrl: chrome.runtime.getURL('icons/icon128.png'),
        title: 'Aura — Suspicious Download',
        message: 'This download\'s source metadata is inconsistent with your browsing flow. Proceed with caution.',
        priority: 2,
        requireInteraction: true // Keeps the notification open until the user dismisses it
      });
    });
  });
});

