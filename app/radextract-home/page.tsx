'use client'

import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/Card'
import { Button } from '@/components/Button'
import { Input } from '@/components/Input'
import { Select, SelectItem } from '@/components/Select'
import { Badge } from '@/components/Badge'
import { Progress } from '@/components/Progress'
import { Upload, Key, Brain, Search, Download } from 'lucide-react'
import UploadExcel from "@/components/UploadFile";
import SchemaEditor from "@/components/SchemaEditor";

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
}

// --- FIXED TYPES ---
interface SchemaField {
  type: string;
  max_points?: number;
  key_field?: boolean;
  options?: string[];
  [key: string]: any;
}

interface Schema {
  [field: string]: SchemaField;
}

interface ProcessingState {
  isProcessing: boolean
  currentStep: string
  progress: number
  processedCount: number
  totalCount: number
}

const WORKFLOW_STEPS = [
  { id: 'setup', icon: Key, label: 'Schema', description: 'Edit extraction schema' },
  { id: 'data', icon: Upload, label: 'Data', description: 'Upload and prepare data' },
  { id: 'process', icon: Brain, label: 'Process', description: 'Run AI extraction' },
  { id: 'analyze', icon: Search, label: 'Analyze', description: 'Review and analyze results' },
  { id: 'export', icon: Download, label: 'Export', description: 'Download extracted data' }
]

export default function RadExtractPage() {
  const [apiKey, setApiKey] = useState('')
  const [selectedModel, setSelectedModel] = useState('gpt-4')
  const [apiVerified, setApiVerified] = useState(false)
  const [availableModels, setAvailableModels] = useState<string[]>(['gpt-4', 'gpt-3.5-turbo'])

  const [uploadedData, setUploadedData] = useState<CaseData[]>([])
  const [processedData, setProcessedData] = useState<CaseData[]>([])
  // --- FIXED STATE TYPE ---
  const [selectedSchema, setSelectedSchema] = useState<Schema>({});
  const [availableSchemas, setAvailableSchemas] = useState<string[]>([])
  const [markedCases, setMarkedCases] = useState<Set<string>>(new Set())

  const [currentTab, setCurrentTab] = useState(WORKFLOW_STEPS[0].id)
  const [processingState, setProcessingState] = useState<ProcessingState>({
    isProcessing: false,
    currentStep: '',
    progress: 0,
    processedCount: 0,
    totalCount: 0
  })
  const [filters, setFilters] = useState({
    pathology: 'All',
    minCompletion: 70,
    minFields: 0
  })

  useEffect(() => {
    loadSchemas()
    loadSavedApiKey()
  }, [])

  const getCurrentStep = () => {
    if (!apiVerified) return 'setup'
    if (uploadedData.length === 0) return 'data'
    if (processedData.length === 0) return 'process'
    if (markedCases.size === 0) return 'analyze'
    return 'export'
  }

  const loadSchemas = async () => {
    try {
      const response = await fetch('/api/schemas')
      if (response.ok) {
        const schemas = await response.json()
        setAvailableSchemas(schemas)
      }
    } catch (error) {
      console.error('Failed to load schemas:', error)
    }
  }

  const loadSavedApiKey = async () => {
    try {
      const response = await fetch('/api/settings/api-key')
      if (response.ok) {
        const data = await response.json()
        if (data.apiKey) {
          setApiKey(data.apiKey)
        }
      }
    } catch (error) {
      console.error('Failed to load API key:', error)
    }
  }

  const verifyApiKey = async () => {
    if (!apiKey) return

    try {
      const response = await fetch('/api/openai/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey, model: selectedModel })
      })

      if (response.ok) {
        const data = await response.json()
        setApiVerified(true)
        setAvailableModels(data.models || ['gpt-4', 'gpt-3.5-turbo'])
        setCurrentTab('data')

        await fetch('/api/settings/api-key', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ apiKey })
        })
      } else {
        const errorText = await response.text()
        console.error("Verification failed:", response.status, errorText)
        throw new Error(`API key verification failed: ${response.status} ${errorText}`)
      }
    } catch (error) {
      console.error('API key verification failed:', error)
      alert('Invalid API key. Please check and try again.')
    }
  }

  // Called after successful upload
  const handleUploadSuccess = (cases: any[]) => {
    setUploadedData(cases)
  }

  const handleProcess = async () => {
    setProcessingState({
      isProcessing: true,
      currentStep: 'Processing',
      progress: 0,
      processedCount: 0,
      totalCount: uploadedData.length
    })

    // Dummy processing simulation
    let processed: CaseData[] = []
    for (let i = 0; i < uploadedData.length; i++) {
      // Simulate processing delay
      await new Promise(res => setTimeout(res, 50))
      processed.push({
        ...uploadedData[i],
        'Completion %': Math.random(),
        'Fields Filled': Math.floor(Math.random() * 10),
        'Total Fields': 10,
        'Pathology Presence': Math.random() > 0.5 ? 'Yes' : 'No'
      })
      setProcessingState(state => ({
        ...state,
        processedCount: i + 1,
        progress: Math.round(((i + 1) / uploadedData.length) * 100)
      }))
    }
    setProcessedData(processed)
    setProcessingState(state => ({
      ...state,
      isProcessing: false,
      progress: 100
    }))
    setCurrentTab('analyze')
  }

  const toggleMarkCase = (accessionNumber: string) => {
    const newMarked = new Set(markedCases)
    if (newMarked.has(accessionNumber)) {
      newMarked.delete(accessionNumber)
    } else {
      newMarked.add(accessionNumber)
    }
    setMarkedCases(newMarked)
  }

  const getFilteredData = () => {
    if (processedData.length === 0) return []

    return processedData.filter(c => {
      const completionMatch = (c['Completion %'] || 0) >= filters.minCompletion / 100
      const fieldsMatch = (c['Fields Filled'] || 0) >= filters.minFields
      const pathologyMatch = filters.pathology === 'All' || c['Pathology Presence'] === filters.pathology

      return completionMatch && fieldsMatch && pathologyMatch
    })
  }

  const exportResults = async () => {
    const markedData = processedData.filter(c => markedCases.has(c.AccessionNumber))

    try {
      const response = await fetch('/api/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cases: markedData,
          schema: selectedSchema
        })
      })

      if (response.ok) {
        const blob = await response.blob()
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.style.display = 'none'
        a.href = url
        a.download = `radextract_results_${new Date().toISOString().split('T')[0]}.xlsx`
        document.body.appendChild(a)
        a.click()
        window.URL.revokeObjectURL(url)
      }
    } catch (error) {
      console.error('Export failed:', error)
    }
  }

  // --- UI Render ---
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
            return (
              <div key={step.id} className={`
                flex items-center px-4 py-2 rounded-lg transition-colors
                ${isActive ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}
              `}>
                <StepIcon className="w-5 h-5 mr-2" />
                <span className="font-medium">{step.label}</span>
              </div>
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
                <CardTitle>API Settings</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <Input
                  placeholder="Enter API key"
                  value={apiKey}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setApiKey(e.target.value)}
                  disabled={apiVerified}
                />
                <Select value={selectedModel} onChange={setSelectedModel}>
                  {availableModels.map((model) => (
                    <SelectItem key={model} value={model}>
                      {model}
                    </SelectItem>
                  ))}
                </Select>
                {!apiVerified ? (
                  <Button className="w-full" onClick={verifyApiKey}>
                    Verify API Key
                  </Button>
                ) : (
                  <Badge variant="secondary">Verified</Badge>
                )}
              </CardContent>
            </Card>
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
              <SchemaEditor schema={selectedSchema} setSchema={setSelectedSchema} />
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
                    onClick={() => setCurrentTab('process')}
                  >
                    De-identify Reports
                  </Button>
                </div>
              </div>
            )}

            {currentTab === 'process' && (
              <Card>
                <CardHeader>
                  <CardTitle>Process Reports</CardTitle>
                </CardHeader>
                <CardContent>
                  {processingState.isProcessing ? (
                    <>
                      <Progress value={processingState.progress} />
                      <p className="mt-2 text-sm">
                        {processingState.processedCount}/{processingState.totalCount} processed
                      </p>
                    </>
                  ) : (
                    <Button
                      className="w-full"
                      disabled={uploadedData.length === 0}
                      onClick={handleProcess}
                    >
                      Start Processing
                    </Button>
                  )}
                </CardContent>
              </Card>
            )}

            {currentTab === 'analyze' && (
              <Card>
                <CardHeader>
                  <CardTitle>Analyze Results</CardTitle>
                </CardHeader>
                <CardContent>
                  {/* Dummy content for now */}
                  <div>Analysis UI coming soon...</div>
                </CardContent>
              </Card>
            )}

            {currentTab === 'export' && (
              <Card>
                <CardHeader>
                  <CardTitle>Export Results</CardTitle>
                </CardHeader>
                <CardContent>
                  <Button className="w-full" onClick={exportResults} disabled={markedCases.size === 0}>
                    Download Selected Cases
                  </Button>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}