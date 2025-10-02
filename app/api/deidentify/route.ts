import { NextRequest, NextResponse } from 'next/server'

const HF_TOKEN = process.env.GUIDEBOT_TOKEN; // Set this in your .env file
const MODEL = "StanfordAIMI/stanford-deidentifier-base"; // <-- updated model name

async function deidentifyWithHF(text: string): Promise<string> {
  const response = await fetch(
    `https://api-inference.huggingface.co/models/${MODEL}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${HF_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ inputs: text }),
    }
  );

  if (!response.ok) {
    throw new Error(`HF API error: ${response.statusText}`);
  }

  const result = await response.json();

  // The model returns an array of entities with start/end/label
  // We'll replace detected entities with <LABEL>
  let deidentified = text;
  if (Array.isArray(result) && result.length > 0 && result[0].entity_group) {
    // Old HF API format (array of entities)
    // Sort by start descending to avoid messing up indices
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
      const deid = await deidentifyWithHF(caseData.ContentText);
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