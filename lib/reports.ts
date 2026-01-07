import { HfInference } from "@huggingface/inference";
import cosineSimilarity from "cosine-similarity";

interface Report {
  reportId: number;
  text: string;
  embedding: number[];
}

interface ScoredReport extends Report {
  score: number;
}

let reports: Report[] = [];
let hfClient: HfInference | null = null;
let isLoaded: boolean = false;

/**
 * Initialize HF client for query embeddings only
 */
const initializeHFClient = (): boolean => {
  const token = process.env.GUIDEBOT_TOKEN;
  
  if (!token) {
    console.error("No Hugging Face token found for embeddings");
    return false;
  }

  hfClient = new HfInference(token);
  return true;
};

/**
 * Generate embedding for query using HF Inference API
 */
const generateQueryEmbedding = async (text: string): Promise<number[]> => {
  if (!hfClient) {
    throw new Error("HF client not initialized");
  }

  try {
    const response = await hfClient.featureExtraction({
      model: 'sentence-transformers/all-MiniLM-L6-v2',
      inputs: text
    });

    const embedding = Array.isArray(response[0]) ? response[0] : response;
    return embedding as number[];
  } catch (error) {
    console.error('Failed to generate query embedding:', error);
    throw error;
  }
};

/**
 * Load pre-generated embeddings - FAST!
 */
export const loadReports = async (): Promise<void> => {
  if (isLoaded) {
    console.log("Reports already loaded");
    return;
  }

  const startTime = Date.now();

  try {
    // Initialize HF client for queries
    if (!initializeHFClient()) {
      throw new Error("Failed to initialize Hugging Face client");
    }

    console.log("Loading pre-generated embeddings...");
    
    // Try to load from public folder first (for production)
    let embeddingsData: string;
    
    try {
      // In production, load from public folder
      const response = await fetch(`${process.env.VERCEL_URL ? 'https://' + process.env.VERCEL_URL : ''}/embeddings.json`);
      if (response.ok) {
        embeddingsData = await response.text();
      } else {
        throw new Error('Not found in public folder');
      }
    } catch {
      // Fallback: try to load from file system (development)
      const fs = await import('fs');
      const path = await import('path');
      const filePath = path.join(process.cwd(), 'public', 'embeddings.json');
      
      if (fs.existsSync(filePath)) {
        embeddingsData = fs.readFileSync(filePath, 'utf-8');
      } else {
        throw new Error('Pre-generated embeddings not found. Run: npm run build-embeddings');
      }
    }
    
    reports = JSON.parse(embeddingsData);
    
    const loadTime = Date.now() - startTime;
    console.log(`✅ Loaded ${reports.length} reports with embeddings in ${loadTime}ms`);
    
    isLoaded = true;

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error("Failed to load reports:", errorMessage);
    throw error;
  }
};

/**
 * Retrieve relevant reports - FAST!
 */
export const retrieveRelevantReports = async (query: string, topK: number = 3): Promise<Report[]> => {
  if (!isLoaded) {
    throw new Error("Reports not loaded. Call loadReports() first.");
  }

  if (!hfClient) {
    throw new Error("HF client not available");
  }

  const startTime = Date.now();

  try {
    console.log(`🔍 Searching for: "${query}"`);
    
    // Generate embedding for query only (fast)
    const queryEmbedding = await generateQueryEmbedding(query);
    
    // Calculate similarities (very fast - just math)
    const validReports = reports.filter(r => r.embedding && r.embedding.length > 0);
    
    if (validReports.length === 0) {
      throw new Error("No reports with valid embeddings found");
    }
    
    const scored: ScoredReport[] = validReports.map((r): ScoredReport => {
      const similarity = cosineSimilarity(queryEmbedding, r.embedding);
      return { ...r, score: similarity };
    });

    // Sort and get top results
    scored.sort((a, b) => b.score - a.score);
    const topResults = scored.slice(0, topK);
    
    const searchTime = Date.now() - startTime;
    console.log(`✅ Found ${topResults.length} relevant reports in ${searchTime}ms`);
    console.log('Top scores:', topResults.map(r => ({ id: r.reportId, score: r.score.toFixed(3) })));
    
    return topResults;

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error("Search failed:", errorMessage);
    throw error;
  }
};

export const areReportsLoaded = (): boolean => isLoaded;
export const getReportCount = (): number => reports.length;
export const getEmbeddingStats = () => {
  const withEmbeddings = reports.filter(r => r.embedding && r.embedding.length > 0);
  return {
    total: reports.length,
    withEmbeddings: withEmbeddings.length,
    embeddingDim: withEmbeddings.length > 0 ? withEmbeddings[0].embedding.length : 0
  };
};