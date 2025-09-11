import fs from "fs";
import path from "path";
import { pipeline, env } from '@huggingface/transformers';
import cosineSimilarity from "cosine-similarity";

// Configure transformers environment properly
env.allowRemoteModels = true;
env.allowLocalModels = false;
env.cacheDir = './.cache/transformers';

// Type definitions
interface ParsedReport {
  ContentText?: string;
  text?: string;
  [key: string]: any;
}

interface ScoredReport extends Report {
  score: number;
}

interface TensorOutput {
  dims: number[];
  type: string;
  data: Float32Array;
  size: number;
}

// Set up Hugging Face authentication
const setupHFAuth = (): boolean => {
  const token: string | undefined = process.env.GUIDEBOT_TOKEN;
  
  if (!token) {
    console.warn("No Hugging Face token found. Model loading may fail.");
    return false;
  }


  // Override fetch to add proper authorization headers
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url: RequestInfo | URL, options: RequestInit = {}): Promise<Response> => {
    if (typeof url === 'string' && url.includes('huggingface.co')) {
      const headers = new Headers(options.headers);
      headers.set('Authorization', `Bearer ${token}`);
      headers.set('User-Agent', 'transformers.js');
      options.headers = headers;
      
      console.log(`Authenticated request to: ${url}`);
    }
    return originalFetch(url, options);
  };
  
  console.log("Hugging Face authentication configured");
  return true;
};

export interface Report {
  id: number;
  text: string;
  embedding: number[];
}

let reports: Report[] = [];
let embeddingsModel: any = null;
let isLoaded: boolean = false;

/**
 * Load reports from JSONL and generate embeddings using proper transformers API
 */
export const loadReports = async (): Promise<void> => {
  if (isLoaded) {
    console.log("Reports already loaded");
    return;
  }

  try {
    // Setup authentication
    const hasToken: boolean = setupHFAuth();
    if (!hasToken) {
      throw new Error("Hugging Face token is required. Please set GUIDEBOT_TOKEN in your .env.local file");
    }

    // Load the JSONL file
    const filePath: string = path.join(process.cwd(), "IRReports_DEID.jsonl");
    
    if (!fs.existsSync(filePath)) {
      throw new Error(`Reports file not found: ${filePath}`);
    }

    console.log(`Loading reports from: ${filePath}`);
    const lines: string[] = fs.readFileSync(filePath, "utf-8").split("\n").filter(Boolean);

    reports = lines
      .map((line: string, index: number): Report | null => {
        try {
          const obj: ParsedReport = JSON.parse(line);
          const text: string = obj.ContentText || obj.text || "";
          if (!text.trim()) return null;
          
          return { 
            id: index, 
            text: text.trim(), 
            embedding: [] 
          };
        } catch (err: any) {
          console.error(`Failed to parse line ${index}:`, err.message);
          return null;
        }
      })
      .filter((report): report is Report => report !== null);

    console.log(`Loaded ${reports.length} reports from file`);

    // Initialize embedding model using correct API
    console.log("Initializing embeddings model...");
    
    try {
      embeddingsModel = await pipeline(
        'feature-extraction', 
        'Xenova/all-MiniLM-L6-v2'
      );
      
      console.log("Embeddings model loaded successfully");
    } catch (modelError: any) {
      console.error("Failed to load embeddings model:", modelError);
      throw new Error(`Embeddings model loading failed: ${modelError.message}`);
    }

    // Generate embeddings for each report using batch processing
    console.log("Generating embeddings for all reports...");
    
    const batchSize: number = 10; // Process in batches to avoid memory issues
    let processed: number = 0;
    
    for (let i = 0; i < reports.length; i += batchSize) {
      const batch: Report[] = reports.slice(i, i + batchSize);
      
      try {
        // Prepare batch of sentences
        const sentences: string[] = batch.map(report => report.text);
        
        // Get embeddings for the entire batch
        const batchEmbeddings: TensorOutput = await embeddingsModel(sentences, {
          pooling: 'mean',
          normalize: true
        });
        
        // Extract embeddings for each report in the batch
        const embeddingDim: number = batchEmbeddings.dims[1]; // Should be 384 for all-MiniLM-L6-v2
        
        for (let j = 0; j < batch.length; j++) {
          const startIdx: number = j * embeddingDim;
          const endIdx: number = startIdx + embeddingDim;
          batch[j].embedding = Array.from(batchEmbeddings.data.slice(startIdx, endIdx));
          processed++;
        }
        
        if (processed % 50 === 0 || processed === reports.length) {
          console.log(`Generated embeddings: ${processed}/${reports.length}`);
        }
        
      } catch (embError: any) {
        console.error(`Failed to generate embeddings for batch starting at ${i}:`, embError);
        // Set empty embeddings for failed batch
        for (const report of batch) {
          report.embedding = [];
        }
      }
    }

    const successfulEmbeddings: number = reports.filter((r: Report) => r.embedding.length > 0).length;
    console.log(`Successfully generated ${successfulEmbeddings}/${reports.length} embeddings`);
    
    if (successfulEmbeddings === 0) {
      throw new Error("Failed to generate any embeddings");
    }

    isLoaded = true;
    console.log("Reports loading completed successfully");

  } catch (error: any) {
    console.error("Failed to load reports:", error);
    throw error;
  }
};

/**
 * Retrieve top-k relevant reports for a query using proper embeddings API
 */
export const retrieveRelevantReports = async (query: string, topK: number = 3): Promise<Report[]> => {
  if (!isLoaded) {
    throw new Error("Reports not loaded. Call loadReports() first.");
  }

  if (!embeddingsModel) {
    throw new Error("Embeddings model not available");
  }

  try {
    console.log(`Searching for: "${query}"`);
    
    // Generate embedding for the query using correct API
    const queryEmbeddings: TensorOutput = await embeddingsModel([query], {
      pooling: 'mean',
      normalize: true
    });
    
    const queryVector: number[] = Array.from(queryEmbeddings.data);
    
    // Calculate similarity with all reports that have embeddings
    const validReports: Report[] = reports.filter((r: Report) => r.embedding.length > 0);
    
    if (validReports.length === 0) {
      throw new Error("No reports with valid embeddings found");
    }
    
    const scored: ScoredReport[] = validReports.map((r: Report): ScoredReport => {
      const similarity: number = cosineSimilarity(queryVector, r.embedding);
      return {
        ...r,
        score: similarity
      };
    });

    // Sort by similarity score (descending)
    scored.sort((a: ScoredReport, b: ScoredReport) => b.score - a.score);
    
    const topResults: ScoredReport[] = scored.slice(0, topK);
    
    console.log(`Found ${topResults.length} relevant reports with scores:`, 
      topResults.map((r: ScoredReport) => ({ id: r.id, score: r.score.toFixed(3) }))
    );
    
    return topResults;

  } catch (error: any) {
    console.error("Search failed:", error);
    throw error;
  }
};

// Helper function to check if reports are loaded
export const areReportsLoaded = (): boolean => {
  return isLoaded;
};

// Helper function to get report count
export const getReportCount = (): number => {
  return reports.length;
};

// Helper function to get embedding statistics
export const getEmbeddingStats = (): { total: number; withEmbeddings: number; embeddingDim: number } => {
  const withEmbeddings = reports.filter(r => r.embedding.length > 0);
  return {
    total: reports.length,
    withEmbeddings: withEmbeddings.length,
    embeddingDim: withEmbeddings.length > 0 ? withEmbeddings[0].embedding.length : 0
  };
};