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
      background-color: #D1FAE5; color: #065F46;
      animation: aura-pulse-anim-low 2s infinite;
    }
    .aura-pulse-icon.med { 
      background-color: #FEF3C7; color: #92400E;
      animation: aura-pulse-anim-med 2s infinite;
    }
    .aura-pulse-icon.high { 
      background-color: #FEE2E2; color: #991B1B;
      animation: aura-pulse-anim-high 2s infinite;
    }

    @keyframes aura-pulse-anim-low {
      0% { box-shadow: 0 0 0 0 rgba(209, 250, 229, 0.7); }
      70% { box-shadow: 0 0 0 15px rgba(209, 250, 229, 0); }
      100% { box-shadow: 0 0 0 0 rgba(209, 250, 229, 0); }
    }
    @keyframes aura-pulse-anim-med {
      0% { box-shadow: 0 0 0 0 rgba(254, 243, 199, 0.7); }
      70% { box-shadow: 0 0 0 15px rgba(254, 243, 199, 0); }
      100% { box-shadow: 0 0 0 0 rgba(254, 243, 199, 0); }
    }
    @keyframes aura-pulse-anim-high {
      0% { box-shadow: 0 0 0 0 rgba(254, 226, 226, 0.7); }
      70% { box-shadow: 0 0 0 15px rgba(254, 226, 226, 0); }
      100% { box-shadow: 0 0 0 0 rgba(254, 226, 226, 0); }
    }

    .aura-summary-panel {
      position: absolute;
      bottom: 72px;
      right: 0;
      width: 320px;
      background: rgba(255, 255, 255, 0.85);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      border-radius: 16px;
      box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
      padding: 20px;
      opacity: 0;
      transform: translateY(10px) scale(0.95);
      pointer-events: none;
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      border: 1px solid rgba(255, 255, 255, 0.4);
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
      color: #111827;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .aura-list {
      margin: 0;
      padding-left: 20px;
      font-size: 13.5px;
      line-height: 1.5;
      color: #374151;
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
      background: #f5f5dc;
      border: 1px solid #e5e7eb;
      border-left: 4px solid #ef4444; /* Standard Red */
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
      color: #ef4444;
    }
    .toast-title {
      font-size: 12px; font-weight: 600;
      color: #111827; margin-bottom: 4px;
    }
    .toast-body {
      font-size: 11.5px; line-height: 1.55;
      color: #4b5563;
    }
    .toast-close {
      position: absolute; top: 10px; right: 12px;
      background: none; border: none; cursor: pointer;
      color: #9ca3af; font-size: 14px; line-height: 1;
      padding: 0;
    }
    .toast-close:hover { color: #4b5563; }
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
chrome.runtime.onMessage.addListener((message) => {
  if (message.action === 'showDownloadAlert') {
    showDownloadToast();
  }
});
