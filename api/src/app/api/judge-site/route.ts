import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const { domain, integrityData, pageTitle, pageText } = await req.json();

    if (!domain) {
      return NextResponse.json({ error: 'Domain is required' }, { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'Gemini API key is missing' }, { status: 500 });
    }

    const prompt = `You are the Aura Zero-Day Inference Engine. Your job is to analyze website metadata and context to detect brand-new phishing or malicious sites that are not yet in blacklists.

    Inputs:
    1. Domain: ${domain}
    2. Page Title: ${pageTitle || 'N/A'}
    3. TLS/Integrity Issues: ${integrityData?.issues?.join(', ') || 'None'}
    4. Is Connection Secure?: ${integrityData?.connectionSecure ? 'Yes' : 'No'}
    5. Security Headers Missing: ${JSON.stringify(integrityData?.securityHeaders) || 'Unknown'}
    6. Page Text snippet: ${pageText ? pageText.substring(0, 500) : 'N/A'}

    Evaluate the inputs for zero-day phishing characteristics:
    - Homoglyph/Typosquatting: Does the domain look like a misspelled popular brand?
    - Missing crucial headers (like CSP or X-Frame-Options) on a site claiming to handle sensitive data?
    - Certificate anomalies combined with urgent page text ("login now", "account suspended")?

    Output a JSON object with:
    1. "score": integer from 0 to 100 (100 = definitely malicious/phishing).
    2. "riskLevel": "low", "med", or "high". (High is score > 60).
    3. "reason": A short 1-sentence explanation of your judgement.

    Be conservative. Do not flag generic blogs or small businesses just because they lack headers. Only flag if it actively looks deceptive or highly suspicious.
    `;

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [{
          parts: [{ text: prompt }]
        }],
        generationConfig: {
          temperature: 0.1,
          responseMimeType: "application/json",
        }
      })
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('Gemini API Error:', data);
      return NextResponse.json({ error: 'Failed to generate inference' }, { status: 500 });
    }

    const generatedText = data.candidates?.[0]?.content?.parts?.[0]?.text;

    let result;
    try {
      result = JSON.parse(generatedText);
    } catch (e) {
      console.error('Failed to parse Gemini response as JSON', generatedText);
      result = { score: 0, riskLevel: 'low', reason: 'Error parsing AI response.' };
    }

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('Error in judge-site route:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
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
