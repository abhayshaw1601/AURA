// content.js

function isPrivacyPolicyPage() {
  const url = window.location.href.toLowerCase();
  return url.includes('privacy') || url.includes('terms');
}

function getPageText() {
  return document.body.innerText;
}

function injectAmbientUI() {
  // Create host element
  const host = document.createElement('div');
  host.id = 'aura-ambient-ui-host';
  // Use Shadow DOM
  const shadowRoot = host.attachShadow({ mode: 'open' });

  // Add styles
  const style = document.createElement('style');
  style.textContent = `
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap');
    
    .aura-container {
      position: fixed;
      bottom: 24px;
      right: 24px;
      z-index: 2147483647;
      font-family: 'Inter', sans-serif;
    }

    .aura-pulse-icon {
      width: 56px;
      height: 56px;
      border-radius: 50%;
      background-color: #D1FAE5; /* Soft Green */
      color: #065F46; /* Dark Green Text/Icon */
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      animation: aura-pulse-anim-low 2s infinite;
    }
    
    .aura-pulse-icon:hover {
      transform: translateY(-4px) scale(1.05);
      box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.2);
    }
    
    .aura-pulse-icon.low { 
      background-color: rgba(129, 178, 154, 0.2); color: #81B29A;
      animation: aura-pulse-anim-low 2s infinite;
    }
    .aura-pulse-icon.med { 
      background-color: rgba(224, 122, 95, 0.2); color: #E07A5F;
      animation: aura-pulse-anim-med 2s infinite;
    }
    .aura-pulse-icon.high { 
      background-color: rgba(171, 92, 72, 0.2); color: #AB5C48;
      animation: aura-pulse-anim-high 2s infinite;
    }

    @keyframes aura-pulse-anim-low {
      0% { box-shadow: 0 0 0 0 rgba(129, 178, 154, 0.6); }
      70% { box-shadow: 0 0 0 15px rgba(129, 178, 154, 0); }
      100% { box-shadow: 0 0 0 0 rgba(129, 178, 154, 0); }
    }
    @keyframes aura-pulse-anim-med {
      0% { box-shadow: 0 0 0 0 rgba(224, 122, 95, 0.6); }
      70% { box-shadow: 0 0 0 15px rgba(224, 122, 95, 0); }
      100% { box-shadow: 0 0 0 0 rgba(224, 122, 95, 0); }
    }
    @keyframes aura-pulse-anim-high {
      0% { box-shadow: 0 0 0 0 rgba(171, 92, 72, 0.6); }
      70% { box-shadow: 0 0 0 15px rgba(171, 92, 72, 0); }
      100% { box-shadow: 0 0 0 0 rgba(171, 92, 72, 0); }
    }

    .aura-summary-panel {
      position: absolute;
      bottom: 72px;
      right: 0;
      width: 320px;
      background: #F4F1DE;
      border-radius: 16px;
      box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
      padding: 20px;
      opacity: 0;
      transform: translateY(10px) scale(0.95);
      pointer-events: none;
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      border: 1px solid rgba(61, 64, 91, 0.15);
      transform-origin: bottom right;
    }
    .aura-container:hover .aura-summary-panel {
      opacity: 1;
      transform: translateY(0) scale(1);
      pointer-events: auto;
    }
    .aura-title {
      font-weight: 600;
      margin-bottom: 12px;
      font-size: 15px;
      color: #3D405B;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .aura-list {
      margin: 0;
      padding-left: 20px;
      font-size: 13.5px;
      line-height: 1.5;
      color: rgba(61, 64, 91, 0.8);
    }
    .aura-list li {
      margin-bottom: 8px;
    }
  `;

  // Create UI
  const container = document.createElement('div');
  container.className = 'aura-container';

  const icon = document.createElement('div');
  icon.className = 'aura-pulse-icon';
  icon.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>';

  const panel = document.createElement('div');
  panel.className = 'aura-summary-panel';
  panel.innerHTML = '<div class="aura-title">Analyzing Privacy Policy...</div>';

  container.appendChild(icon);
  container.appendChild(panel);
  shadowRoot.appendChild(style);
  shadowRoot.appendChild(container);
  
  // Append to documentElement (HTML) instead of body to avoid SPA overwrites
  (document.body || document.documentElement).appendChild(host);

  return { icon, panel };
}

// Phase 1 & 2 logic
if (isPrivacyPolicyPage()) {
  console.log('[Aura] Privacy page detected! Injecting Ambient UI...');
  const { icon, panel } = injectAmbientUI();
  
  // Extract text and send for summary — also pass URL as cache key
  const text = getPageText().substring(0, 5000);
  const pageUrl = window.location.href;
  console.log('[Aura] Sending text to backend...');

  chrome.runtime.sendMessage({ action: 'summarizePrivacyPolicy', text, pageUrl }, response => {
    console.log('[Aura] Received response from backend:', response);
    if (response && response.success && response.data) {
      const result = response.data;
      icon.className = `aura-pulse-icon ${result.riskLevel || 'low'}`;
      
      const listItems = (result.summary || []).map(item => `<li>${item}</li>`).join('');
      panel.innerHTML = `
        <div class="aura-title">Privacy Summary</div>
        <ul class="aura-list">${listItems}</ul>
      `;
    } else {
      console.error('[Aura] API failed:', response);
      panel.innerHTML = '<div class="aura-title" style="color: #EF4444;">Failed to analyze.</div>';
    }
  });
} else {
  console.log('[Aura] Not a privacy policy page. Skipping injection.');
}

// Phase 3: Trust Shield Logic (Social Media)
function detectMisinformation() {
  const isSocialMedia = window.location.hostname.includes('twitter.com') || 
                        window.location.hostname.includes('x.com') ||
                        window.location.hostname.includes('linkedin.com');
                        
  if (!isSocialMedia) return;

  // Basic DOM observer for dynamic content (simplified for prototype)
  const observer = new MutationObserver(mutations => {
    // Find text elements that might contain posts
    const posts = document.querySelectorAll('article:not([data-aura-scanned]), .feed-shared-update-v2:not([data-aura-scanned])');
    
    posts.forEach(post => {
      if (!post || !post.setAttribute) return; // null guard
      // Mark as scanned to prevent infinite loops
      post.setAttribute('data-aura-scanned', 'true');
      const text = post.innerText;
      
      // Only process posts with sufficient text
      if (text && text.length > 40) {
        chrome.runtime.sendMessage({ action: 'checkMisinformation', texts: [text] }, response => {
          if (!post || !post.style) return; // null guard after async
          if (response && response.success && response.data) {
            if (response.data.flagged) {
              // Apply UI Constraint: Subtle yellow highlight
              if (post.classList) post.classList.add('aura-highlight-misinfo');
              post.style.backgroundColor = 'rgba(254, 243, 199, 0.4)';
              post.style.transition = 'background-color 0.3s ease';
              post.title = 'Aura Trust Shield: ' + (response.data.reason || 'Potential misinformation detected.');
            }
          }
        });
      }
    });
  });
  
  observer.observe(document.body, { childList: true, subtree: true });
}

detectMisinformation();

// ═══════════════════════════════════════════════════════════════════
// ── Download Audit Toast (Phase: Ambient Alert) ────────────────────
// ═══════════════════════════════════════════════════════════════════

/**
 * Injects a calm, non-intrusive Shadow DOM toast into the page.
 * Constraint: Must be subtle and "ambient" — not alarming.
 */
function showDownloadToast() {
  // Avoid duplicate toasts
  if (document.getElementById('aura-download-toast-host')) return;

  const host = document.createElement('div');
  host.id = 'aura-download-toast-host';
  const shadow = host.attachShadow({ mode: 'open' });

  const style = document.createElement('style');
  style.textContent = `
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600&display=swap');

    .toast {
      position: fixed;
      bottom: 90px;
      right: 24px;
      z-index: 2147483647;
      width: 320px;
      background: #F4F1DE;
      border: 1px solid rgba(171, 92, 72, 0.3);
      border-left: 4px solid #E07A5F;
      border-radius: 10px;
      padding: 14px 16px;
      display: flex;
      align-items: flex-start;
      gap: 12px;
      font-family: 'Inter', sans-serif;
      box-shadow: 0 10px 25px rgba(0,0,0,0.15);
      animation: toast-in 0.35s cubic-bezier(0.4, 0, 0.2, 1) forwards;
    }
    @keyframes toast-in {
      from { opacity: 0; transform: translateY(12px) scale(0.97); }
      to   { opacity: 1; transform: translateY(0)   scale(1);    }
    }
    .toast-icon {
      width: 18px; height: 18px; flex-shrink: 0; margin-top: 1px;
      color: #E07A5F;
    }
    .toast-title {
      font-size: 12px; font-weight: 600;
      color: #3D405B; margin-bottom: 4px;
    }
    .toast-body {
      font-size: 11.5px; line-height: 1.55;
      color: #AB5C48;
    }
    .toast-close {
      position: absolute; top: 10px; right: 12px;
      background: none; border: none; cursor: pointer;
      color: rgba(171, 92, 72, 0.5); font-size: 14px; line-height: 1;
      padding: 0;
    }
    .toast-close:hover { color: #AB5C48; }
  `;

  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.setAttribute('role', 'alert');
  toast.innerHTML = `
    <svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
    </svg>
    <div>
      <div class="toast-title">Aura — Download Notice</div>
      <div class="toast-body">
        This download's source metadata is inconsistent with your browsing flow. Proceed with caution.
      </div>
    </div>
    <button class="toast-close" id="toast-dismiss" aria-label="Dismiss">✕</button>
  `;

  shadow.appendChild(style);
  shadow.appendChild(toast);
  (document.body || document.documentElement).appendChild(host);

  // Auto-dismiss after 8 seconds
  const dismiss = () => host.remove();
  shadow.getElementById('toast-dismiss').addEventListener('click', dismiss);
  setTimeout(dismiss, 8000);
}

// ── Message listener — receives showDownloadAlert from background.js ──
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'showDownloadAlert') {
    showDownloadToast();
  } else if (message.action === 'showThreatAlert') {
    showThreatToast(message.domain, message.source);
  } else if (message.action === 'showAIThreatAlert') {
    showAIToast(message.domain, message.reason, message.score);
  } else if (message.action === 'getPageContext') {
    // Used by Phase 3 Zero-Day Inference
    const text = document.body.innerText.substring(0, 15000);
    sendResponse({ title: document.title, text });
  }
});

// ═══════════════════════════════════════════════════════════════════
// ── Threat Audit Toast (Phase 2: Database Shield) ──────────────────
// ═══════════════════════════════════════════════════════════════════

function showThreatToast(domain, source) {
  if (document.getElementById('aura-threat-toast-host')) return;

  const host = document.createElement('div');
  host.id = 'aura-threat-toast-host';
  const shadow = host.attachShadow({ mode: 'open' });

  const style = document.createElement('style');
  style.textContent = `
    .toast {
      position: fixed;
      top: 24px;
      right: 24px;
      z-index: 2147483647;
      width: 320px;
      background: rgba(15, 15, 15, 0.92);
      border: 1px solid #2a2a2a;
      border-left: 3px solid #b06060;
      border-radius: 10px;
      padding: 14px 16px;
      display: flex;
      align-items: flex-start;
      gap: 12px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
      box-shadow: 0 8px 24px rgba(0,0,0,0.5);
      animation: toast-in 0.35s cubic-bezier(0.4, 0, 0.2, 1) forwards;
    }
    @keyframes toast-in {
      from { opacity: 0; transform: translateY(-12px) scale(0.97); }
      to   { opacity: 1; transform: translateY(0)   scale(1);    }
    }
    .toast-icon {
      width: 18px; height: 18px; flex-shrink: 0; margin-top: 1px;
      color: #b06060;
    }
    .toast-title {
      font-size: 12px; font-weight: 600;
      color: #e5e5e5; margin-bottom: 4px;
    }
    .toast-body {
      font-size: 11.5px; line-height: 1.55;
      color: #737373;
    }
    .toast-close {
      position: absolute; top: 10px; right: 12px;
      background: none; border: none; cursor: pointer;
      color: #525252; font-size: 14px; line-height: 1;
      padding: 0;
    }
    .toast-close:hover { color: #a3a3a3; }
  `;

  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.setAttribute('role', 'alert');
  toast.innerHTML = `
    <svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
    </svg>
    <div>
      <div class="toast-title">Aura — Threat Detected</div>
      <div class="toast-body">
        <strong>${domain}</strong> is flagged in the offline database (${source}). High risk of phishing.
      </div>
    </div>
    <button class="toast-close" id="toast-dismiss" aria-label="Dismiss">✕</button>
  `;

  shadow.appendChild(style);
  shadow.appendChild(toast);
  (document.body || document.documentElement).appendChild(host);

  const dismiss = () => host.remove();
  shadow.getElementById('toast-dismiss').addEventListener('click', dismiss);
  setTimeout(dismiss, 10000); // 10s for critical threat
}

// ═══════════════════════════════════════════════════════════════════
// ── AI Zero-Day Toast (Phase 3: AI Inference Engine) ───────────────
// ═══════════════════════════════════════════════════════════════════

function showAIToast(domain, reason, score) {
  if (document.getElementById('aura-ai-toast-host')) return;

  const host = document.createElement('div');
  host.id = 'aura-ai-toast-host';
  const shadow = host.attachShadow({ mode: 'open' });

  const style = document.createElement('style');
  style.textContent = `
    .toast {
      position: fixed;
      top: 24px;
      right: 24px;
      z-index: 2147483647;
      width: 320px;
      background: rgba(15, 15, 15, 0.92);
      border: 1px solid #2a2a2a;
      border-left: 3px solid #7e22ce;
      border-radius: 10px;
      padding: 14px 16px;
      display: flex;
      align-items: flex-start;
      gap: 12px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
      box-shadow: 0 8px 24px rgba(0,0,0,0.5);
      animation: toast-in 0.35s cubic-bezier(0.4, 0, 0.2, 1) forwards;
    }
    @keyframes toast-in {
      from { opacity: 0; transform: translateY(-12px) scale(0.97); }
      to   { opacity: 1; transform: translateY(0)   scale(1);    }
    }
    .toast-icon {
      width: 18px; height: 18px; flex-shrink: 0; margin-top: 1px;
      color: #a855f7;
    }
    .toast-title {
      font-size: 12px; font-weight: 600;
      color: #e5e5e5; margin-bottom: 4px;
    }
    .toast-body {
      font-size: 11.5px; line-height: 1.55;
      color: #d8b4fe;
    }
    .toast-close {
      position: absolute; top: 10px; right: 12px;
      background: none; border: none; cursor: pointer;
      color: #525252; font-size: 14px; line-height: 1;
      padding: 0;
    }
    .toast-close:hover { color: #a3a3a3; }
  `;

  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.setAttribute('role', 'alert');
  toast.innerHTML = `
    <svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
    </svg>
    <div>
      <div class="toast-title">Aura AI — Suspicious Site (Score: ${score})</div>
      <div class="toast-body">
        <strong>${domain}</strong>: ${reason}
      </div>
    </div>
    <button class="toast-close" id="toast-dismiss" aria-label="Dismiss">✕</button>
  `;

  shadow.appendChild(style);
  shadow.appendChild(toast);
  (document.body || document.documentElement).appendChild(host);

  const dismiss = () => host.remove();
  shadow.getElementById('toast-dismiss').addEventListener('click', dismiss);
  setTimeout(dismiss, 12000);
}
