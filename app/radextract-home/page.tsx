'use client'

import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/Card'
import { Button } from '@/components/Button'
import { Input } from '@/components/Input'
import { Select, SelectItem } from '@/components/Select'
import { Upload, Key, Brain, Search, Download, MessageCircle } from 'lucide-react'
import UploadExcel from "@/components/UploadFile";
import SchemaEditor, { Schema } from "@/components/SchemaEditor";
import SchemaHelperChatbot from "@/components/SchemaHelperChatbot";
import Analyze from "@/components/Analyze";
import { UploadedFile } from "@/components/Analyze";
import Process from "@/components/Process";
import ExportMarked from "@/components/ExportMarked";


interface CaseData {
  AccessionNumber: string
  ContentText: string
  Deidentified?: string
  'Pathology Presence'?: string
  'Schema Extraction'?: string
  'Raw Extraction'?: string
  'Fields Filled'?: number
  'Total Fields'?: number
  'Completion %'?: number
  __filename?: string
  [key: string]: any
}

const WORKFLOW_STEPS = [
  { id: 'setup', icon: Key, label: 'Schema', description: 'Edit extraction schema' },
  { id: 'data', icon: Upload, label: 'Data', description: 'Upload and prepare data' },
  { id: 'process', icon: Brain, label: 'Compare', description: 'Compare original and de-identified reports' },
  { id: 'analyze', icon: Search, label: 'Analyze', description: 'Review and analyze results' },
  { id: 'export', icon: Download, label: 'Export', description: 'Download extracted data' }
]

export default function RadExtractPage() {
  const [uploadedData, setUploadedData] = useState<CaseData[]>([])
  const [lastFileName, setLastFileName] = useState<string>("")
  const [deidentifiedData, setDeidentifiedData] = useState<CaseData[]>([])
  const [deidFileName, setDeidFileName] = useState<string>("")
  const [selectedSchema, setSelectedSchema] = useState<Schema>({});
  const [availableSchemas, setAvailableSchemas] = useState<string[]>([])
  const [schemasByName, setSchemasByName] = useState<{ [name: string]: Schema }>({});
  const [markedCases, setMarkedCases] = useState<CaseData[]>([])

  const [currentTab, setCurrentTab] = useState(WORKFLOW_STEPS[0].id)
  const [filters, setFilters] = useState({
    pathology: 'All',
    minCompletion: 70,
    minFields: 0
  })

  const [deidLoading, setDeidLoading] = useState(false);
  const [deidError, setDeidError] = useState<string | null>(null);

  // Chatbot popup state
  const [showChatbot, setShowChatbot] = useState(false);

  useEffect(() => {
    loadSchemas()
    // eslint-disable-next-line
  }, [])

  const loadSchemas = async () => {
    try {
      const response = await fetch('/api/schemas')
      if (response.ok) {
        const data = await response.json()
        
        // ✅ Normalize the response to always be an array of strings
        let schemaNames: string[] = [];
        
        if (Array.isArray(data)) {
          schemaNames = data.map(item => {
            if (typeof item === "string") {
              return item;
            } else if (item && typeof item === "object" && typeof item.name === "string") {
              return item.name;
            }
            return null;
          }).filter((name): name is string => {
            return typeof name === "string" && name.trim().length > 0;
          });
        }
        
        console.log("✅ Loaded schema names:", schemaNames);
        setAvailableSchemas(schemaNames)

        // Fetch each schema's content
        const schemaEntries = await Promise.all(
          schemaNames.map(async (name: string) => {
            try {
              const res = await fetch(`/api/schemas?name=${encodeURIComponent(name)}`);
              if (res.ok) {
                const schema = await res.json();
                return [name, schema];
              }
            } catch (err) {
              console.error(`Failed to load schema ${name}:`, err);
            }
            return [name, {}];
          })
        );
        setSchemasByName(Object.fromEntries(schemaEntries));
      }
    } catch (error) {
      console.error('Failed to load schemas:', error)
    }
  }

  // Called after successful upload
  const handleUploadSuccess = (cases: any[], fileName: string) => {
    setUploadedData(cases)
    setLastFileName(fileName)
    setDeidentifiedData([])
    setDeidFileName("")
    setCurrentTab('data')
  }

  const handleDeidentify = async () => {
    setDeidLoading(true);
    setDeidError(null);
    try {
      const res = await fetch("/api/deidentify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cases: uploadedData }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Unknown error");
      // Assign a new filename for the de-identified file
      const deidFile = lastFileName
        ? lastFileName.replace(/(\.[^.]+)?$/, "_deidentified$1")
        : "deidentified_reports.xlsx";
      const deidCases = (data.cases || []).map((c: CaseData) => ({
        ...c,
        __filename: deidFile,
      }));
      setDeidentifiedData(deidCases);
      setDeidFileName(deidFile);
      setCurrentTab('process');
    } catch (err: any) {
      setDeidError(err.message || "Failed to de-identify reports.");
    } finally {
      setDeidLoading(false);
    }
  };

  // Helper function to convert CaseData[] to UploadedFile[]
  function mapCaseDataToUploadedFiles(cases: CaseData[]): UploadedFile[] {
    return cases.map(c => ({
      ...c, // keep all existing CaseData fields
      name: c.__filename || "deidentified_reports.xlsx", // required
      blobUrl: `/api/files/blob?name=${encodeURIComponent(c.__filename || "deidentified_reports.xlsx")}`, // required
      size: 0, // placeholder size if unknown
      uploadedAt: new Date().toISOString(), // current timestamp
    }));
  }


  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <div className="bg-primary text-primary-foreground p-8 shadow-lg mb-8">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-4xl font-bold mb-2">RadExtract</h1>
          <p className="text-primary/90 text-lg text-white">Intelligent Radiology Report Analysis</p>
        </div>
      </div>

      {/* Workflow Steps (progress indicator) */}
      <div className="max-w-7xl mx-auto px-4 mb-8">
        <div className="flex justify-center space-x-4">
          {WORKFLOW_STEPS.map((step) => {
            const StepIcon = step.icon
            const isActive = currentTab === step.id
            // Determine if tab is accessible (not disabled)
            const isDisabled =
              (step.id === 'process' && (uploadedData.length === 0 || deidentifiedData.length === 0)) ||
              (step.id === 'analyze' && deidentifiedData.length === 0) ||
              (step.id === 'export' && markedCases.length === 0);

            return (
              <button
                key={step.id}
                className={`
                  flex items-center px-4 py-2 rounded-lg transition-colors
                  ${isActive ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}
                  focus:outline-none
                  ${!isDisabled ? 'hover:cursor-pointer hover:ring-2 hover:ring-primary/50' : 'cursor-not-allowed opacity-60'}
                  group
                `}
                onClick={() => !isDisabled && setCurrentTab(step.id)}
                disabled={isDisabled}
                type="button"
              >
                <StepIcon className="w-5 h-5 mr-2" />
                <span className="font-medium">{step.label}</span>
              </button>
            )
          })}
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Sidebar: Only filters/settings, not step content */}
          <div className="lg:col-span-1 space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Filters</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <Select
                  value={filters.pathology}
                  onChange={(value: string) => setFilters({ ...filters, pathology: value })}
                >
                  <SelectItem value="All">All</SelectItem>
                  <SelectItem value="Yes">Yes</SelectItem>
                  <SelectItem value="No">No</SelectItem>
                </Select>
                <div>
                  <label className="block text-sm font-medium">Min Completion %</label>
                  <Input
                    type="number"
                    value={filters.minCompletion}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      setFilters({ ...filters, minCompletion: Number(e.target.value) })
                    }
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium">Min Fields Filled</label>
                  <Input
                    type="number"
                    value={filters.minFields}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      setFilters({ ...filters, minFields: Number(e.target.value) })
                    }
                  />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Main Content: Only render the current step's content */}
          <div className="lg:col-span-3 space-y-6">
            {currentTab === 'setup' && (
              <div className="flex flex-col gap-6">
                <SchemaEditor
                  schema={selectedSchema}
                  setSchema={setSelectedSchema}
                />
              </div>
            )}

            {currentTab === 'data' && (
              <div className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Upload Excel File</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <UploadExcel onUploadSuccess={handleUploadSuccess} />
                  </CardContent>
                </Card>
                <div className="flex justify-end">
                  <Button
                    className="mt-4"
                    disabled={uploadedData.length === 0}
                    onClick={handleDeidentify}
                  >
                    {deidLoading ? "De-identifying..." : "De-identify Reports"}
                  </Button>
                  {deidError && (
                    <div className="text-red-600 mt-2">{deidError}</div>
                  )}
                </div>
              </div>
            )}

            {currentTab === 'process' && (
              <Card>
                <CardHeader>
                  <CardTitle>Compare Original and De-identified Reports</CardTitle>
                </CardHeader>
                <CardContent>
                  <Process
                    uploadedData={deidentifiedData}
                    selectedFileName={deidFileName}
                  />
                  <div className="mt-6 flex justify-end">
                    <Button onClick={() => setCurrentTab("data")}>Back to Upload</Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {currentTab === 'analyze' && (
              <Card>
                <CardHeader>
                  <CardTitle>Analyze Results</CardTitle>
                </CardHeader>
                <CardContent>
                  <Analyze
                    uploadedData={mapCaseDataToUploadedFiles(deidentifiedData)}
                    lastFileName={deidFileName}
                    availableSchemas={availableSchemas.map(name => {
                      // ✅ Extra safety: ensure name is a string
                      const schemaName = typeof name === 'string' ? name : String(name);
                      return {
                        name: schemaName,
                        schema: schemasByName[schemaName] || {},
                        blobUrl: `/api/schemas/blob?name=${encodeURIComponent(schemaName)}`
                      };
                    })}
                    onProcessed={() => {}}
                    onExportMarked={(cases) => {
                      setMarkedCases(cases);
                      setCurrentTab("export");
                    }}
                  />
                </CardContent>
              </Card>
            )}

            {currentTab === 'export' && (
              <Card>
                <CardHeader>
                  <CardTitle>Export Results</CardTitle>
                </CardHeader>
                <CardContent>
                  <ExportMarked markedCases={markedCases} />
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>

      {/* Floating Chatbot Button */}
      <button
        className="fixed bottom-6 right-6 z-50 bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-lg p-4 flex items-center justify-center"
        onClick={() => setShowChatbot(true)}
        aria-label="Open Schema Helper Chatbot"
        style={{ boxShadow: "0 4px 16px rgba(0,0,0,0.15)" }}
      >
        <MessageCircle className="w-6 h-6" />
      </button>

      {/* Chatbot Popup/Modal */}
      {showChatbot && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-end md:justify-end bg-black/30">
          <div className="bg-white rounded-t-2xl md:rounded-2xl shadow-2xl w-full md:w-[400px] max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b">
              <span className="font-semibold text-lg">Schema Helper</span>
              <button
                className="text-gray-500 hover:text-gray-700"
                onClick={() => setShowChatbot(false)}
                aria-label="Close"
              >
                <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-2">
              <SchemaHelperChatbot
                onSchemaSuggested={setSelectedSchema}
                onSchemaAppended={setSelectedSchema}
                currentSchema={selectedSchema}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}