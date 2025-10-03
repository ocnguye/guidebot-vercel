"use client";

import React, { useMemo, useState } from "react";

interface ProcessProps {
  uploadedData: {
    AccessionNumber?: string;
    ContentText: string;
    Deidentified?: string;
    __filename?: string;
    [key: string]: any;
  }[];
  selectedFileName?: string;
}

export default function Process({ uploadedData, selectedFileName }: ProcessProps) {
  // Filter by selected file if provided
  const fileData = useMemo(() => {
    if (!selectedFileName) return uploadedData;
    return uploadedData.filter((d) => d.__filename === selectedFileName);
  }, [uploadedData, selectedFileName]);

  // Track collapsed state for each row by index
  const [collapsedRows, setCollapsedRows] = useState<{ [idx: number]: boolean }>({});

  const toggleCollapse = (idx: number) => {
    setCollapsedRows(prev => ({
      ...prev,
      [idx]: !prev[idx],
    }));
  };

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full border text-sm">
        <thead>
          <tr>
            <th className="border px-2 py-1 bg-gray-50"></th>
            <th className="border px-2 py-1 bg-gray-50">Accession Number</th>
            <th className="border px-2 py-1 bg-gray-50">Original Report</th>
            <th className="border px-2 py-1 bg-gray-50">De-identified Report</th>
          </tr>
        </thead>
        <tbody>
          {fileData.map((row, idx) => {
            const isCollapsed = collapsedRows[idx];
            return (
              <tr key={idx}>
                <td className="border px-2 py-1 align-top text-center">
                  <button
                    type="button"
                    aria-label={isCollapsed ? "Expand" : "Collapse"}
                    onClick={() => toggleCollapse(idx)}
                    className="text-xs px-2 py-1 rounded hover:bg-muted transition-colors border"
                  >
                    {isCollapsed ? "▶" : "▼"}
                  </button>
                </td>
                <td className="border px-2 py-1 align-top font-mono">
                  {row.AccessionNumber || "-"}
                </td>
                <td className="border px-2 py-1 align-top whitespace-pre-wrap max-w-xs">
                  {isCollapsed ? (
                    <span className="text-gray-400 italic">[collapsed]</span>
                  ) : (
                    row.ContentText
                  )}
                </td>
                <td className="border px-2 py-1 align-top whitespace-pre-wrap max-w-xs bg-green-50">
                  {isCollapsed ? (
                    <span className="text-gray-400 italic">[collapsed]</span>
                  ) : (
                    row.Deidentified || (
                      <span className="italic text-gray-400">Not de-identified</span>
                    )
                  )}
                </td>
              </tr>
            );
          })}
          {fileData.length === 0 && (
            <tr>
              <td colSpan={4} className="text-center text-gray-500 py-4">
                No reports to display.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}