# Aura: Ambient Security & Privacy Layer

*A subtle, non-intrusive browser extension designed to protect users without interrupting their workflow.*

[Chrome Manifest V3] | [Next.js 16] | [Gemini 2.5 Flash Lite]

---

## Overview

Aura operates as an ambient security layer within your browser. It monitors your browsing environment in real-time and provides subtle visual cues to educate and protect against emerging threats, privacy risks, and misinformation.

### Core Features

* **Zero-Day Inference Engine**: Evaluates website metadata, TLS certificate integrity, and content context using Google Gemini to detect novel phishing or malicious sites before they appear on standard blacklists.
* **Threat Intelligence Sync**: Automatically cross-references visited domains against established threat databases to block known malicious sources.
* **Certificate & Security Audit**: Inspects TLS certificates for expiry, SNI mismatches, and audits HTTP security headers (HSTS, CSP, X-Frame-Options) to ensure connection integrity.
* **Privacy Sense**: Detects privacy policies and terms of service pages, generating a concise, plain-English summary of critical data retention and selling practices.
* **Trust Shield**: Scans social media feeds to detect urgency bias, tone mismatches, and metadata inconsistencies that indicate potential misinformation.
* **Download Audit**: Monitors active downloads and cross-references their origin domains against the user's current browsing flow. Emits subtle ambient toasts if a cross-domain or injected download is detected.
* **Ambient UI**: Utilizes the Shadow DOM to inject subtle visual indicators (such as pulsing icons, glassmorphic panels, and non-intrusive toasts) that alert users without disrupting their flow.

---

## Architecture Diagram

<details open>
<summary>View system diagram</summary>

```mermaid
graph TB
    subgraph Client [Browser Extension]
        direction TB
        CS[Content Script: DOM Parser & UI Injector]
        BG[Service Worker: API Orchestrator & Downloads]
        PU[Extension Popup: Dashboard Panel]
        ST[(Local Storage: Cache)]
        SD[Shadow DOM: Ambient Alerts & Toasts]
    end

    subgraph Server [Next.js Backend]
        direction TB
        SR["/api/summarize: Privacy Policy Analysis"]
        TS["/api/trust-shield: Misinformation Detection"]
        TL["/api/threat-list: Domain Blocklist"]
        CC["/api/cert-check: TLS/Header Audit"]
        JS["/api/judge-site: Zero-Day Inference"]
    end

    subgraph AI [Inference]
        GM[Gemini 2.5 Flash Lite]
    end

    CS -->|Page Data| BG
    BG -->|Sync| TL
    BG -->|Audit| CC
    BG -->|Analyze| JS
    BG -->|Intercept Download| BG
    JS -->|Prompt| GM
    SR -->|Prompt| GM
    TS -->|Prompt| GM
    GM -->|JSON Output| Server
    Server -->|Result| BG
    BG -->|Store| ST
    BG -->|Update Badge| PU
    BG -->|Trigger Alert| CS
    CS -->|Render Toast/UI| SD
```

</details>

---

## System Workflows

### 1. Active Threat Detection

```mermaid
sequenceDiagram
    participant User
    participant Ext as Extension
    participant API as Backend Services
    participant AI as Gemini 2.5

    User->>Ext: Navigates to a new domain
    Ext->>Ext: Check against local Threat List cache
    alt Domain Blacklisted
        Ext->>User: Display immediate danger indicator
    else Domain Unknown
        Ext->>API: /api/cert-check (Fetch TLS & Headers)
        API-->>Ext: Return Certificate & Header Data
        Ext->>API: /api/judge-site (Send cert data, page text, domain)
        API->>AI: Evaluate for zero-day phishing
        AI-->>API: Inference score and risk level
        API-->>Ext: Return judgment
        Ext->>User: Update UI badge and status panel
    end
```

### 2. Privacy Sense

```mermaid
sequenceDiagram
    participant User
    participant Ext as Extension
    participant API as Backend Services

    User->>Ext: Navigates to privacy policy page
    Ext->>Ext: Inject Ambient UI
    Ext->>API: POST /api/summarize
    API-->>Ext: Return JSON summary
    Ext->>User: Update glassmorphic hover panel
```

### 3. Non-Blocking Download Audit

```mermaid
sequenceDiagram
    participant User
    participant Ext as Background Worker
    participant Content as Content Script
    
    User->>Ext: Triggers a file download
    Ext->>Ext: Intercept chrome.downloads.onCreated
    Ext->>Ext: Compare download source vs current tab domain
    alt Domain Mismatch Detected
        Ext->>Content: Send 'showDownloadAlert' message
        Content->>User: Inject non-intrusive Shadow DOM Toast
    else Domain Matches
        Ext->>Ext: Allow silently
    end
```

---

## Project Structure

```
AURA/
├── extension/                  
│   ├── manifest.json           
│   ├── background.js           
│   ├── content.js              
│   ├── popup.html              
│   ├── popup.js                
│   ├── styles.css              
│   └── icons/                  
│
└── api/                        
    ├── src/app/api/
    │   ├── summarize/route.ts  
    │   ├── trust-shield/route.ts 
    │   ├── threat-list/route.ts
    │   ├── cert-check/route.ts
    │   └── judge-site/route.ts
    ├── next.config.ts          
    └── .env                    
```

---

## Setup Instructions

### Prerequisites
* Node.js 18 or higher
* Google Chrome
* Gemini API Key

### 1. Start the Backend Service

```bash
cd api
echo "GEMINI_API_KEY=your_api_key_here" > .env
npm install
npm run dev
```
*The backend will initialize at http://localhost:3000.*

### 2. Load the Extension

1. Open `chrome://extensions` in Google Chrome.
2. Enable **Developer mode** in the top right corner.
3. Click **Load unpacked**.
4. Select the `extension` directory from this repository.

### 3. Verification

* **Threat Detection**: Navigate to an unknown site. The extension popup will display the current TLS status and the AI's zero-day inference result.
* **Privacy Sense**: Navigate to any major privacy policy page (e.g., Google or Meta). A subtle icon will appear in the bottom right; hover over it to view the generated summary.

---

Built for InnovateX 1.0 (Cybersecurity & Privacy).
