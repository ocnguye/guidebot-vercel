"use client";

import { useRef, useState } from "react";

interface UploadExcelProps {
  onUploadSuccess?: (cases: any[], fileName: string) => void;
}

export default function UploadExcel({ onUploadSuccess }: UploadExcelProps) {
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState("");
  const [cases, setCases] = useState<any[]>([]);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;

    setStatus("📤 Uploading file...");
    setCases([]);
    setDownloadUrl(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        setStatus(`❌ Upload failed: ${data?.error || res.status}`);
        return;
      }

      const casesWithFilename = (data.cases || []).map((c: any) => ({
        ...c,
        __filename: file.name,
      }));

      setStatus("✅ File uploaded and processed!");
      setCases(casesWithFilename);
      setDownloadUrl(data.fileUrl);

      if (onUploadSuccess) onUploadSuccess(casesWithFilename, file.name);
    } catch (err: any) {
      console.error(err);
      setStatus(`❌ Unexpected error: ${err.message || err}`);
    }
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) setFile(e.dataTransfer.files[0]);
  }

  function handleDragOver(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragActive(true);
  }

  function handleDragLeave(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragActive(false);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files && e.target.files[0]) setFile(e.target.files[0]);
  }

  return (
    <div className="flex justify-center items-center min-h-[300px]">
      <div className="p-4 border rounded-lg shadow-md max-w-lg w-full">
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div
            className={`flex flex-col items-center justify-center border-2 border-dashed rounded-lg p-6 cursor-pointer transition-colors ${
              dragActive ? "border-blue-500 bg-blue-50" : "border-gray-300"
            }`}
            onClick={() => inputRef.current?.click()}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
          >
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={handleFileChange}
            />
            <span className="text-gray-600 mb-2">
              Drag & drop your Excel or CSV file here, or{" "}
              <span className="underline text-blue-600">click to select</span>
            </span>
            <span className="text-xs text-gray-400">Accepted: .xlsx, .xls, .csv</span>
            {file && (
              <span className="mt-2 text-sm text-gray-700 font-medium">
                Selected: {file.name}
              </span>
            )}
          </div>
          <button
            type="submit"
            className="bg-blue-600 text-white py-2 px-4 rounded hover:bg-blue-700 disabled:opacity-50"
            disabled={!file}
          >
            Upload File
          </button>
        </form>

        <p className="mt-2">{status}</p>

        {downloadUrl && (
          <p className="mt-2">
            📂 File saved at:{" "}
            <a
              href={downloadUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 underline"
            >
              {downloadUrl}
            </a>
          </p>
        )}

        {cases.length > 0 && (
          <div className="mt-4">
            <h2 className="font-semibold">📊 Preview ({cases.length} rows)</h2>
            <table className="border mt-2 w-full text-sm">
              <thead>
                <tr>
                  <th className="border px-2 py-1">AccessionNumber</th>
                  <th className="border px-2 py-1">ContentText</th>
                </tr>
              </thead>
              <tbody>
                {cases.slice(0, 5).map((c, i) => (
                  <tr key={i}>
                    <td className="border px-2 py-1">{c.AccessionNumber}</td>
                    <td className="border px-2 py-1 truncate max-w-xs">{c.ContentText}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {cases.length > 5 && <p className="text-gray-500">...and more</p>}
          </div>
        )}
      </div>
    </div>
  );
}
