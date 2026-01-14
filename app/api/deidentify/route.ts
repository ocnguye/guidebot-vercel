import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import * as XLSX from 'xlsx'
import { list } from '@vercel/blob'

// Accept multiple env var names for the Hugging Face token
const HF_TOKEN = process.env.GUIDEBOT_TOKEN;
const MODEL = process.env.DEID_MODEL || "StanfordAIMI/stanford-deidentifier-base"; // allow override via env
const BLOB_TOKEN = process.env.BLOB_READ_WRITE_TOKEN;
const UPLOAD_KEY = process.env.UPLOAD_ENCRYPTION_KEY;

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
    const body = await request.json();

    let cases: any[] | null = null;

    // Option A: caller supplied cases array directly
    if (body.cases && Array.isArray(body.cases)) {
      cases = body.cases;
    }

    // Option B: caller supplied a fileUrl (direct blob URL) or fileKey (path in blob)
    if (!cases && (body.fileUrl || body.fileKey)) {
      // We need the encryption key to decrypt the uploaded file
      if (!UPLOAD_KEY) {
        return NextResponse.json({ error: 'Server missing UPLOAD_ENCRYPTION_KEY to decrypt uploaded file' }, { status: 500 });
      }

      let fileUrl = body.fileUrl as string | undefined;
      const fileKey = body.fileKey as string | undefined;

      if (!fileUrl && fileKey) {
        // Try to resolve fileKey to a blob URL via SDK list
        try {
          const result = await list({ prefix: fileKey });
          const listArray = Array.isArray(result?.blobs) ? result.blobs : (Array.isArray(result) ? result : []);
          const blobEntry = listArray[0];
          fileUrl = blobEntry?.url || blobEntry?.downloadUrl || undefined;
        } catch (e) {
          console.warn('list() for fileKey failed', e);
        }
      }

      // As fallback try the direct Vercel blob host path
      if (!fileUrl && fileKey) {
        fileUrl = `https://blob.vercel-storage.com/${fileKey}`;
      }

      if (!fileUrl) return NextResponse.json({ error: 'Could not resolve file URL to decrypt' }, { status: 400 });

      // Fetch encrypted blob
      const headers: any = {};
      if (BLOB_TOKEN) headers.Authorization = `Bearer ${BLOB_TOKEN}`;

      const resp = await fetch(fileUrl, { headers });
      if (!resp.ok) return NextResponse.json({ error: `Failed to fetch encrypted blob: ${resp.status}` }, { status: 502 });

      const encryptedBuf = Buffer.from(await resp.arrayBuffer());

      // Decrypt: iv(12) | authTag(16) | ciphertext
      if (encryptedBuf.length < 28) return NextResponse.json({ error: 'Encrypted blob too small' }, { status: 400 });
      const iv = encryptedBuf.subarray(0, 12);
      const authTag = encryptedBuf.subarray(12, 28);
      const ciphertext = encryptedBuf.subarray(28);

      const key = Buffer.from(UPLOAD_KEY, 'base64');
      if (key.length !== 32) return NextResponse.json({ error: 'Invalid server UPLOAD_ENCRYPTION_KEY' }, { status: 500 });

      let plain: Buffer;
      try {
        const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
        decipher.setAuthTag(authTag);
        plain = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
      } catch (e: any) {
        console.error('Decryption failed', e);
        return NextResponse.json({ error: 'Failed to decrypt blob' }, { status: 500 });
      }

      // Parse XLSX/CSV from plain buffer
      try {
        const workbook = XLSX.read(plain, { type: 'buffer' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(sheet);
        if (!rows || rows.length === 0) return NextResponse.json({ error: 'No rows found in decrypted file' }, { status: 400 });

        const firstRow = rows[0] as any;
        const columns = Object.keys(firstRow);
        const accessionCols = [
          'AccessionNumber', 'Accession', 'AccessionNum',
          'Accession_Number', 'accession', 'accession_number', 'ReportID'
        ];
        const accessionCol = accessionCols.find(col => columns.includes(col));
        if (!accessionCol) return NextResponse.json({ error: `Missing accession column in decrypted file` }, { status: 400 });

        cases = rows.map((r: any) => ({ AccessionNumber: r[accessionCol], ContentText: r.ContentText || r.ContentText_DEID, ...r }));
      } catch (e) {
        console.error('Failed to parse decrypted file', e);
        return NextResponse.json({ error: 'Failed to parse decrypted file' }, { status: 500 });
      }
    }

    if (!cases || !Array.isArray(cases)) {
      return NextResponse.json({ error: 'Cases array required or fileUrl/fileKey must be provided' }, { status: 400 });
    }

    // De-identify each case using the HF API
    const deidentifiedCases: any[] = [];
    for (const caseData of cases) {
      // Use ContentText_DEID if present, else ContentText
      const text = caseData.ContentText_DEID || caseData.ContentText;
      const deid = await deidentifyWithHF(text);
      deidentifiedCases.push({ ...caseData, Deidentified: deid });
    }

    return NextResponse.json({ cases: deidentifiedCases });
  } catch (error) {
    console.error('De-identification error:', error);
    return NextResponse.json({ error: 'De-identification failed' }, { status: 500 });
  }
}