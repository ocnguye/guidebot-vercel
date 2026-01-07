import { NextRequest, NextResponse } from "next/server";
import { loadReports, retrieveRelevantReports } from "../../../lib/reports";

// Types
interface RequestBody {
  query: string;
  conversationHistory?: Array<{ role: string; text: string }>;
}

interface MedicalModel {
  name: string;
  description: string;
}

// OpenAI model configuration
const getMedicalModel = (): MedicalModel => ({
  name: 'gpt-4o', // or 'gpt-4', 'gpt-3.5-turbo'
  description: 'OpenAI GPT-4o - Advanced instruction-following model'
});

const OPENAI_API_KEY = process.env.OPENAI_KEY;

// Simple in-memory cache for OpenAI responses (keyed by messages JSON)
type CacheEntry = { value: string; expiresAt: number };
const completionCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 1000 * 60 * 60; // 1 hour

function cacheGet(key: string): string | null {
  const e = completionCache.get(key);
  if (!e) return null;
  if (Date.now() > e.expiresAt) {
    completionCache.delete(key);
    return null;
  }
  return e.value;
}

function cacheSet(key: string, value: string) {
  completionCache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
}

// simple sleep
function sleep(ms: number) { return new Promise(res => setTimeout(res, ms)); }

// retry wrapper for transient errors
async function withRetry<T>(fn: ()=>Promise<T>, retries = 3, baseDelay = 300): Promise<T> {
  let lastErr: any;
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (err: any) {
      lastErr = err;
      const status = err?.status || (err?.message && /OpenAI API error (\d+)/.exec(err.message)?.[1]);
      const statusNum = status ? Number(status) : undefined;
      // Only retry on transient conditions or network errors
      if (i === retries - 1 || (statusNum && ![429, 502, 503, 504].includes(statusNum))) break;
      const delay = Math.pow(2, i) * baseDelay + Math.random() * 100;
      await sleep(delay);
    }
  }
  throw lastErr;
}

// Create system and user messages for chat completion
type ChatRole = "system" | "user" | "assistant";

interface ChatMessage {
  role: ChatRole;
  content: string;
}

function createChatMessages(query: string, context: string, conversationHistory: Array<{ role: string; text: string }> = []): ChatMessage[] {
  const limitedContext = context.substring(0, 2000);

  const messages: ChatMessage[] = [
    {
      role: "system",
      content: "You are GuideBot, a radiology assistant - use context to answer questions, format equipment as bullets (•) and steps as numbers (1,2,3), provide complete detailed responses."
    }
  ];

  // Add conversation history (last few exchanges for context)
  // Sanitize conversation history: ensure content is a non-null string and skip empty entries
  const safeHistory = conversationHistory.slice(-4)
    .map(msg => ({
      role: msg.role === "user" ? "user" : "assistant",
      content: typeof msg.text === 'string' ? msg.text.trim() : ''
    }))
    .filter(m => m.content.length > 0);

  safeHistory.forEach(msg => messages.push({ role: msg.role as ChatRole, content: msg.content }));

  // Add current query with context
  messages.push({
    role: "user",
    content: `Context from medical reports:
      ${limitedContext}

      Medical Question: ${query}

      Please provide a complete, structured response. If this is a follow-up question, refer to our previous conversation.`
  });

  return messages;
}

// Generate response using OpenAI GPT-4
async function generateWithOpenAI(messages: any[], model: MedicalModel): Promise<string> {
  if (!OPENAI_API_KEY) throw new Error("OpenAI API key not set");

  // Build cache key
  const cacheKey = JSON.stringify(messages.map((m: any) => ({ role: m.role, content: m.content })));
  const cached = cacheGet(cacheKey);
  if (cached) return cached;

  // Prepare fetch with timeout and retry
  const doFetch = async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000); // 10s
    try {
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: model.name,
          messages: messages,
          max_tokens: 800,
          temperature: 0.1,
          top_p: 0.9,
          stop: ["Question:", "Context:", "Human:", "User:"]
        }),
        signal: controller.signal as any
      });

      if (!response.ok) {
        let bodyText: string;
        try { bodyText = await response.text(); } catch (e) { bodyText = `<unable to read body: ${String(e)}>`; }
        const errMsg = `OpenAI API error ${response.status} ${response.statusText}: ${bodyText}`;
        const err: any = new Error(errMsg);
        err.status = response.status;
        throw err;
      }

      const data = await response.json();
      const result = data.choices?.[0]?.message?.content || "";
      try { cacheSet(cacheKey, result); } catch (e) { /* ignore */ }
      return result;
    } finally {
      clearTimeout(timeout);
    }
  };

  const text = await withRetry(doFetch, 3, 500);
  return text;
}

// --- Chunking helpers (minimal changes approach) ---
// Split text into chunks by paragraphs with a max char size (simple heuristic)
function splitIntoChunks(text: string, maxChars = 2000): string[] {
  if (!text) return [];
  const paragraphs = text.split(/\n{1,}/).map(p => p.trim()).filter(Boolean);
  const chunks: string[] = [];
  let current = '';
  for (const para of paragraphs) {
    if ((current + '\n\n' + para).length <= maxChars) {
      current = current ? (current + '\n\n' + para) : para;
    } else {
      if (current) { chunks.push(current); }
      if (para.length <= maxChars) {
        current = para;
      } else {
        // Hard split very long paragraph
        for (let i = 0; i < para.length; i += maxChars) {
          chunks.push(para.slice(i, i + maxChars));
        }
        current = '';
      }
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

// Simple concurrency limiter for promises (no external dependency)
async function runWithConcurrency<T>(items: T[], worker: (item: T) => Promise<any>, concurrency = 3) {
  const results: any[] = [];
  let i = 0;
  const runners: Promise<void>[] = [];

  async function run() {
    while (true) {
      const idx = i++;
      if (idx >= items.length) break;
      try {
        const res = await worker(items[idx]);
        results[idx] = res;
      } catch (e) {
        results[idx] = e;
      }
    }
  }

  for (let j = 0; j < Math.min(concurrency, items.length); j++) runners.push(run());
  await Promise.all(runners);
  return results;
}

// Call OpenAI for each chunk (bounded concurrency) and return array of responses
async function callOpenAIForChunks(chunkTexts: string[], question: string, model: MedicalModel, concurrency = 3) {
  const capped = chunkTexts.slice(0, 8); // cap to avoid too many parallel calls
  const worker = async (chunk: string) => {
    const messages = [
      { role: 'system', content: 'You are a radiology assistant. Extract the most relevant findings from the report chunk.' },
      { role: 'user', content: `Report chunk:\n\n${chunk}\n\nQuestion: ${question}\n\nProvide a concise extract (1-3 sentences) or the most relevant text.` }
    ];
    const resp = await generateWithOpenAI(messages, model);
    return resp.trim();
  };

  const responses = await runWithConcurrency(capped, worker, concurrency);
  return responses.map(r => (typeof r === 'string' ? r : '')); // convert errors to empty strings for synth
}

// Synthesize chunk responses into a single coherent answer using the same model
async function synthesizeChunkResponses(chunkResponses: string[], question: string, model: MedicalModel) {
  const nonEmpty = chunkResponses.filter(Boolean).map((r, i) => `Chunk ${i + 1}: ${r}`).join('\n\n');
  const synthMessages = [
    { role: 'system', content: 'You are a radiology assistant that consolidates multiple findings into a single structured answer.' },
    { role: 'user', content: `Question: ${question}\n\nFindings from chunks:\n\n${nonEmpty}\n\nPlease provide a single, structured, and complete answer. Use bullets for equipment and numbers for steps.` }
  ];

  const final = await generateWithOpenAI(synthMessages, model);
  return final.trim();
}

// Clean response for OpenAI output
function cleanResponse(response: string): string {
  return response
    .trim()
    .replace(/^(Answer:|Response:|Assistant:|AI:)\s*/i, '') // Remove answer prefixes
    .replace(/\n{3,}/g, '\n\n') // Limit consecutive line breaks
    .replace(/^\s*[\-\*]\s*/, '') // Remove leading bullet points
    .replace(/^(Assistant|Model|GuideBot):\s*/i, '') // Remove model prefixes
    // Keep markdown formatting for lists and structure
    .replace(/\*\*(.*?)\*\*/g, '**$1**') // Preserve bold formatting
    .replace(/^\s*\d+\.\s/gm, '$&') // Preserve numbered lists
    .replace(/^\s*-\s/gm, '$&') // Preserve bullet points
    .trim();
}

// Initialization
let initialized = false;
const init = async (): Promise<void> => {
  if (initialized) return;

  try {
    console.log("Initializing Medical AI System...");

    console.log("Loading medical reports database...");
    await loadReports();

    initialized = true;
    console.log("Medical AI System initialized with OpenAI GPT-4");
  } catch (error: any) {
    console.error("Initialization failed:", error);
    throw error;
  }
};

// Main API endpoint
export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body: RequestBody = await req.json();
    const { query, conversationHistory = [] } = body;

    if (!query || typeof query !== "string" || query.trim().length === 0) {
      return NextResponse.json({ error: "Valid query required" }, { status: 400 });
    }

    console.log(`Processing query: "${query}" with ${conversationHistory.length} history messages`);

    // Initialize system
    await init();

    // Retrieve relevant context
    let contextText = "";
    let usedReports: any[] = [];
    try {
      const relevantReports = await retrieveRelevantReports(query, 3);
      contextText = relevantReports.map((r: any) => r.text).join("\n\n");
      usedReports = relevantReports.map((r: any) => ({
        reportId: r.reportId,
        snippet: r.text.slice(0, 120).replace(/\s+/g, " ") + "...",
        fullText: r.text
      }));
      console.log(`Retrieved ${relevantReports.length} relevant medical reports`);
    } catch (reportsError: any) {
      console.warn("Reports retrieval failed:", reportsError.message);
    }

    // Generate response with conversation context
    const model = getMedicalModel();
    // If context is large, use chunking strategy (minimal change):
    const MAX_CONTEXT_CHARS = 2500;
    const CHUNK_MAX_CHARS = 1800;
    const CHUNK_CONCURRENCY = 3;

    let rawResponse: string;
    if (contextText.length > MAX_CONTEXT_CHARS) {
      const chunks = splitIntoChunks(contextText, CHUNK_MAX_CHARS);
      console.log(`Context large (${contextText.length} chars). Using ${chunks.length} chunks (capped to 8).`);
      const chunkResponses = await callOpenAIForChunks(chunks, query, model, CHUNK_CONCURRENCY);
      rawResponse = await synthesizeChunkResponses(chunkResponses, query, model);
    } else {
      const messages = createChatMessages(query, contextText, conversationHistory);
      rawResponse = await generateWithOpenAI(messages, model);
    }

    const cleanedResponse = cleanResponse(rawResponse);

    return NextResponse.json({
      result: cleanedResponse,
      model_used: model.name,
      usedReports
    });

  } catch (err: any) {
    console.error("API error:", err);
    return NextResponse.json({
      error: `Failed to process medical query: ${err.message}`
    }, { status: 500 });
  }
}