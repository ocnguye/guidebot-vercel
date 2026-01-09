// pages/api/upload/process.ts
import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { put } from "@vercel/blob";

const BUCKET_FOLDER = "cases";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const safeName = file.name.replace(/\s/g, "_");
    const fileKey = `${BUCKET_FOLDER}/${Date.now()}-${safeName}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    // Upload to Vercel Blob
    const { url } = await put(fileKey, buffer, { access: "public" });

    // Parse Excel/CSV
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

    return NextResponse.json({ success: true, cases, fileUrl: url, fileKey });
  } catch (err: any) {
    console.error("Upload error:", err);
    return NextResponse.json({ error: err.message || "Upload failed" }, { status: 500 });
  }
}
