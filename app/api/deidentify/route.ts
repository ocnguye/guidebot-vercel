import { NextRequest, NextResponse } from 'next/server'

// Accept multiple env var names for the Hugging Face token
const HF_TOKEN = process.env.GUIDEBOT_TOKEN;
const MODEL = "StanfordAIMI/stanford-deidentifier-base"; // allow override via env

async function deidentifyWithHF(text: string): Promise<string> {
  if (!HF_TOKEN) {
    throw new Error('No Hugging Face token configured for de-identification');
  }

  const endpoint = `https://router.huggingface.co/hf-inference/models/${MODEL}`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${HF_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ inputs: text }),
  });

  if (!response.ok) {
    // Try to get response body for more details (Hugging Face often returns useful JSON)
    let bodyText = '';
    try {
      bodyText = await response.text();
    } catch (e) {
      bodyText = `<unable to read body: ${String(e)}>`;
    }
    const err = `HF API error ${response.status} ${response.statusText}: ${bodyText}`;
    console.error(err);
    throw new Error(err);
  }

  const result = await response.json();

  // The model returns an array of entities with start/end/label
  // We'll replace detected entities with <LABEL>
  let deidentified = text;
  if (Array.isArray(result) && result.length > 0 && result[0].entity_group) {
    // Old HF API format (array of entities)
    const entities = [...result].sort((a, b) => b.start - a.start);
    for (const ent of entities) {
      deidentified =
        deidentified.slice(0, ent.start) +
        `<${ent.entity_group}>` +
        deidentified.slice(ent.end);
    }
  } else if (Array.isArray(result) && result.length > 0 && Array.isArray(result[0])) {
    // New HF API format (array of arrays of entities)
    const entities = [...result[0]].sort((a, b) => b.start - a.start);
    for (const ent of entities) {
      deidentified =
        deidentified.slice(0, ent.start) +
        `<${ent.entity_group}>` +
        deidentified.slice(ent.end);
    }
  }
  // If no entities, return original text
  return deidentified;
}

export async function POST(request: NextRequest) {
  try {
    const { cases } = await request.json();

    if (!cases || !Array.isArray(cases)) {
      return NextResponse.json({ error: 'Cases array required' }, { status: 400 });
    }

    // De-identify each case using the HF API
    const deidentifiedCases = [];
    for (const caseData of cases) {
      // Use ContentText_DEID if present, else ContentText
      const text = caseData.ContentText_DEID || caseData.ContentText;
      const deid = await deidentifyWithHF(text);
      deidentifiedCases.push({
        ...caseData,
        Deidentified: deid,
      });
    }

    return NextResponse.json({ cases: deidentifiedCases });
  } catch (error) {
    console.error('De-identification error:', error);
    return NextResponse.json({ error: 'De-identification failed' }, { status: 500 });
  }
}