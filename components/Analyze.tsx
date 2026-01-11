"use client";

import React, { useState, useMemo, useEffect } from "react";
import { Button } from "@/components/Button";
import { Select, SelectItem } from "@/components/Select";
import { Input } from "@/components/Input";

interface UploadedFile {
  name: string;
  blobUrl: string;
  size: number;
  uploadedAt: string;
  __filename?: string;
}

interface SchemaField {
  options?: string[];
  type?: string;
  [key: string]: any;
}

interface SchemaBlob {
  name: string;
  blobUrl: string;
}

interface AnalyzeProps {
  uploadedData: UploadedFile[];
  lastFileName?: string;
  availableSchemas: SchemaBlob[];
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
  /* ---------------- Normalization (CRITICAL FIX) ---------------- */

  const normalizedSchemas = useMemo<SchemaBlob[]>(() => {
    return availableSchemas
      .map((s: any) => {
        // Correct blob shape
        if (typeof s?.name === "string" && typeof s?.blobUrl === "string") {
          return { name: s.name, blobUrl: s.blobUrl };
        }

        // Double-wrapped blob object (buggy upstream case)
        if (
          typeof s?.name === "object" &&
          typeof s.name?.name === "string" &&
          typeof s.name?.blobUrl === "string"
        ) {
          return { name: s.name.name, blobUrl: s.name.blobUrl };
        }

        return null;
      })
      .filter(Boolean) as SchemaBlob[];
  }, [availableSchemas]);

  /* ---------------- State ---------------- */

  const [selectedFileName, setSelectedFileName] = useState<string>(
    lastFileName ||
      (uploadedData.length > 0
        ? uploadedData[uploadedData.length - 1].__filename ||
          uploadedData[uploadedData.length - 1].name
        : "")
  );

  const [selectedSchemaName, setSelectedSchemaName] = useState<string>(
    normalizedSchemas[0]?.name || ""
  );

  const [selectedSchemaObj, setSelectedSchemaObj] =
    useState<Record<string, SchemaField>>({});

  const [processing, setProcessing] = useState(false);
  const [processedData, setProcessedData] = useState<any[]>([]);
  const [markedCases, setMarkedCases] = useState<Set<string>>(new Set());
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Filtering state
  const [filterPathology, setFilterPathology] = useState("All");
  const [filterMinCompletion, setFilterMinCompletion] = useState(0.7);
  const [filterMinFields, setFilterMinFields] = useState(0);
  const [fieldFilters, setFieldFilters] = useState<{ [field: string]: string }>(
    {}
  );

  /* ---------------- Effects ---------------- */

  useEffect(() => {
    if (lastFileName) {
      setSelectedFileName(lastFileName);
    } else if (uploadedData.length > 0) {
      setSelectedFileName(
        uploadedData[uploadedData.length - 1].__filename ||
          uploadedData[uploadedData.length - 1].name
      );
    }
  }, [lastFileName, uploadedData]);

  // Fetch selected schema JSON from blob
  useEffect(() => {
    if (!selectedSchemaName) {
      setSelectedSchemaObj({});
      return;
    }

    const schemaBlob = normalizedSchemas.find(
      (s) => s.name === selectedSchemaName
    );

    if (!schemaBlob) {
      setSelectedSchemaObj({});
      return;
    }

    (async () => {
      try {
        const res = await fetch(schemaBlob.blobUrl);
        if (!res.ok) {
          console.warn(
            "Failed to fetch schema blob",
            schemaBlob.name,
            res.status
          );
          setSelectedSchemaObj({});
          return;
        }

        const json = await res.json();
        setSelectedSchemaObj(json.schema ?? json ?? {});
      } catch (err) {
        console.error("Error fetching schema blob", err);
        setSelectedSchemaObj({});
      }
    })();
  }, [selectedSchemaName, normalizedSchemas]);

  /* ---------------- Derived Data ---------------- */

  const parsedProcessedData = useMemo(() => {
    return processedData.map((row) => {
      let parsed: Record<string, any> = {};
      try {
        parsed = JSON.parse(row["Schema Extraction"] || "{}");
      } catch {}
      return { ...row, parsedSchema: parsed };
    });
  }, [processedData]);

  const uniqueFieldValues = useMemo(() => {
    const values: Record<string, Set<any>> = {};
    parsedProcessedData.forEach((row) => {
      Object.entries(row.parsedSchema || {}).forEach(([k, v]) => {
        if (!values[k]) values[k] = new Set();
        if (Array.isArray(v)) v.forEach((item) => values[k].add(item));
        else values[k].add(v);
      });
    });
    return Object.fromEntries(
      Object.entries(values).map(([k, v]) => [k, Array.from(v)])
    );
  }, [parsedProcessedData]);

  const fileData = useMemo(() => {
    if (!selectedFileName) return uploadedData;
    return uploadedData.filter(
      (d) => (d.__filename || d.name) === selectedFileName
    );
  }, [uploadedData, selectedFileName]);

  const filtered = useMemo(() => {
    return parsedProcessedData.filter((c) => {
      const completionMatch =
        (c["Completion %"] || 0) >= filterMinCompletion;
      const fieldsMatch = (c["Fields Filled"] || 0) >= filterMinFields;
      const pathologyMatch =
        filterPathology === "All" ||
        c["Pathology Presence"] === filterPathology;

      const fieldMatches = Object.entries(fieldFilters).every(
        ([field, val]) => {
          if (!val) return true;
          const v = c.parsedSchema?.[field];
          if (Array.isArray(v)) return v.includes(val);
          return v === val;
        }
      );

      return completionMatch && fieldsMatch && pathologyMatch && fieldMatches;
    });
  }, [
    parsedProcessedData,
    filterMinCompletion,
    filterMinFields,
    filterPathology,
    fieldFilters,
  ]);

  /* ---------------- Handlers ---------------- */

  const handleAnalyze = async () => {
    setProcessing(true);
    setSuccessMsg(null);

    const res = await fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        cases: fileData,
        schema: selectedSchemaObj,
      }),
    });

    const data = await res.json();
    setProcessedData(data.processed || []);
    setProcessing(false);
    onProcessed(data.processed || []);
    setSuccessMsg("✅ Reports successfully processed!");
  };

  const toggleMarkCase = (accession: string) => {
    setMarkedCases((prev) => {
      const copy = new Set(prev);
      if (copy.has(accession)) copy.delete(accession);
      else copy.add(accession);
      return copy;
    });
  };

  /* ---------------- Analytics ---------------- */

  const avgCompletion =
    filtered.reduce((sum, c) => sum + (c["Completion %"] || 0), 0) /
    (filtered.length || 1);

  const pathologyCounts = filtered.reduce((acc, c) => {
    const p = c["Pathology Presence"] || "Unknown";
    acc[p] = (acc[p] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const marked = filtered.filter((c) =>
    markedCases.has(c.AccessionNumber)
  );

  const markedAvgCompletion =
    marked.reduce((sum, c) => sum + (c["Completion %"] || 0), 0) /
    (marked.length || 1);

  const markedFieldStats = useMemo(() => {
    const stats: Record<
      string,
      { filled: number; values: Record<string, number> }
    > = {};
    marked.forEach((row) => {
      Object.entries(row.parsedSchema || {}).forEach(([k, v]) => {
        if (!stats[k]) stats[k] = { filled: 0, values: {} };
        if (v !== "" && v !== null && v !== undefined) {
          stats[k].filled += 1;
          if (Array.isArray(v)) {
            v.forEach((item) => {
              stats[k].values[item] =
                (stats[k].values[item] || 0) + 1;
            });
          } else {
            stats[k].values[String(v)] =
              (stats[k].values[String(v)] || 0) + 1;
          }
        }
      });
    });
    return stats;
  }, [marked]);

  /* ---------------- Schema Field Filters (UI UNCHANGED) ---------------- */

  const schemaFieldFilterSection = (
    <div className="mt-4 border-t pt-4">
      <div className="font-semibold mb-2">
        🎯 Filter by Extracted Fields
      </div>
      <div className="flex flex-wrap gap-4">
        {Object.entries(
          selectedSchemaObj as Record<string, SchemaField>
        ).map(([field, def]) => {
          const values = uniqueFieldValues[field] || [];
          const options =
            def?.options && Array.isArray(def.options)
              ? (def.options as string[])
              : (values as any[]);
          const filterValue = fieldFilters[field] || "";

          return (
            <div key={field} className="flex flex-col min-w-[160px]">
              <label className="text-xs font-semibold mb-1">
                {field}
              </label>
              {options.length > 0 ? (
                <Select
                  value={filterValue}
                  onChange={(val) =>
                    setFieldFilters((prev) => ({
                      ...prev,
                      [field]: val,
                    }))
                  }
                  className="w-full"
                >
                  <SelectItem value="">Any</SelectItem>
                  {options.map((opt: any) => (
                    <SelectItem
                      key={String(opt)}
                      value={String(opt)}
                    >
                      {String(opt)}
                    </SelectItem>
                  ))}
                </Select>
              ) : (
                <Input
                  value={filterValue}
                  onChange={(e) =>
                    setFieldFilters((prev) => ({
                      ...prev,
                      [field]: e.target.value,
                    }))
                  }
                  placeholder="Any"
                  className="w-full"
                />
              )}
            </div>
          );
        })}
        <div className="flex items-end">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setFieldFilters({})}
          >
            Clear Field Filters
          </Button>
        </div>
      </div>
    </div>
  );

  // --- Render ---
return (
  <div className="space-y-8">
    {/* File & Schema Selection */}
    <div className="flex flex-col md:flex-row gap-4 items-center">
      <div>
        <label className="block font-medium mb-1">Schema File</label>
        <Select
          value={selectedFileName}
          onChange={setSelectedFileName}
          className="min-w-[200px]"
        >
          {uploadedData.map((file) => {
            const fileName = file.__filename || file.name;
            return (
              <SelectItem key={fileName} value={fileName}>
                {fileName}
              </SelectItem>
            );
          })}
        </Select>
      </div>

      <div>
        <label className="block font-medium mb-1">Schema</label>
        <Select
          value={selectedSchemaName}
          onChange={setSelectedSchemaName}
          className="min-w-[200px]"
        >
          {normalizedSchemas.map((s) => (
            <SelectItem key={s.name} value={s.name}>
              {s.name.replace("schemas/", "").replace(".json", "")}
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

    {/* Success message */}
    {successMsg && (
      <div className="text-green-700 font-medium mt-2">
        {successMsg}
      </div>
    )}

    {/* Filtering controls */}
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
        <label className="block text-xs font-semibold">
          Min Completion %
        </label>
        <Input
          type="number"
          min={0}
          max={1}
          step={0.01}
          value={filterMinCompletion}
          onChange={(e) =>
            setFilterMinCompletion(Number(e.target.value))
          }
          className="w-24"
        />
      </div>

      <div>
        <label className="block text-xs font-semibold">
          Min Fields Filled
        </label>
        <Input
          type="number"
          min={0}
          value={filterMinFields}
          onChange={(e) =>
            setFilterMinFields(Number(e.target.value))
          }
          className="w-24"
        />
      </div>
    </div>

    {/* Advanced Schema Field Filters */}
    {schemaFieldFilterSection}

    {/* Analytics & Summary */}
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
                    onChange={() =>
                      toggleMarkCase(c.AccessionNumber)
                    }
                  />
                </td>
                <td className="border px-2 py-1">
                  {c.AccessionNumber}
                </td>
                <td className="border px-2 py-1">
                  {Math.round((c["Completion %"] || 0) * 100)}%
                </td>
                <td className="border px-2 py-1">
                  {c["Pathology Presence"]}
                </td>
                <td className="border px-2 py-1">
                  {c["Fields Filled"]}
                </td>
                <td className="border px-2 py-1">
                  <pre className="whitespace-pre-wrap text-xs">
                    {JSON.stringify(c.parsedSchema, null, 1)}
                  </pre>
                </td>
                <td className="border px-2 py-1">
                  <details>
                    <summary>Show</summary>
                    <div className="max-w-xs whitespace-pre-wrap text-xs">
                      {c.Deidentified || (
                        <span className="italic text-gray-400">
                          Not de-identified
                        </span>
                      )}
                    </div>
                  </details>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {filtered.length === 0 && (
          <p className="text-gray-500 mt-2">
            No cases match the filters.
          </p>
        )}
      </div>
    </div>

    {/* Marked Cases Analysis */}
    <div>
      <div className="font-semibold mb-2">
        Marked Cases Summary
      </div>
      <div>
        Marked: {marked.length} | Avg Completion:{" "}
        {(markedAvgCompletion * 100).toFixed(1)}%
      </div>

      <div>
        Pathology:{" "}
        {Object.entries(
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
        <div className="font-semibold text-xs mb-1">
          Field-by-field Analysis
        </div>
        <table className="border w-full text-xs">
          <thead>
            <tr>
              <th className="border px-2 py-1">Field</th>
              <th className="border px-2 py-1">Filled</th>
              <th className="border px-2 py-1">Common Values</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(markedFieldStats).map(
              ([field, stat]) => (
                <tr key={field}>
                  <td className="border px-2 py-1">
                    {field}
                  </td>
                  <td className="border px-2 py-1">
                    {stat.filled}
                  </td>
                  <td className="border px-2 py-1">
                    {Object.entries(stat.values)
                      .sort((a, b) => b[1] - a[1])
                      .map(
                        ([val, count]) =>
                          `${val} (${count})`
                      )
                      .join(", ")}
                  </td>
                </tr>
              )
            )}
          </tbody>
        </table>

        {Object.keys(markedFieldStats).length === 0 && (
          <p className="text-gray-500 mt-2">
            No marked cases for analysis.
          </p>
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