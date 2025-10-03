"use client";

import React, { useState, useMemo, useEffect } from "react";
import { Button } from "@/components/Button";
import { Select, SelectItem } from "@/components/Select";
import { Input } from "@/components/Input";

interface AnalyzeProps {
  uploadedData: any[];
  lastFileName?: string;
  availableSchemas: { name: string; schema: any }[];
  onProcessed: (processed: any[]) => void;
  onExportMarked: (cases: any[]) => void;
}

export default function Analyze({
  uploadedData,
  lastFileName,
  availableSchemas,
  onProcessed,
  onExportMarked,
}: AnalyzeProps) {
  const [selectedFileName, setSelectedFileName] = useState<string>(
    lastFileName ||
    (uploadedData.length > 0 ? uploadedData[uploadedData.length - 1].__filename : "")
  );
  const [selectedSchemaName, setSelectedSchemaName] = useState<string>(
    availableSchemas[0]?.name || ""
  );
  const [processing, setProcessing] = useState(false);
  const [processedData, setProcessedData] = useState<any[]>([]);
  const [markedCases, setMarkedCases] = useState<Set<string>>(new Set());
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Filtering state
  const [filterPathology, setFilterPathology] = useState("All");
  const [filterMinCompletion, setFilterMinCompletion] = useState(0.7);
  const [filterMinFields, setFilterMinFields] = useState(0);
  const [filterField, setFilterField] = useState("");
  const [filterFieldValue, setFilterFieldValue] = useState("");

  useEffect(() => {
    if (lastFileName) {
      setSelectedFileName(lastFileName);
    } else if (uploadedData.length > 0) {
      setSelectedFileName(uploadedData[uploadedData.length - 1].__filename);
    }
  }, [lastFileName, uploadedData]);

  // Find all unique uploaded files (by __filename property)
  const uploadedFiles = useMemo(() => {
    const files = Array.from(
      new Set(uploadedData.map((d) => d.__filename).filter(Boolean))
    );
    return files;
  }, [uploadedData]);

  // Filter uploadedData by selected file
  const fileData = useMemo(() => {
    if (!selectedFileName) return uploadedData;
    return uploadedData.filter((d) => d.__filename === selectedFileName);
  }, [uploadedData, selectedFileName]);

  const selectedSchema =
    availableSchemas.find((s) => s.name === selectedSchemaName)?.schema || {};

  async function handleAnalyze() {
    setProcessing(true);
    setSuccessMsg(null);

    const res = await fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        cases: fileData,
        schema: selectedSchema,
      }),
    });
    const data = await res.json();
    setProcessedData(data.processed || []);
    setProcessing(false);
    onProcessed(data.processed || []);
    setSuccessMsg("✅ Reports successfully processed!");
  }

  // Parse schema extraction for each row
  const parsedProcessedData = useMemo(() => {
    return processedData.map((row) => {
      let parsed = {};
      try {
        parsed = JSON.parse(row["Schema Extraction"] || "{}");
      } catch {
        // ignore
      }
      return { ...row, parsedSchema: parsed };
    });
  }, [processedData]);

  // Collect unique values for each schema field
  const uniqueFieldValues = useMemo(() => {
    const values: { [field: string]: Set<any> } = {};
    parsedProcessedData.forEach((row) => {
      Object.entries(row.parsedSchema || {}).forEach(([k, v]) => {
        if (!values[k]) values[k] = new Set();
        values[k].add(v);
      });
    });
    return Object.fromEntries(
      Object.entries(values).map(([k, v]) => [k, Array.from(v)])
    );
  }, [parsedProcessedData]);

  // Filtering
  const filtered = useMemo(() => {
    return parsedProcessedData.filter((c) => {
      const completionMatch =
        (c["Completion %"] || 0) >= filterMinCompletion;
      const fieldsMatch =
        (c["Fields Filled"] || 0) >= filterMinFields;
      const pathologyMatch =
        filterPathology === "All" || c["Pathology Presence"] === filterPathology;
      const fieldMatch =
        !filterField ||
        (c.parsedSchema &&
          (c.parsedSchema[filterField] === filterFieldValue ||
            (Array.isArray(c.parsedSchema[filterField]) &&
              c.parsedSchema[filterField].includes(filterFieldValue))));
      return completionMatch && fieldsMatch && pathologyMatch && fieldMatch;
    });
  }, [
    parsedProcessedData,
    filterMinCompletion,
    filterMinFields,
    filterPathology,
    filterField,
    filterFieldValue,
  ]);

  // Analytics
  const avgCompletion =
    filtered.reduce((sum, c) => sum + (c["Completion %"] || 0), 0) /
    (filtered.length || 1);
  const pathologyCounts = filtered.reduce(
    (acc, c) => {
      const p = c["Pathology Presence"] || "Unknown";
      acc[p] = (acc[p] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  // Mark/unmark cases
  const toggleMarkCase = (accession: string) => {
    setMarkedCases((prev) => {
      const copy = new Set(prev);
      if (copy.has(accession)) copy.delete(accession);
      else copy.add(accession);
      return copy;
    });
  };

  // Marked cases summary
  const marked = filtered.filter((c) => markedCases.has(c.AccessionNumber));
  const markedAvgCompletion =
    marked.reduce((sum, c) => sum + (c["Completion %"] || 0), 0) /
    (marked.length || 1);

  // Field-by-field analysis for marked cases
  const markedFieldStats = useMemo(() => {
    const stats: Record<string, { filled: number; values: Record<string, number> }> = {};
    marked.forEach((row) => {
      Object.entries(row.parsedSchema || {}).forEach(([k, v]) => {
        if (!stats[k]) stats[k] = { filled: 0, values: {} };
        if (v !== "" && v !== null && v !== undefined) {
          stats[k].filled += 1;
          const val = Array.isArray(v) ? v.join(",") : String(v);
          stats[k].values[val] = (stats[k].values[val] || 0) + 1;
        }
      });
    });
    return stats;
  }, [marked]);

  return (
    <div className="space-y-8">
      {/* File and Schema Selection */}
      <div className="flex flex-col md:flex-row gap-4 items-center">
        <div>
          <label className="block font-medium mb-1">Schema File</label>
          <Select
            value={selectedFileName}
            onChange={setSelectedFileName}
            className="min-w-[200px]"
          >
            {uploadedFiles.map((fname) => (
              <SelectItem key={fname} value={fname}>
                {fname}
              </SelectItem>
            ))}
          </Select>
        </div>
        <div>
          <label className="block font-medium mb-1">Schema</label>
          <Select
            value={selectedSchemaName}
            onChange={setSelectedSchemaName}
            className="min-w-[200px]"
          >
            {availableSchemas.map((s) => (
              <SelectItem key={s.name} value={s.name}>
                {s.name}
              </SelectItem>
            ))}
          </Select>
        </div>
        <Button
          onClick={handleAnalyze}
          disabled={processing || !selectedSchemaName || fileData.length === 0}
        >
          {processing ? "Processing..." : "Analyze Reports"}
        </Button>
      </div>

      {/* Success Message */}
      {successMsg && (
        <div className="text-green-700 font-medium mt-2">{successMsg}</div>
      )}

      {/* Filtering Controls */}
      <div className="flex flex-wrap gap-4 items-end">
        <div>
          <label className="block text-xs font-semibold">Pathology</label>
          <Select value={filterPathology} onChange={setFilterPathology}>
            <SelectItem value="All">All</SelectItem>
            <SelectItem value="Present">Present</SelectItem>
            <SelectItem value="Not Present">Not Present</SelectItem>
          </Select>
        </div>
        <div>
          <label className="block text-xs font-semibold">Min Completion %</label>
          <Input
            type="number"
            min={0}
            max={1}
            step={0.01}
            value={filterMinCompletion}
            onChange={(e) => setFilterMinCompletion(Number(e.target.value))}
            className="w-24"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold">Min Fields Filled</label>
          <Input
            type="number"
            min={0}
            value={filterMinFields}
            onChange={(e) => setFilterMinFields(Number(e.target.value))}
            className="w-24"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold">Schema Field</label>
          <Select
            value={filterField}
            onChange={setFilterField}
            className="w-32"
          >
            <SelectItem value="">Any</SelectItem>
            {Object.keys(selectedSchema).map((f) => (
              <SelectItem key={f} value={f}>
                {f}
              </SelectItem>
            ))}
          </Select>
        </div>
        {filterField && (
          <div>
            <label className="block text-xs font-semibold">Field Value</label>
            <Select
              value={filterFieldValue}
              onChange={setFilterFieldValue}
              className="w-32"
            >
              <SelectItem value="">Any</SelectItem>
              {(uniqueFieldValues[filterField] || []).map((v) => (
                <SelectItem key={v} value={v as string}>
                  {String(v)}
                </SelectItem>
              ))}
            </Select>
          </div>
        )}
      </div>

      {/* Analytics & Visualization Placeholders */}
      <div className="space-y-2">
        <div className="font-semibold">Summary</div>
        <div>
          <span className="mr-4">Cases: {filtered.length}</span>
          <span className="mr-4">
            Avg Completion: {(avgCompletion * 100).toFixed(1)}%
          </span>
          <span>
            Pathology:{" "}
            {Object.entries(pathologyCounts)
              .map(([k, v]) => `${k}: ${v}`)
              .join(", ")}
          </span>
        </div>
        <div className="text-xs text-gray-500">
          (Charts: completion %, pathology, fields filled, heatmap, etc.)
        </div>
      </div>

      {/* Case Exploration */}
      <div>
        <div className="font-semibold mb-2">Browse Cases</div>
        <div className="overflow-x-auto">
          <table className="border mt-2 w-full text-sm">
            <thead>
              <tr>
                <th className="border px-2 py-1">Mark</th>
                <th className="border px-2 py-1">AccessionNumber</th>
                <th className="border px-2 py-1">Completion %</th>
                <th className="border px-2 py-1">Pathology</th>
                <th className="border px-2 py-1">Fields Filled</th>
                <th className="border px-2 py-1">Schema Extraction</th>
                <th className="border px-2 py-1">Report</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c, i) => (
                <tr key={i}>
                  <td className="border px-2 py-1 text-center">
                    <input
                      type="checkbox"
                      checked={markedCases.has(c.AccessionNumber)}
                      onChange={() => toggleMarkCase(c.AccessionNumber)}
                    />
                  </td>
                  <td className="border px-2 py-1">{c.AccessionNumber}</td>
                  <td className="border px-2 py-1">
                    {Math.round((c["Completion %"] || 0) * 100)}%
                  </td>
                  <td className="border px-2 py-1">{c["Pathology Presence"]}</td>
                  <td className="border px-2 py-1">{c["Fields Filled"]}</td>
                  <td className="border px-2 py-1">
                    <pre className="whitespace-pre-wrap text-xs">
                      {JSON.stringify(c.parsedSchema, null, 1)}
                    </pre>
                  </td>
                  <td className="border px-2 py-1">
                    <details>
                      <summary>Show</summary>
                      <div className="max-w-xs whitespace-pre-wrap text-xs">
                        {c.ContentText}
                      </div>
                    </details>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <p className="text-gray-500 mt-2">No cases match the filters.</p>
          )}
        </div>
      </div>

      {/* Marked Cases Analysis */}
      <div>
        <div className="font-semibold mb-2">Marked Cases Summary</div>
        <div>
          Marked: {marked.length} | Avg Completion: {(markedAvgCompletion * 100).toFixed(1)}%
        </div>
        <div>
          Pathology:{" "}
          {marked.reduce((acc, c) => {
            const p = c["Pathology Presence"] || "Unknown";
            acc[p] = (acc[p] || 0) + 1;
            return acc;
          }, {} as Record<string, number>) &&
            Object.entries(
              marked.reduce((acc, c) => {
                const p = c["Pathology Presence"] || "Unknown";
                acc[p] = (acc[p] || 0) + 1;
                return acc;
              }, {} as Record<string, number>)
            )
              .map(([k, v]) => `${k}: ${v}`)
              .join(", ")}
        </div>
        <div className="mt-2">
          <div className="font-semibold text-xs mb-1">Field-by-field Analysis</div>
          <table className="border w-full text-xs">
            <thead>
              <tr>
                <th className="border px-2 py-1">Field</th>
                <th className="border px-2 py-1">Filled</th>
                <th className="border px-2 py-1">Common Values</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(markedFieldStats).map(([field, stat]) => (
                <tr key={field}>
                  <td className="border px-2 py-1">{field}</td>
                  <td className="border px-2 py-1">{stat.filled}</td>
                  <td className="border px-2 py-1">
                    {Object.entries(stat.values)
                      .sort((a, b) => b[1] - a[1])
                      .map(([val, count]) => `${val} (${count})`)
                      .join(", ")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {Object.keys(markedFieldStats).length === 0 && (
            <p className="text-gray-500 mt-2">No marked cases for analysis.</p>
          )}
        </div>
        <div className="mt-4">
          <Button
            onClick={() => onExportMarked(marked)}
            disabled={marked.length === 0}
          >
            Export Marked Reports
          </Button>
        </div>
      </div>
    </div>
  );
}