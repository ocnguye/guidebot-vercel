"use client";

import React, { useState } from "react";
import { Button } from "@/components/Button";
import { Progress } from "@/components/Progress";
import { Select, SelectItem } from "@/components/Select";

interface ProcessProps {
  uploadedData: any[];
  availableSchemas: { name: string; schema: any }[];
  onProcessed: (processed: any[]) => void;
}

export default function Process({
  uploadedData,
  availableSchemas,
  onProcessed,
}: ProcessProps) {
  const [selectedSchemaName, setSelectedSchemaName] = useState<string>(
    availableSchemas[0]?.name || ""
  );
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [processedData, setProcessedData] = useState<any[]>([]);
  const [minCompletion, setMinCompletion] = useState(0.7);

  const selectedSchema =
    availableSchemas.find((s) => s.name === selectedSchemaName)?.schema || {};

  async function handleProcess() {
    setProcessing(true);
    setProgress(0);

    // Call the API once for all cases
    const res = await fetch("/api/process", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        cases: uploadedData,
        schema: selectedSchema,
      }),
    });
    const data = await res.json();
    setProcessedData(data.processed || []);
    setProcessing(false);
    onProcessed(data.processed || []);
  }

  // Filter for positive findings and min completion
  const filtered = processedData.filter(
    (c) =>
      c["Pathology Presence"] === "Present" &&
      (c["Completion %"] || 0) >= minCompletion
  );

  return (
    <div className="space-y-6">
      <div>
        <label className="block font-medium mb-1">Select Schema</label>
        <Select
          value={selectedSchemaName}
          onChange={setSelectedSchemaName}
        >
          {availableSchemas.map((s) => (
            <SelectItem key={s.name} value={s.name}>
              {s.name}
            </SelectItem>
          ))}
        </Select>
      </div>
      <div>
        <label className="block font-medium mb-1">Minimum Completion %</label>
        <input
          type="number"
          min={0}
          max={1}
          step={0.01}
          value={minCompletion}
          onChange={(e) => setMinCompletion(Number(e.target.value))}
          className="border rounded px-2 py-1 w-24"
        />{" "}
        (e.g. 0.7 = 70%)
      </div>
      <Button
        onClick={handleProcess}
        disabled={processing || !selectedSchemaName || uploadedData.length === 0}
      >
        {processing ? "Processing..." : "Process Reports"}
      </Button>
      {processing && (
        <div className="mt-4">
          <Progress value={progress} />
          <p className="mt-2 text-sm">
            Processing...
          </p>
        </div>
      )}
      {processedData.length > 0 && (
        <div className="mt-6">
          <h2 className="font-semibold mb-2">
            Positive Findings (≥ {Math.round(minCompletion * 100)}% completion): {filtered.length}
          </h2>
          <table className="border mt-2 w-full text-sm">
            <thead>
              <tr>
                <th className="border px-2 py-1">AccessionNumber</th>
                <th className="border px-2 py-1">Completion %</th>
                <th className="border px-2 py-1">Pathology Presence</th>
                <th className="border px-2 py-1">Extracted Fields</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c, i) => (
                <tr key={i}>
                  <td className="border px-2 py-1">{c.AccessionNumber}</td>
                  <td className="border px-2 py-1">
                    {Math.round((c["Completion %"] || 0) * 100)}%
                  </td>
                  <td className="border px-2 py-1">{c["Pathology Presence"]}</td>
                  <td className="border px-2 py-1">
                    {c["Schema Extraction"]}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <p className="text-gray-500 mt-2">No positive findings with sufficient completion.</p>
          )}
        </div>
      )}
    </div>
  );
}