import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const { text } = await req.json();

    if (!text) {
      return NextResponse.json({ error: 'Text is required' }, { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'Gemini API key is missing' }, { status: 500 });
    }

    const prompt = `Analyze this privacy policy and return a JSON object with two fields:
    1. "riskLevel": one of "low", "med", or "high" based on overall privacy risk.
    2. "summary": an array of exactly 3 short, precise strings (max 12 words each), one for each topic:
       - Index 0: Data Selling — does the policy allow selling/sharing user data? State clearly yes/no and with whom.
       - Index 1: Retention — how long is data kept? State the duration or say "Unspecified".
       - Index 2: User Rights — can users delete/export/opt-out? State the key right in plain English.
    
    Rules: No legalese. No full sentences. No filler words. Label each point like "Data sold to third parties" or "Retained for 18 months". Be direct and factual.
    
    Policy Text:
    ${text.substring(0, 15000)}
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
          temperature: 0.2,
          responseMimeType: "application/json",
        }
      })
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('Gemini API Error:', data);
      return NextResponse.json({ error: 'Failed to generate summary' }, { status: 500 });
    }

    const generatedText = data.candidates?.[0]?.content?.parts?.[0]?.text;

    let result;
    try {
      result = JSON.parse(generatedText);
    } catch (e) {
      console.error('Failed to parse Gemini response as JSON', generatedText);
      result = { riskLevel: 'med', summary: ['Could not generate precise summary, please read carefully.'] };
    }

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('Error in analyze route:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
