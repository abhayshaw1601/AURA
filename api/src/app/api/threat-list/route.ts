import { NextResponse } from 'next/server';

// ── Server-side module cache (avoids hitting GitHub on every request) ──
let cachedDomains: string[] | null = null;
let cacheTime = 0;
const SERVER_CACHE_TTL = 60 * 60 * 1000; // 1 hour

const HOSTS_URL =
  'https://raw.githubusercontent.com/StevenBlack/hosts/master/hosts';

// ── Parse Steven Black hosts file format ──────────────────────────
// Lines look like: "0.0.0.0 malicious-domain.com"
// We skip the self-reference "0.0.0.0 0.0.0.0" and comments (#)
function parseHostsFile(text: string): string[] {
  const domains: string[] = [];

  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();

    // Skip comments and empty lines
    if (!line || line.startsWith('#')) continue;

    // Only process "0.0.0.0 <domain>" entries
    if (!line.startsWith('0.0.0.0 ')) continue;

    const parts = line.split(/\s+/);
    const domain = parts[1];

    // Skip self-reference and invalid entries
    if (!domain || domain === '0.0.0.0' || domain === 'localhost') continue;

    // Basic domain validity: must contain a dot, no spaces
    if (!domain.includes('.') || domain.includes(' ')) continue;

    domains.push(domain.toLowerCase());
  }

  return domains;
}

// ── GET /api/threat-list ──────────────────────────────────────────
// Returns the full parsed domain blocklist.
// Called by background.js once every 24 hours to sync chrome.storage.local.
export async function GET() {
  try {
    // Serve from server-side memory cache if fresh
    if (cachedDomains && Date.now() - cacheTime < SERVER_CACHE_TTL) {
      return NextResponse.json({
        domains: cachedDomains,
        count: cachedDomains.length,
        source: 'StevenBlack/hosts',
        fromServerCache: true,
        syncedAt: cacheTime,
      });
    }

    console.log('[Aura Threat] Fetching hosts file from GitHub...');

    const res = await fetch(HOSTS_URL, {
      signal: AbortSignal.timeout(30_000), // 30s — large file
      headers: { 'User-Agent': 'Aura-SecurityAuditor/1.0' },
    });

    if (!res.ok) {
      throw new Error(`GitHub returned ${res.status}`);
    }

    const text = await res.text();
    const domains = parseHostsFile(text);

    // Update server-side cache
    cachedDomains = domains;
    cacheTime = Date.now();

    console.log(`[Aura Threat] Parsed ${domains.length} domains from hosts file`);

    return NextResponse.json({
      domains,
      count: domains.length,
      source: 'StevenBlack/hosts',
      fromServerCache: false,
      syncedAt: cacheTime,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Aura Threat] Failed to fetch threat list:', message);
    return NextResponse.json(
      { error: `Failed to fetch threat list: ${message}` },
      { status: 502 },
    );
  }
}

// ── POST /api/threat-list ─────────────────────────────────────────
// Single-domain fast check against the server-side cache.
// Used as a fallback if chrome.storage.local is not yet populated.
export async function POST(req: Request) {
  try {
    const body = await req.json() as { domain?: unknown };
    const domain = body.domain;

    if (!domain || typeof domain !== 'string') {
      return NextResponse.json({ error: 'domain is required' }, { status: 400 });
    }

    const normalized = domain.trim().toLowerCase();

    // If server cache is empty, return unknown
    if (!cachedDomains) {
      return NextResponse.json({
        blacklisted: false,
        source: null,
        note: 'Threat database not yet loaded on server — trigger GET first',
      });
    }

    const blacklisted = cachedDomains.includes(normalized);

    return NextResponse.json({
      blacklisted,
      domain: normalized,
      source: blacklisted ? 'StevenBlack/hosts' : null,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// Allow CORS preflight from extension
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
