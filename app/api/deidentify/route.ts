// app/api/deidentify/route.ts
import { NextRequest, NextResponse } from 'next/server'

// Simple de-identification function (placeholder - you might want to use a proper NLP model)
function deidentifyText(text: string): string {
  // Basic patterns for common PII
  const patterns = [
    { regex: /\b\d{3}-\d{2}-\d{4}\b/g, replacement: '<SSN>' },
    { regex: /\b\d{10,11}\b/g, replacement: '<PHONE>' },
    { regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, replacement: '<EMAIL>' },
    { regex: /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},?\s+\d{4}\b/gi, replacement: '<DATE>' },
    { regex: /\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/g, replacement: '<DATE>' },
    { regex: /\b\d{1,2}-\d{1,2}-\d{2,4}\b/g, replacement: '<DATE>' },
    { regex: /\bMR#?\s*:?\s*\d+/gi, replacement: '<MRN>' },
    { regex: /\bMRN\s*:?\s*\d+/gi, replacement: '<MRN>' },
    { regex: /\b[A-Z][a-z]+\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?\b/g, replacement: '<NAME>' }
  ]
  
  let deidentified = text
  patterns.forEach(pattern => {
    deidentified = deidentified.replace(pattern.regex, pattern.replacement)
  })
  
  return deidentified
}

export async function POST(request: NextRequest) {
  try {
    const { cases } = await request.json()
    
    if (!cases || !Array.isArray(cases)) {
      return NextResponse.json({ error: 'Cases array required' }, { status: 400 })
    }

    const deidentifiedCases = cases.map(caseData => ({
      ...caseData,
      Deidentified: deidentifyText(caseData.ContentText)
    }))

    return NextResponse.json({ cases: deidentifiedCases })
  } catch (error) {
    console.error('De-identification error:', error)
    return NextResponse.json({ error: 'De-identification failed' }, { status: 500 })
  }
}
