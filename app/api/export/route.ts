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
      const baseData: { [key: string]: any } = {
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
