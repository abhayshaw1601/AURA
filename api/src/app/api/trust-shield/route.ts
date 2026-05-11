import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const { texts } = await req.json();

    if (!texts || !Array.isArray(texts)) {
      return NextResponse.json({ error: 'Texts array is required' }, { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'Gemini API key is missing' }, { status: 500 });
    }

    // Since this is a prototype, we'll just process the first text or batch them
    const combinedText = texts.join('\n\n---\n\n').substring(0, 10000);

    const prompt = `Analyze the following social media posts for misinformation or inconsistencies. Look for:
    1. "Urgency Bias" (High-pressure language).
    2. "Tone Mismatch" (e.g., News org using unverified/slang language).
    3. Metadata mismatches (e.g., Display name vs. Handle domain in the text).
    Return strictly JSON: {"flagged": true|false, "reason": "brief explanation", "riskLevel": "low"|"med"|"high"}.
    
    Posts:
    ${combinedText}
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
      return NextResponse.json({ error: 'Failed to analyze text' }, { status: 500 });
    }

    const generatedText = data.candidates?.[0]?.content?.parts?.[0]?.text;

    let result;
    try {
      result = JSON.parse(generatedText);
    } catch (e) {
      result = { flagged: false, reason: 'Analysis failed.', riskLevel: 'low' };
    }

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('Error in trust-shield route:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
