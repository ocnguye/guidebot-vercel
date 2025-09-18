import fs from "fs";
import path from "path";
import { pipeline, env } from '@xenova/transformers';
import cosineSimilarity from "cosine-similarity";

// Configure transformers environment for Xenova
env.allowRemoteModels = true;
env.allowLocalModels = false;
env.cacheDir = './.cache/transformers';

// Type definitions
interface ParsedReport {
  ContentText?: string;
  text?: string;
  [key: string]: unknown;
}

interface ScoredReport extends Report {
  score: number;
}

// Xenova returns different tensor structure
interface XenovaTensor {
  data: Float32Array;
  dims: number[];
}

interface EmbeddingModel {
  (input: string | string[], options?: {
    pooling?: string;
    normalize?: boolean;
  }): Promise<XenovaTensor>;
}

export interface Report {
  id: number;
  text: string;
  embedding: number[];
}

let reports: Report[] = [];
let embeddingsModel: EmbeddingModel | null = null;
let isLoaded: boolean = false;

/**
 * Load reports from JSONL and generate embeddings using Xenova transformers
 */
export const loadReports = async (): Promise<void> => {
  if (isLoaded) {
    console.log("Reports already loaded");
    return;
  }

  try {
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
        } catch (err: unknown) {
          const errorMessage = err instanceof Error ? err.message : 'Unknown error';
          console.error(`Failed to parse line ${index}:`, errorMessage);
          return null;
        }
      })
      .filter((report): report is Report => report !== null);

    console.log(`Loaded ${reports.length} reports from file`);

    // Initialize embedding model using Xenova
    console.log("Initializing Xenova embeddings model...");
    
    try {
      // Use Xenova's pipeline - it handles downloading and caching automatically
      const model = await pipeline(
        'feature-extraction', 
        'Xenova/all-MiniLM-L6-v2',
        { 
          quantized: false, // Set to true for smaller model size, false for better accuracy
          progress_callback: (data: any) => {
            if (data.status === 'downloading') {
              console.log(`Downloading model: ${data.name} - ${Math.round(data.progress)}%`);
            } else if (data.status === 'loading') {
              console.log(`Loading model: ${data.name}`);
            }
          }
        }
      );
      
      embeddingsModel = model as EmbeddingModel;
      console.log("Xenova embeddings model loaded successfully");
    } catch (modelError: unknown) {
      const errorMessage = modelError instanceof Error ? modelError.message : 'Unknown error';
      console.error("Failed to load Xenova embeddings model:", errorMessage);
      throw new Error(`Embeddings model loading failed: ${errorMessage}`);
    }

    // Generate embeddings for each report using batch processing
    console.log("Generating embeddings for all reports...");
    
    const batchSize: number = 5; // Smaller batch size for Xenova to avoid memory issues
    let processed: number = 0;
    
    for (let i = 0; i < reports.length; i += batchSize) {
      const batch: Report[] = reports.slice(i, i + batchSize);
      
      try {
        if (!embeddingsModel) {
          throw new Error("Embeddings model not initialized");
        }
        
        // Process each text individually with Xenova (more reliable)
        for (const report of batch) {
          try {
            const embedding: XenovaTensor = await embeddingsModel(report.text, {
              pooling: 'mean',
              normalize: true
            });
            
            // Convert tensor data to array
            report.embedding = Array.from(embedding.data);
            processed++;
            
          } catch (singleError: unknown) {
            const errorMessage = singleError instanceof Error ? singleError.message : 'Unknown error';
            console.error(`Failed to generate embedding for report ${report.id}:`, errorMessage);
            report.embedding = [];
          }
        }
        
        if (processed % 25 === 0 || processed === reports.length) {
          console.log(`Generated embeddings: ${processed}/${reports.length}`);
        }
        
      } catch (batchError: unknown) {
        const errorMessage = batchError instanceof Error ? batchError.message : 'Unknown error';
        console.error(`Failed to process batch starting at ${i}:`, errorMessage);
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

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error("Failed to load reports:", errorMessage);
    throw error;
  }
};

/**
 * Retrieve top-k relevant reports for a query using Xenova embeddings
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
    
    // Generate embedding for the query using Xenova
    const queryEmbedding: XenovaTensor = await embeddingsModel(query, {
      pooling: 'mean',
      normalize: true
    });
    
    const queryVector: number[] = Array.from(queryEmbedding.data);
    
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

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error("Search failed:", errorMessage);
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

// Optional: Add a function to clear cache if needed
export const clearModelCache = (): void => {
  try {
    const cachePath = path.join(process.cwd(), '.cache', 'transformers');
    if (fs.existsSync(cachePath)) {
      fs.rmSync(cachePath, { recursive: true, force: true });
      console.log('Model cache cleared');
    }
  } catch (error) {
    console.error('Failed to clear cache:', error);
  }
};