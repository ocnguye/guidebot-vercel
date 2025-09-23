import React, { useState } from "react";

export interface UsedReport {
  id: number | string;
  snippet: string;
  fullText: string; // ✅ now guaranteed from API
}

export default function UsedReports({ reports }: { reports: UsedReport[] }) {
  const [selectedReport, setSelectedReport] = useState<UsedReport | null>(null);

  if (!reports?.length) return null;

  return (
    <aside className="relative w-full md:w-80 bg-gray-50 border-l px-4 py-6">
      <h2 className="font-semibold text-purple-700 mb-3 text-lg">
        Reports Used for Context
      </h2>
      <ul className="space-y-3 text-xs">
        {reports.map((r) => (
          <li
            key={r.id}
            className="border-b pb-2 cursor-pointer hover:bg-gray-100 rounded"
            onClick={() => setSelectedReport(r)}
          >
            <span className="font-mono text-gray-800">#{r.id}</span>
            <div className="truncate text-gray-800">{r.snippet}</div>
          </li>
        ))}
      </ul>

      {selectedReport && (
        <div className="fixed inset-0 z-40 flex">
          <div
            className="fixed inset-0 bg-black bg-opacity-40"
            onClick={() => setSelectedReport(null)}
          />

          <div className="relative ml-auto w-full max-w-xl bg-white shadow-xl p-6 overflow-y-auto transition-transform transform translate-x-0">
            <button
              className="absolute top-4 right-4 text-gray-500 hover:text-gray-700"
              onClick={() => setSelectedReport(null)}
            >
              ✕
            </button>
            <h3 className="text-lg font-semibold mb-4 text-purple-700">
              Report #{selectedReport.id}
            </h3>
            <pre className="whitespace-pre-wrap text-sm text-gray-800">
              {selectedReport.fullText}
            </pre>
          </div>
        </div>
      )}
    </aside>
  );
}
