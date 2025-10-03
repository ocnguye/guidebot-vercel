"use client";

import React from "react";
import { Button } from "@/components/Button";

interface ExportMarkedProps {
  markedCases: any[];
  onExported?: () => void;
}

export default function ExportMarked({ markedCases, onExported }: ExportMarkedProps) {
  // Prepare preview data
  const previewRows = markedCases.slice(0, 10);

  const handleExport = async () => {
    const res = await fetch("/api/export", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cases: markedCases }),
    });
    if (res.ok) {
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `radextract_export_${new Date().toISOString().split("T")[0]}.xlsx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      if (onExported) onExported();
    }
  };

  return (
    <div>
      <h2 className="text-lg font-semibold mb-2">Export Preview</h2>
      <div className="overflow-x-auto mb-4">
        <table className="min-w-full border text-sm">
          <thead>
            <tr>
              <th className="border px-2 py-1">AccessionNumber</th>
              <th className="border px-2 py-1">PoolName</th>
              <th className="border px-2 py-1">DateAdded</th>
              <th className="border px-2 py-1">Pathology</th>
              <th className="border px-2 py-1">Completion%</th>
              <th className="border px-2 py-1">FieldsFilled</th>
              <th className="border px-2 py-1">ExtractedFeatures</th>
              <th className="border px-2 py-1">Notes</th>
            </tr>
          </thead>
          <tbody>
            {previewRows.map((row, idx) => (
              <tr key={idx}>
                <td className="border px-2 py-1">{row.AccessionNumber}</td>
                <td className="border px-2 py-1">{row.PoolName || ""}</td>
                <td className="border px-2 py-1">{row.DateAdded || ""}</td>
                <td className="border px-2 py-1">{row["Pathology Presence"] || row.Pathology || ""}</td>
                <td className="border px-2 py-1">{Math.round((row["Completion %"] || row.Completion || 0) * 100)}</td>
                <td className="border px-2 py-1">{row["Fields Filled"] || row.FieldsFilled || ""}</td>
                <td className="border px-2 py-1">
                  {row["Schema Extraction"] || row.ExtractedFeatures || ""}
                </td>
                <td className="border px-2 py-1">{row.Notes || ""}</td>
              </tr>
            ))}
            {markedCases.length === 0 && (
              <tr>
                <td colSpan={8} className="text-center text-gray-500 py-4">
                  No marked cases to export.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        {markedCases.length > 10 && (
          <div className="text-xs text-gray-500 mt-2">
            Showing first 10 of {markedCases.length} marked cases.
          </div>
        )}
      </div>
      <Button onClick={handleExport} disabled={markedCases.length === 0}>
        Download Excel
      </Button>
    </div>
  );
}