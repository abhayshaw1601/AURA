# Project Aura: Ambient Security & Privacy IDE Prompt

## 1. Context & Objective
[cite_start]**Problem Statement:** 14. Cybersecurity & Privacy (INNOVATEX 1.0) [cite: 181]
[cite_start]**Goal:** Build a "calm, ambient security layer" that helps non-technical users understand privacy policies and detects misinformation/deepfakes without interrupting browsing flow[cite: 182, 184].

## 2. Technical Stack Constraints
- [cite_start]**Extension:** Chrome Manifest V3 [cite: 72]
- [cite_start]**Backend:** Next.js (Node.js/Express compatible) [cite: 72]
- [cite_start]**AI:** Gemini 1.5 Flash API (for low latency) [cite: 101]
- **Styling:** Tailwind CSS (within Shadow DOM)

## 3. Modular Architecture (Phase-Wise)

### Phase 1: Privacy Summarizer (Core Logic)
- **Task:** When the URL contains 'privacy' or 'terms', scrape the page text.
- **AI Prompt Constraint:** "Summarize this privacy policy into 3 plain-English bullet points focusing on: 1. Data Selling, 2. Retention, 3. User Rights. Return JSON: {riskLevel: 'low'|'med'|'high', summary: []}."
- [cite_start]**Privacy Rule:** Ensure the tool identifies dense legalese and translates it to simple pros/cons[cite: 139].

### Phase 2: Ambient UI Layer (The "Calm" UX)
- [cite_start]**Task:** Inject a non-intrusive UI element into the webpage[cite: 184].
- **UI Constraint:** - Use a **Shadow DOM** to prevent website CSS conflicts.
  - Create a "Pulse" icon in the bottom-right corner.
  - Colors: Soft Green (#D1FAE5), Soft Amber (#FEF3C7), Soft Red (#FEE2E2).
  - No pop-ups. [cite_start]Only show the summary when the user clicks/hovers on the icon[cite: 184].

### Phase 3: Trust Shield (Misinformation Detection)
- **Task:** Detect inconsistencies in social media feeds (X/LinkedIn).
- **Inconsistency Logic:** - Scan for "Urgency Bias" (High-pressure language).
  - [cite_start]Scan for "Tone Mismatch" (e.g., a News organization using unverified/slang language)[cite: 184].
  - Scan for metadata mismatches (e.g., Display name vs. Handle domain).
- **UI Constraint:** Apply a very subtle yellow highlight (background-color: rgba(254, 243, 199, 0.4)) to the flagged text block.

## [cite_start]4. Evaluation Criteria Checklist [cite: 80, 81, 82, 83]
1. **Innovation:** Is it ambient and calm? (Avoid traditional alerts).
2. **Technical Strength:** Is the MERN/Next.js backend efficient?
3. **Real-world Impact:** Can a non-technical user understand it instantly?
4. **Functionality:** Does the prototype actually work on a live Privacy Policy page?

## 5. IDE Instructions
1. **File Setup:** Create `/extension` for the frontend and `/api` for the Next.js backend.
2. **Security:** Do not hardcode API keys. Use `.env` files for the Gemini API.
3. **Latency:** Keep the backend responses under 2 seconds. Use streaming if necessary.