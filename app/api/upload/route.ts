import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { promises as fs } from "fs";
import path from "path";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    // Convert to buffer
    const buffer = Buffer.from(await file.arrayBuffer());

    // --- 1. Save to public/uploads ---
    const uploadDir = path.join(process.cwd(), "public", "uploads");
    await fs.mkdir(uploadDir, { recursive: true });

    const filePath = path.join(uploadDir, file.name);
    await fs.writeFile(filePath, buffer);

    // Public URL to access later
    const fileUrl = `/uploads/${file.name}`;

    // --- 2. Parse Excel ---
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json(worksheet);

    if (data.length === 0) {
      return NextResponse.json({ error: "File is empty" }, { status: 400 });
    }

    const firstRow = data[0] as any;
    const columns = Object.keys(firstRow);

    if (!columns.includes("ContentText") && !columns.includes("ContentText_DEID")) {
      return NextResponse.json(
        { error: "Missing required column: ContentText" },
        { status: 400 }
      );
    }

    const accessionColumns = [
      "AccessionNumber",
      "Accession",
      "AccessionNum",
      "Accession_Number",
      "accession",
      "accession_number",
      "ReportID"
    ];
    const accessionCol = accessionColumns.find((col) =>
      columns.includes(col)
    );

    if (!accessionCol) {
      return NextResponse.json(
        {
          error: `Missing accession column. Please ensure your Excel has one of these columns: ${accessionColumns.join(
            ", "
          )}`,
        },
        { status: 400 }
      );
    }

    const cases = data.map((row: any) => ({
      AccessionNumber: row[accessionCol],
      ContentText: row.ContentText,
      ...row,
    }));

    return NextResponse.json({ success: true, fileUrl, cases });
  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json(
      { error: "Failed to process file" },
      { status: 500 }
    );
  }
}
