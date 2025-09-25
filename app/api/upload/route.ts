// app/api/upload/route.ts
import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File
    
    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    const workbook = XLSX.read(buffer, { type: 'buffer' })
    const worksheet = workbook.Sheets[workbook.SheetNames[0]]
    const data = XLSX.utils.sheet_to_json(worksheet)

    // Validate required columns
    if (data.length === 0) {
      return NextResponse.json({ error: 'File is empty' }, { status: 400 })
    }

    const firstRow = data[0] as any
    const columns = Object.keys(firstRow)
    
    if (!columns.includes('ContentText')) {
      return NextResponse.json({ error: 'Missing required column: ContentText' }, { status: 400 })
    }

    // Find accession number column (flexible naming)
    const accessionColumns = ['AccessionNumber', 'Accession', 'AccessionNum', 'Accession_Number', 'accession', 'accession_number']
    const accessionCol = accessionColumns.find(col => columns.includes(col))
    
    if (!accessionCol) {
      return NextResponse.json({ 
        error: `Missing accession column. Please ensure your Excel has one of these columns: ${accessionColumns.join(', ')}` 
      }, { status: 400 })
    }

    // Standardize data format
    const cases = data.map((row: any) => ({
      AccessionNumber: row[accessionCol],
      ContentText: row.ContentText,
      ...row
    }))

    return NextResponse.json({ cases })
  } catch (error) {
    console.error('Upload error:', error)
    return NextResponse.json({ error: 'Failed to process file' }, { status: 500 })
  }
}