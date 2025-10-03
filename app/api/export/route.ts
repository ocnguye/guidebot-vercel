export const runtime = "nodejs";
import { NextRequest, NextResponse } from "next/server";
import { write, utils } from "xlsx";

export async function POST(request: NextRequest) {
  try {
    const { cases } = await request.json();

    if (!cases || !Array.isArray(cases)) {
      return NextResponse.json({ error: "Cases array required" }, { status: 400 });
    }

    // Prepare export data with requested columns
    const exportData = cases.map((caseData: any) => ({
      AccessionNumber: caseData.AccessionNumber || "",
      PoolName: caseData.PoolName || "",
      DateAdded: caseData.DateAdded || "",
      Pathology: caseData["Pathology Presence"] || caseData.Pathology || "",
      "Completion%": Math.round((caseData["Completion %"] || caseData.Completion || 0) * 100),
      FieldsFilled: caseData["Fields Filled"] || caseData.FieldsFilled || "",
      ExtractedFeatures: caseData["Schema Extraction"] || caseData.ExtractedFeatures || "",
      Notes: caseData.Notes || "",
    }));

    // Create worksheet and workbook
    const ws = utils.json_to_sheet(exportData);
    const wb = utils.book_new();
    utils.book_append_sheet(wb, ws, "MarkedReports");

    // Write workbook to buffer
    const wbout = write(wb, { type: "buffer", bookType: "xlsx" });

    return new NextResponse(wbout, {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="radextract_export.xlsx"`,
      },
    });
  } catch (error) {
    console.error("Export error:", error);
    return NextResponse.json({ error: "Export failed" }, { status: 500 });
  }
}