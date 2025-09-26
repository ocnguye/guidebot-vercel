
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