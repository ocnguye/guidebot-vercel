'use client'

import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/Card'
import { Button } from '@/components/Button'
import { Input } from '@/components/Input'
import { Textarea } from '@/components/TextArea'
import { Select, SelectItem} from '@/components/Select'
import { Tabs, TabsContent, TabsTrigger } from '@/components/Tabs'
import { Badge } from '@/components/Badge'
import { Alert, AlertDescription } from '@/components/Alert'
import { Progress } from '@/components/Progress'
import { Upload, Key, Brain, Search, Download } from 'lucide-react'

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

interface SchemaField {
  [key: string]: string
}

interface ProcessingState {
  isProcessing: boolean
  currentStep: string
  progress: number
  processedCount: number
  totalCount: number
}

const WORKFLOW_STEPS = [
  { id: 'setup', icon: Key, label: 'Setup', description: 'Configure API key and model' },
  { id: 'data', icon: Upload, label: 'Data', description: 'Upload and prepare data' },
  { id: 'process', icon: Brain, label: 'Process', description: 'Extract schema features' },
  { id: 'analyze', icon: Search, label: 'Analyze', description: 'Filter and review cases' },
  { id: 'export', icon: Download, label: 'Export', description: 'Save results' }
]

export function FileUpload({ onFileChange }: { onFileChange: (file: File) => void }) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const handleFileInput = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      onFileChange(file);
    }
  };

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium">Upload Excel File</label>

      {/* Hidden input */}
      <input
        type="file"
        accept=".xlsx,.xls"
        id="fileUpload"
        className="hidden"
        onChange={handleFileInput}
      />

      {/* Button triggers file input */}
      <Button
        onClick={() => document.getElementById("fileUpload")?.click()}
        className="w-full flex items-center justify-center"
      >
        <Upload className="w-4 h-4 mr-2" />
        {selectedFile ? selectedFile.name : "Choose File"}
      </Button>

      <p className="text-sm text-gray-500">
        File must contain 'ContentText' and 'AccessionNumber' columns
      </p>
    </div>
  );
}

export default function RadExtractPage() {
  const [apiKey, setApiKey] = useState('')
  const [selectedModel, setSelectedModel] = useState('gpt-4')
  const [apiVerified, setApiVerified] = useState(false)
  const [availableModels, setAvailableModels] = useState<string[]>(['gpt-4', 'gpt-3.5-turbo'])
  
  const [uploadedData, setUploadedData] = useState<CaseData[]>([])
  const [processedData, setProcessedData] = useState<CaseData[]>([])
  const [selectedSchema, setSelectedSchema] = useState<SchemaField>({})
  const [availableSchemas, setAvailableSchemas] = useState<string[]>([])
  const [markedCases, setMarkedCases] = useState<Set<string>>(new Set())
  
  const [currentTab, setCurrentTab] = useState('upload')
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
        
        await fetch('/api/settings/api-key', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ apiKey })
        })
      } else {
        throw new Error('Invalid API key')
      }
    } catch (error) {
      console.error('API key verification failed:', error)
      alert('Invalid API key. Please check and try again.')
    }
  }

  const handleFileUpload = async (file: File) => {
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData
      });

      if (response.ok) {
        const data = await response.json();
        setUploadedData(data.cases);
        setCurrentTab('process');
      } else {
        throw new Error('Upload failed');
      }
    } catch (error) {
      console.error('Upload failed:', error);
      alert('Failed to upload file. Please check the format and try again.');
    }
  };

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

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <div className="bg-primary text-primary-foreground p-8 shadow-lg mb-8">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-4xl font-bold mb-2">RadExtract</h1>
          <p className="text-primary/90 text-lg text-white">Intelligent Radiology Report Analysis</p>
        </div>
      </div>

      {/* Workflow Steps */}
      <div className="max-w-7xl mx-auto px-4 mb-8">
        <div className="flex justify-center space-x-4">
          {WORKFLOW_STEPS.map((step, index) => {
            const StepIcon = step.icon
            const currentStep = getCurrentStep()
            const isActive = step.id === currentStep
            const isComplete = WORKFLOW_STEPS.findIndex(s => s.id === currentStep) > index
            
            return (
              <div key={step.id} className={`
                flex items-center px-4 py-2 rounded-lg transition-colors
                ${isActive ? 'bg-primary text-primary-foreground' : isComplete ? 'bg-secondary text-secondary-foreground' : 'bg-muted text-muted-foreground'}
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
          {/* Sidebar */}
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

          {/* Main Content */}
          <div className="lg:col-span-3 space-y-6">
            <Tabs value={currentTab} onValueChange={setCurrentTab}>
              <div className="flex gap-2 mb-4">
                <button
                  className={`px-4 py-2 rounded ${currentTab === 'upload' ? 'bg-primary text-white' : 'bg-muted text-muted-foreground'}`}
                  onClick={() => setCurrentTab('upload')}
                >
                  Upload
                </button>
                <button
                  className={`px-4 py-2 rounded ${currentTab === 'process' ? 'bg-primary text-white' : 'bg-muted text-muted-foreground'}`}
                  onClick={() => setCurrentTab('process')}
                >
                  Process
                </button>
                <button
                  className={`px-4 py-2 rounded ${currentTab === 'analyze' ? 'bg-primary text-white' : 'bg-muted text-muted-foreground'}`}
                  onClick={() => setCurrentTab('analyze')}
                >
                  Analyze
                </button>
                <button
                  className={`px-4 py-2 rounded ${currentTab === 'export' ? 'bg-primary text-white' : 'bg-muted text-muted-foreground'}`}
                  onClick={() => setCurrentTab('export')}
                >
                  Export
                </button>
              </div>

              {currentTab === 'upload' && (
                <div>
                  <FileUpload onFileChange={handleFileUpload} />
                </div>
              )}
              {currentTab === 'process' && (
                <div>
                  {processingState.isProcessing ? (
                    <>
                      <Progress value={processingState.progress} />
                      <p className="mt-2 text-sm">
                        {processingState.processedCount}/{processingState.totalCount} processed
                      </p>
                    </>
                  ) : (
                    <Alert>
                      <AlertDescription>Processing not started yet</AlertDescription>
                    </Alert>
                  )}
                </div>
              )}
              {currentTab === 'analyze' && (
                <div>
                  {getFilteredData().map((c) => (
                    <div
                      key={c.AccessionNumber}
                      className={`p-2 rounded-lg border cursor-pointer flex justify-between items-center
                      ${markedCases.has(c.AccessionNumber) ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}
                      onClick={() => toggleMarkCase(c.AccessionNumber)}
                    >
                      <span>{c.AccessionNumber}</span>
                      <Badge variant="secondary">{Math.round((c['Completion %'] || 0) * 100)}%</Badge>
                    </div>
                  ))}
                </div>
              )}
              {currentTab === 'export' && (
                <div>
                  <Button className="w-full" onClick={exportResults} disabled={markedCases.size === 0}>
                    Download Selected Cases
                  </Button>
                </div>
              )}
            </Tabs>
          </div>
        </div>
      </div>
    </div>
  )
}
