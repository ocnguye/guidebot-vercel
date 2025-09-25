import React, { useState } from "react";

export interface UsedReport {
  id: number | string;
  snippet: string; // preview text for case references
  fullText: string; // full text reference
}

export default function UsedReports({ reports }: { reports: UsedReport[] }) {
  const [selectedReport, setSelectedReport] = useState<UsedReport | null>(null);

  if (!reports?.length) return null;

  return (
    <aside className={`relative bg-gray-50 border-l transition-all duration-300 ${
      selectedReport ? 'w-full md:w-2/3' : 'w-full md:w-80'
    }`}>
      <div className="flex h-full">
        {/* Cases Panel */}
        <div className={`px-4 py-6 transition-all duration-300 ${
          selectedReport ? 'w-80 border-r' : 'w-full'
        }`}>
          <h2 className="font-semibold text-purple-700 mb-3 text-lg">
            Reports Used for Context
          </h2>
          <ul className="space-y-3 text-xs">
            {reports.map((r) => (
              <li
                key={r.id}
                className={`border-b pb-2 cursor-pointer hover:bg-gray-100 rounded p-2 transition-colors ${
                  selectedReport?.id === r.id ? 'bg-purple-100 border-purple-300' : ''
                }`}
                onClick={() => setSelectedReport(r)}
              >
                <span className="font-mono text-gray-800">#{r.id}</span>
                <div className="truncate text-gray-800">{r.snippet}</div>
              </li>
            ))}
          </ul>
        </div>

        {/* Report Detail Panel */}
        {selectedReport && (
          <div className="flex-1 px-4 py-6 bg-white overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-purple-700">
                Report #{selectedReport.id}
              </h3>
              <button
                className="text-gray-500 hover:text-gray-700 text-xl leading-none"
                onClick={() => setSelectedReport(null)}
                title="Close report view"
              >
                ✕
              </button>
            </div>
            <pre className="whitespace-pre-wrap text-sm text-gray-800 leading-relaxed">
              {selectedReport.fullText}
            </pre>
          </div>
        )}
      </div>
    </aside>
  );
}