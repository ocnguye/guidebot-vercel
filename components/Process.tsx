"use client";

import React, { useMemo } from "react";

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

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full border text-sm">
        <thead>
          <tr>
            <th className="border px-2 py-1 bg-gray-50">Accession Number</th>
            <th className="border px-2 py-1 bg-gray-50">Original Report</th>
            <th className="border px-2 py-1 bg-gray-50">De-identified Report</th>
          </tr>
        </thead>
        <tbody>
          {fileData.map((row, idx) => (
            <tr key={idx}>
              <td className="border px-2 py-1 align-top font-mono">
                {row.AccessionNumber || "-"}
              </td>
              <td className="border px-2 py-1 align-top whitespace-pre-wrap max-w-xs">
                {row.ContentText}
              </td>
              <td className="border px-2 py-1 align-top whitespace-pre-wrap max-w-xs bg-green-50">
                {row.Deidentified || (
                  <span className="italic text-gray-400">Not de-identified</span>
                )}
              </td>
            </tr>
          ))}
          {fileData.length === 0 && (
            <tr>
              <td colSpan={3} className="text-center text-gray-500 py-4">
                No reports to display.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}