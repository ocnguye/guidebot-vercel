import fs from "fs";
import path from "path";
import { HfInference } from "@huggingface/inference";
import cosineSimilarity from "cosine-similarity";

// Type definitions
interface ParsedReport {
  ContentText?: string;
  text?: string;
  [key: string]: unknown;
}

interface ScoredReport extends Report {
  score: number;
}

export interface Report {
  id: number;
  text: string;
  embedding: number[];
}

let reports: Report[] = [];
let hfClient: HfInference | null = null;
let isLoaded: boolean = false;

/**
 * Initialize Hugging Face client
 */
const initializeHFClient = (): boolean => {
  const token = process.env.HF_TOKEN || process.env.GUIDEBOT_TOKEN || process.env.HUGGINGFACE_API_KEY;
  
  if (!token) {
    console.error("No Hugging Face token found for embeddings");
    return false;
  }

  hfClient = new HfInference(token);
  console.log("Hugging Face client initialized for embeddings");
  return true;
};

/**
 * Generate embeddings using HF Inference API
 */
const generateEmbedding = async (text: string): Promise<number[]> => {
  if (!hfClient) {
    throw new Error("HF client not initialized");
  }

  try {
    const response = await hfClient.featureExtraction({
      model: 'sentence-transformers/all-MiniLM-L6-v2',
      inputs: text
    });

    // HF API returns embeddings as nested arrays, flatten if needed
    const embedding = Array.isArray(response[0]) ? response[0] : response;
    return embedding as number[];
  } catch (error) {
    console.error('Failed to generate embedding:', error);
    throw error;
  }
};

/**
 * Load reports from JSONL and generate embeddings using HF Inference API
 */
export const loadReports = async (): Promise<void> => {
  if (isLoaded) {
    console.log("Reports already loaded");
    return;
  }

  try {
    // Initialize HF client
    if (!initializeHFClient()) {
      throw new Error("Failed to initialize Hugging Face client");
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
        } catch (err: unknown) {
          const errorMessage = err instanceof Error ? err.message : 'Unknown error';
          console.error(`Failed to parse line ${index}:`, errorMessage);
          return null;
        }
      })
      .filter((report): report is Report => report !== null);

    console.log(`Loaded ${reports.length} reports from file`);

    // Generate embeddings using HF Inference API
    console.log("Generating embeddings using Hugging Face Inference API...");
    
    let processed = 0;
    const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

    for (const report of reports) {
      try {
        // Add small delay to avoid rate limiting
        if (processed > 0 && processed % 10 === 0) {
          await delay(1000); // 1 second delay every 10 requests
        }

        const embedding = await generateEmbedding(report.text);
        report.embedding = embedding;
        processed++;

        if (processed % 50 === 0 || processed === reports.length) {
          console.log(`Generated embeddings: ${processed}/${reports.length}`);
        }

      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error(`Failed to generate embedding for report ${report.id}:`, errorMessage);
        
        // If it's a rate limit error, wait longer
        if (errorMessage.includes('rate') || errorMessage.includes('429')) {
          console.log('Rate limited, waiting 5 seconds...');
          await delay(5000);
          // Retry once
          try {
            const embedding = await generateEmbedding(report.text);
            report.embedding = embedding;
            processed++;
          } catch (retryError) {
            console.error(`Retry failed for report ${report.id}`);
            report.embedding = [];
          }
        } else {
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
 * Retrieve top-k relevant reports for a query using HF Inference API
 */
export const retrieveRelevantReports = async (query: string, topK: number = 3): Promise<Report[]> => {
  if (!isLoaded) {
    throw new Error("Reports not loaded. Call loadReports() first.");
  }

  if (!hfClient) {
    throw new Error("HF client not available");
  }

  try {
    console.log(`Searching for: "${query}"`);
    
    // Generate embedding for the query using HF API
    const queryEmbedding = await generateEmbedding(query);
    
    // Calculate similarity with all reports that have embeddings
    const validReports: Report[] = reports.filter((r: Report) => r.embedding.length > 0);
    
    if (validReports.length === 0) {
      throw new Error("No reports with valid embeddings found");
    }
    
    const scored: ScoredReport[] = validReports.map((r: Report): ScoredReport => {
      const similarity: number = cosineSimilarity(queryEmbedding, r.embedding);
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