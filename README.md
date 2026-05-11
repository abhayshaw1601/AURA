<div align="center">

# ◈ Aura
### Ambient Security & Privacy Layer

*A calm, non-intrusive browser extension that quietly protects you — without the noise.*

[![Chrome Extension](https://img.shields.io/badge/Chrome-Manifest%20V3-black?style=flat-square&logo=googlechrome&logoColor=white)](https://developer.chrome.com/docs/extensions/mv3/)
[![Next.js](https://img.shields.io/badge/Next.js-16-black?style=flat-square&logo=nextdotjs&logoColor=white)](https://nextjs.org/)
[![Gemini](https://img.shields.io/badge/Gemini-2.5%20Flash%20Lite-black?style=flat-square&logo=google&logoColor=white)](https://ai.google.dev/)
[![InnovateX](https://img.shields.io/badge/InnovateX%201.0-Cybersecurity%20%26%20Privacy-black?style=flat-square)](.)

</div>

---

## Overview

Aura is an ambient security layer built as a Chrome Extension. It silently monitors your browsing environment and provides subtle, non-intrusive visual cues to educate and protect users — without interrupting their flow.

| Feature | Description |
|---|---|
| **Privacy Sense** | Detects privacy/terms pages and generates a 3-bullet plain-English summary |
| **Trust Shield** | Scans social media feeds for Urgency Bias, Tone Mismatch & Metadata inconsistencies |
| **Ambient UI** | Pulsing icon + glassmorphic hover panel injected via Shadow DOM |
| **Smart Cache** | 24-hour URL-based cache to avoid redundant API calls |
| **Popup Panel** | MetaMask-style extension popup with skeleton loading & live updates |

---

## Architecture Diagram

```mermaid
graph TB
    subgraph Browser["🌐 Browser (Client)"]
        direction TB
        CS["Content Script<br/><i>content.js</i><br/>DOM Parser · UI Injector"]
        BG["Service Worker<br/><i>background.js</i><br/>API Orchestrator · Cache Manager"]
        PU["Extension Popup<br/><i>popup.html / popup.js</i><br/>MetaMask-style Panel"]
        ST[("chrome.storage.local<br/><i>Result Cache · URL Cache</i>")]
        SD["Shadow DOM<br/><i>Pulse Icon · Glassmorphic Panel</i>"]
    end

    subgraph Server["⚡ Server (Next.js on localhost:3000)"]
        direction TB
        SR["/api/summarize<br/><i>Privacy Policy Analysis</i>"]
        TS["/api/trust-shield<br/><i>Misinformation Detection</i>"]
    end

    subgraph AI["🤖 Google AI"]
        GM["Gemini 2.5 Flash Lite<br/><i>NLU · JSON Output</i>"]
    end

    CS -->|"① Page text + URL"| BG
    BG -->|"② Check cache"| ST
    ST -->|"③a Cache HIT → return instantly"| BG
    BG -->|"③b Cache MISS → POST /summarize"| SR
    BG -->|"Social media text → POST /trust-shield"| TS
    SR -->|"Prompt + text"| GM
    TS -->|"Prompt + text"| GM
    GM -->|"JSON {riskLevel, summary}"| SR
    GM -->|"JSON {flagged, reason}"| TS
    SR -->|"Result"| BG
    TS -->|"Result"| BG
    BG -->|"④ Store result"| ST
    BG -->|"⑤ Update badge dot"| PU
    BG -->|"⑥ Update ambient icon"| CS
    CS -->|"Render"| SD
    ST -->|"onChanged / polling"| PU

    style Browser fill:#0a0a0a,stroke:#1f1f1f,color:#e5e5e5
    style Server fill:#0d0d0d,stroke:#1f1f1f,color:#e5e5e5
    style AI fill:#0d0d0d,stroke:#1f1f1f,color:#e5e5e5
```

---

## Flow Diagram — Privacy Sense

```mermaid
sequenceDiagram
    participant U as User
    participant C as content.js
    participant B as background.js
    participant S as chrome.storage
    participant A as /api/summarize
    participant G as Gemini 2.5 Flash Lite

    U->>C: Navigates to /privacy or /terms page
    C->>C: isPrivacyPolicyPage() → true
    C->>C: Inject Shadow DOM Pulse Icon
    C->>B: sendMessage(summarizePrivacyPolicy, text, pageUrl)
    B->>S: readCache(pageUrl)

    alt Cache HIT (within 24h)
        S-->>B: Cached result
        B->>S: applyResult(tabId, cached)
        B-->>C: { success: true, fromCache: true }
        Note over C: Instant response — no API call!
    else Cache MISS
        B->>A: POST { text }
        A->>G: Prompt: Analyze + return JSON
        G-->>A: { riskLevel, summary[] }
        A-->>B: JSON result
        B->>S: writeCache(pageUrl, data)
        B->>S: store aura_result_{tabId}
        B-->>C: { success: true, data }
    end

    C->>C: Update icon color (low/med/high)
    C->>C: Render bullet points in hover panel
    U->>U: Clicks extension icon
    U-->>S: popup.js reads aura_result_{tabId}
    S-->>U: Renders monochromatic popup with Lucide icons
```

---

## Flow Diagram — Trust Shield

```mermaid
sequenceDiagram
    participant U as User
    participant C as content.js (MutationObserver)
    participant B as background.js
    participant A as /api/trust-shield
    participant G as Gemini 2.5 Flash Lite

    U->>C: Scrolls social media feed (X / LinkedIn)
    C->>C: MutationObserver detects new article elements
    C->>C: Filter: not yet scanned & text.length > 40
    C->>C: setAttribute(data-aura-scanned, true)
    C->>B: sendMessage(checkMisinformation, [post text])
    B->>A: POST { texts: [post text] }
    A->>G: Prompt: Check Urgency Bias, Tone Mismatch, Metadata Mismatch
    G-->>A: { flagged: true/false, reason, riskLevel }
    A-->>B: JSON result
    B-->>C: { success: true, data }

    alt flagged === true
        C->>C: Apply rgba(254,243,199,0.4) background highlight
        C->>C: Set title tooltip with reason
    else flagged === false
        C->>C: No visual change
    end
```

---

## Project Structure

```
AURA/
├── extension/                  # Chrome Extension (Manifest V3)
│   ├── manifest.json           # Extension config, permissions, popup
│   ├── background.js           # Service Worker: cache + API orchestration
│   ├── content.js              # DOM parser, Shadow DOM injector, Trust Shield observer
│   ├── popup.html              # MetaMask-style popup UI
│   ├── popup.js                # Popup logic with live storage listener + polling
│   ├── styles.css              # Global highlight class for Trust Shield
│   └── icons/                  # Extension icons (16, 48, 128px)
│
└── api/                        # Next.js Backend (App Router)
    ├── src/app/api/
    │   ├── summarize/route.ts  # Privacy policy analysis endpoint
    │   └── trust-shield/route.ts # Misinformation detection endpoint
    ├── next.config.ts          # CORS headers for extension access
    └── .env                    # GEMINI_API_KEY (never committed)
```

---

## Setup

### Prerequisites
- Node.js 18+
- Google Chrome
- Gemini API Key from [Google AI Studio](https://aistudio.google.com/)

### 1. Start the Backend

```bash
cd api
# Add your key to .env
echo "GEMINI_API_KEY=your_key_here" > .env
npm install
npm run dev
# Backend running at http://localhost:3000
```

### 2. Load the Extension

1. Open `chrome://extensions` in Chrome
2. Enable **Developer Mode** (top right toggle)
3. Click **Load unpacked**
4. Select the `/extension` folder

### 3. Test it

- Navigate to `https://policies.google.com/privacy` → Pulse icon appears, click the extension icon for the full summary
- Navigate to `https://x.com` or `https://linkedin.com` → suspicious posts get a subtle yellow highlight

---

## Tech Stack

| Layer | Technology |
|---|---|
| Browser Extension | Chrome Manifest V3, Vanilla JS, Shadow DOM |
| Backend | Next.js 16 App Router, TypeScript |
| AI | Google Gemini 2.5 Flash Lite |
| Cache | `chrome.storage.local` (URL-keyed, 24h TTL) |
| UI | Monochromatic design, Lucide SVG icons, CSS shimmer skeleton |

---

<div align="center">
<sub>Built for InnovateX 1.0 — Problem Statement #14: Cybersecurity & Privacy</sub>
</div>
