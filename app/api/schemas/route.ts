// app/api/schemas/route.ts
import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs/promises'
import path from 'path'

const SCHEMA_DIR = path.join(process.cwd(), 'data', 'schemas')

// Ensure schema directory exists
async function ensureSchemaDir() {
  try {
    await fs.access(SCHEMA_DIR)
  } catch {
    await fs.mkdir(SCHEMA_DIR, { recursive: true })
  }
}

export async function GET() {
  try {
    await ensureSchemaDir()
    const files = await fs.readdir(SCHEMA_DIR)
    const schemas = files
      .filter(file => file.endsWith('.json'))
      .map(file => file.replace('.json', ''))
    
    return NextResponse.json(schemas)
  } catch (error) {
    console.error('Error loading schemas:', error)
    return NextResponse.json([])
  }
}

export async function POST(request: NextRequest) {
  try {
    const { name, schema } = await request.json()
    
    if (!name || !schema) {
      return NextResponse.json({ error: 'Name and schema required' }, { status: 400 })
    }

    await ensureSchemaDir()
    const filePath = path.join(SCHEMA_DIR, `${name}.json`)
    await fs.writeFile(filePath, JSON.stringify(schema, null, 2))
    
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error saving schema:', error)
    return NextResponse.json({ error: 'Failed to save schema' }, { status: 500 })
  }
}
