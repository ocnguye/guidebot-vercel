// app/api/export/route.ts
import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'

export async function POST(request: NextRequest) {
  try {
    const { cases, schema } = await request.json()
    
    if (!cases || !Array.isArray(cases)) {
      return NextResponse.json({ error: 'Cases array required' }, { status: 400 })
    }

    // Prepare export data with extracted features as separate columns
    const exportData = cases.map(caseData => {
      const baseData = {
        AccessionNumber: caseData.AccessionNumber,
        'Pathology Presence': caseData['Pathology Presence'],
        'Completion %': Math.round((caseData['Completion %'] || 0) * 100),
        'Fields Filled': caseData['Fields Filled'],
        'Total Fields': caseData['Total Fields'],
        'Original Report': caseData.ContentText,
        'Deidentified Report': caseData.Deidentified,
        'Raw Extraction': caseData['Raw Extraction']
      }

      // Add extracted schema fields as separate columns
      try {
        const extractedSchema = JSON.parse(caseData['Schema Extraction'] || '{}')
        Object.keys(schema || {}).forEach(fieldName => {
          if (!fieldName.startsWith('_')) {
            baseData[`Extracted_${fieldName}`] = extractedSchema[fieldName] || ''
          }
        })
      } catch (error) {
        console.error('Failed to parse schema extraction for case:', caseData.AccessionNumber)
      }

      return baseData
    })

    // Create Excel workbook
    const worksheet = XLSX.utils.json_to_sheet(exportData)
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, 'RadExtract Results')

    // Generate buffer
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' })

    // Return as blob
    return new Response(buffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="radextract_export_${new Date().toISOString().split('T')[0]}.xlsx"`
      }
    })

  } catch (error) {
    console.error('Export error:', error)
    return NextResponse.json({ error: 'Export failed' }, { status: 500 })
  }
}

// app/api/settings/api-key/route.ts
import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs/promises'
import path from 'path'

const SETTINGS_DIR = path.join(process.cwd(), 'data', 'settings')
const API_KEY_FILE = path.join(SETTINGS_DIR, 'api_key.json')

async function ensureSettingsDir() {
  try {
    await fs.access(SETTINGS_DIR)
  } catch {
    await fs.mkdir(SETTINGS_DIR, { recursive: true })
  }
}

export async function GET() {
  try {
    await ensureSettingsDir()
    const content = await fs.readFile(API_KEY_FILE, 'utf-8')
    const data = JSON.parse(content)
    
    // Return masked API key for security
    return NextResponse.json({ 
      apiKey: data.apiKey ? `${data.apiKey.substring(0, 8)}...` : null,
      hasKey: !!data.apiKey
    })
  } catch (error) {
    return NextResponse.json({ apiKey: null, hasKey: false })
  }
}

export async function POST(request: NextRequest) {
  try {
    const { apiKey } = await request.json()
    
    if (!apiKey) {
      return NextResponse.json({ error: 'API key required' }, { status: 400 })
    }

    await ensureSettingsDir()
    await fs.writeFile(API_KEY_FILE, JSON.stringify({ apiKey }, null, 2))
    
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error saving API key:', error)
    return NextResponse.json({ error: 'Failed to save API key' }, { status: 500 })
  }
}