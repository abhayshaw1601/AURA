import { NextResponse } from 'next/server';
import { connect as tlsConnect, type PeerCertificate } from 'node:tls';

// ── Types ──────────────────────────────────────────────────────────
interface CertCheckResult {
  connectionSecure: boolean;
  protocol: string;
  certificate: {
    subjectName: string;
    issuerName: string;
    validFrom: string;
    validTo: string;
    daysRemaining: number;
    isExpired: boolean;
    isExpiringSoon: boolean; // < 30 days
  } | null;
  securityHeaders: {
    hsts: boolean;
    csp: boolean;
    xFrameOptions: boolean;
    xContentTypeOptions: boolean;
    referrerPolicy: boolean;
  };
  issues: string[];
  error?: string;
}

// ── Helper: safely stringify a cert subject/issuer field ───────────
function certFieldToString(
  field: PeerCertificate['subject'] | PeerCertificate['issuer'],
): string {
  if (!field) return 'Unknown';
  const f = field as Record<string, string | string[]>;
  const cn = f['CN'];
  const o  = f['O'];
  if (cn) return Array.isArray(cn) ? cn[0] : cn;
  if (o)  return Array.isArray(o)  ? o[0]  : o;
  return (
    Object.entries(f)
      .map(([k, v]) => `${k}=${Array.isArray(v) ? v.join(',') : v}`)
      .join(', ') || 'Unknown'
  );
}

// ── Helper: audit response headers ────────────────────────────────
async function auditSecurityHeaders(hostname: string): Promise<{
  headers: CertCheckResult['securityHeaders'];
  protocol: string;
  issues: string[];
}> {
  const issues: string[] = [];
  const headers: CertCheckResult['securityHeaders'] = {
    hsts: false,
    csp: false,
    xFrameOptions: false,
    xContentTypeOptions: false,
    referrerPolicy: false,
  };
  let protocol = 'HTTPS';

  try {
    const res = await fetch(`https://${hostname}`, {
      method: 'HEAD',
      redirect: 'follow',
      signal: AbortSignal.timeout(6000),
      headers: { 'User-Agent': 'Aura-SecurityAuditor/1.0' },
    });

    const h = res.headers;

    // Detect HTTP/2 or HTTP/3 from Alt-Svc header
    const altSvc = h.get('alt-svc') ?? '';
    if (altSvc.includes('h3'))      protocol = 'HTTP/3 (QUIC)';
    else if (altSvc.includes('h2')) protocol = 'HTTP/2';

    headers.hsts                = !!h.get('strict-transport-security');
    headers.csp                 = !!h.get('content-security-policy');
    headers.xFrameOptions       = !!h.get('x-frame-options');
    headers.xContentTypeOptions = !!h.get('x-content-type-options');
    headers.referrerPolicy      = !!h.get('referrer-policy');

    if (!headers.hsts)                issues.push('Missing Strict-Transport-Security (HSTS)');
    if (!headers.csp)                 issues.push('Missing Content-Security-Policy header');
    if (!headers.xFrameOptions)       issues.push('Missing X-Frame-Options (clickjacking risk)');
    if (!headers.xContentTypeOptions) issues.push('Missing X-Content-Type-Options');
  } catch {
    issues.push('Could not fetch security headers — site may block HEAD requests');
  }

  return { headers, protocol, issues };
}

// ── Helper: extract peer certificate via TLS handshake ─────────────
function getPeerCertificate(hostname: string): Promise<CertCheckResult['certificate']> {
  return new Promise((resolve) => {
    let settled = false;

    const socket = tlsConnect(
      {
        host: hostname,
        port: 443,
        servername: hostname,      // SNI — critical for shared-hosting certs
        rejectUnauthorized: false, // Inspect even bad/expired certs
      },
      () => {
        if (settled) return;
        settled = true;

        try {
          const cert = socket.getPeerCertificate(false);

          if (!cert || !cert.subject) {
            socket.destroy();
            return resolve(null);
          }

          const subjectName = certFieldToString(cert.subject);
          const issuerName  = certFieldToString(cert.issuer);

          const validTo   = cert.valid_to   ?? '';
          const validFrom = cert.valid_from ?? '';

          const expiryDate    = new Date(validTo);
          const now           = new Date();
          const daysRemaining = Math.floor(
            (expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
          );

          socket.destroy();
          resolve({
            subjectName,
            issuerName,
            validFrom,
            validTo,
            daysRemaining,
            isExpired:      daysRemaining < 0,
            isExpiringSoon: daysRemaining >= 0 && daysRemaining < 30,
          });
        } catch {
          socket.destroy();
          resolve(null);
        }
      },
    );

    // Timeout must be set on the socket directly — not in tlsConnect options
    socket.setTimeout(8000, () => {
      if (!settled) { settled = true; socket.destroy(); resolve(null); }
    });

    socket.on('error', () => {
      if (!settled) { settled = true; resolve(null); }
    });
  });
}

// ── Route handler ──────────────────────────────────────────────────
export async function POST(req: Request) {
  try {
    const body = await req.json() as { domain?: unknown };
    const domain = body.domain;

    if (!domain || typeof domain !== 'string') {
      return NextResponse.json({ error: 'domain is required' }, { status: 400 });
    }

    // Sanitize: strip protocol/path, keep hostname only
    let hostname = domain.trim().toLowerCase();
    try {
      if (hostname.startsWith('http')) hostname = new URL(hostname).hostname;
    } catch {
      // invalid URL — keep raw value, will fail check below
    }

    // Reject non-HTTPS or internal browser URLs
    if (!hostname || hostname.startsWith('chrome') || hostname === 'newtab') {
      const emptyResult: CertCheckResult = {
        connectionSecure: false,
        protocol: 'N/A',
        certificate: null,
        securityHeaders: {
          hsts: false, csp: false,
          xFrameOptions: false, xContentTypeOptions: false, referrerPolicy: false,
        },
        issues: ['Not a valid HTTPS domain'],
      };
      return NextResponse.json(emptyResult);
    }

    // Run cert check and header audit in parallel
    const [cert, headerAudit] = await Promise.all([
      getPeerCertificate(hostname),
      auditSecurityHeaders(hostname),
    ]);

    const issues = [...headerAudit.issues];

    if (!cert) {
      issues.push('Could not retrieve TLS certificate');
    } else {
      if (cert.isExpired)
        issues.push(`Certificate EXPIRED ${Math.abs(cert.daysRemaining)} days ago`);
      if (cert.isExpiringSoon)
        issues.push(`Certificate expires in ${cert.daysRemaining} days`);

      // Domain mismatch check (wildcard-aware)
      const certDomain = cert.subjectName.toLowerCase();
      const wildcardOk = certDomain === `*.${hostname.split('.').slice(1).join('.')}`;
      const exactOk    = certDomain === hostname || certDomain.endsWith(`.${hostname}`);
      if (!exactOk && !wildcardOk && !certDomain.includes('*')) {
        issues.push(`Certificate domain mismatch: issued to "${cert.subjectName}"`);
      }
    }

    const result: CertCheckResult = {
      connectionSecure: !issues.some(
        (i) =>
          i.toLowerCase().includes('expired') ||
          i.toLowerCase().includes('mismatch'),
      ),
      protocol: headerAudit.protocol,
      certificate: cert,
      securityHeaders: headerAudit.headers,
      issues,
    };

    return NextResponse.json(result);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Aura cert-check] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// Allow CORS preflight from extension
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin':  '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
