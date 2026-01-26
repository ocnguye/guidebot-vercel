// pages/api/upload/process.ts
import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { put } from "@vercel/blob";
import crypto from "crypto";

const BUCKET_FOLDER = "cases";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

  const safeName = file.name.replace(/\s/g, "_");
  const fileKey = `${BUCKET_FOLDER}/${safeName}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  // Parse Excel/CSV from the raw buffer in-memory (we will encrypt before storing)
  const workbook = XLSX.read(buffer, { type: "buffer" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet);

    if (!rows.length) {
      return NextResponse.json({ error: "File is empty" }, { status: 400 });
    }

    // Required columns
    const firstRow = rows[0] as any;
    const columns = Object.keys(firstRow);
    if (!columns.includes("ContentText") && !columns.includes("ContentText_DEID")) {
      return NextResponse.json({ error: "Missing required column: ContentText" }, { status: 400 });
    }

    const accessionCols = [
      "AccessionNumber", "Accession", "AccessionNum",
      "Accession_Number", "accession", "accession_number", "ReportID"
    ];
    const accessionCol = accessionCols.find(col => columns.includes(col));
    if (!accessionCol) {
      return NextResponse.json({
        error: `Missing accession column. Must include one of: ${accessionCols.join(", ")}`
      }, { status: 400 });
    }

    const cases = rows.map((r: any) => ({
      AccessionNumber: r[accessionCol],
      ContentText: r.ContentText || r.ContentText_DEID,
      ...r
    }));

    // Encrypt the raw buffer before uploading to blob so the raw file is never stored in plaintext.
    // Encryption format uploaded: <12 byte iv><16 byte authTag><ciphertext>
    const base64Key = process.env.UPLOAD_ENCRYPTION_KEY;
    if (!base64Key) {
      return NextResponse.json({ error: "UPLOAD_ENCRYPTION_KEY not configured. Set a base64-encoded 32-byte key." }, { status: 500 });
    }

    let key: Buffer;
    try {
      key = Buffer.from(base64Key, "base64");
      if (key.length !== 32) throw new Error("invalid key length");
    } catch (e) {
      return NextResponse.json({ error: "Invalid UPLOAD_ENCRYPTION_KEY. Must be base64 of 32 bytes." }, { status: 500 });
    }

    const iv = crypto.randomBytes(12); // 96-bit for GCM
    const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
    const encrypted = Buffer.concat([cipher.update(buffer), cipher.final()]);
    const authTag = cipher.getAuthTag();

    const payload = Buffer.concat([iv, authTag, encrypted]);

    // Upload encrypted payload to Vercel Blob
  const { url } = await put(fileKey, payload, { access: "public", contentType: "application/octet-stream", allowOverwrite: true });

    // Return success and cases; note we do not expose the encryption key. Consumers that need
    // to download & decrypt must be server-side (have UPLOAD_ENCRYPTION_KEY) or you can implement
    // secure key sharing/rotation.
    return NextResponse.json({ success: true, cases, fileUrl: url, fileKey, encrypted: true });
  } catch (err: any) {
    console.error("Upload error:", err);
    return NextResponse.json({ error: err.message || "Upload failed" }, { status: 500 });
  }
}
