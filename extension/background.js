// background.js

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

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
    const badgeColors = { low: '#525252', med: '#404040', high: '#2a2a2a' };
    const badgeTexts  = { low: 'OK',      med: '!',       high: '!!' };
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
      fetch('http://localhost:5000/api/summarize', {
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
    fetch('http://localhost:5000/api/trust-shield', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ texts: request.texts })
    })
      .then(res => res.json())
      .then(data => sendResponse({ success: true, data }))
      .catch(err => sendResponse({ success: false, error: err.toString() }));

    return true;
  }
});

// ── Clear per-tab result (not URL cache) on navigation ────────────
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.url) {
    chrome.storage.local.remove([`aura_result_${tabId}`]);
    chrome.action.setBadgeText({ text: '', tabId });
  }
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
  // Placeholder heuristic: flag if the download URL's domain
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

    // 2. Update the extension badge — soft yellow, calm indicator
    chrome.action.setBadgeText({ text: '!' });
    chrome.action.setBadgeBackgroundColor({ color: '#92400E' }); // dark amber, monochromatic

    // 3. Find the active tab and notify the content script to show toast
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0];
      if (!tab) return;

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
    });
  });
});

