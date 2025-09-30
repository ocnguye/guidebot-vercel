import { NextRequest, NextResponse } from "next/server";
import { HfInference } from "@huggingface/inference";
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

// Globals
let hf: HfInference | null = null;
let initialized: boolean = false;

// Medical model configuration - Updated to Qwen 3
const getMedicalModel = (): MedicalModel => ({
  name: 'Qwen/Qwen3-Next-80B-A3B-Instruct',
  description: 'Qwen 3 Next 80B A3B Instruct - Advanced instruction-following model'
});

// Initialize HF Inference
const initHFInference = (): boolean => {
  const token = process.env.GUIDEBOT3;
  
  if (!token) {
    console.error("No Hugging Face token found. Please set HF_TOKEN in .env.local");
    return false;
  }

  try {
    hf = new HfInference(token);
    console.log("Hugging Face Inference API initialized");
    return true;
  } catch (error: any) {
    console.error("Failed to initialize HF Inference:", error);
    return false;
  }
};

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
  conversationHistory.slice(-4).forEach(msg => {
    messages.push({
      role: msg.role === "user" ? "user" : "assistant",
      content: msg.text
    });
  });

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

// Generate response using Qwen3 via chat completion
async function generateWithQwen3(messages: any[], model: MedicalModel): Promise<string> {
  if (!hf) throw new Error("HF Inference not initialized");

  try {
    console.log(`Generating with ${model.name}...`);
    
    const response = await hf.chatCompletion({
      model: model.name,
      messages: messages,
      max_tokens: 800,
      temperature: 0.1, // Low temperature for medical accuracy
      top_p: 0.9,
      stop: ["Question:", "Context:", "Human:", "User:"]
    });
    
    return response.choices[0]?.message?.content || "";
    
  } catch (error: any) {
    console.error(`Generation failed with ${model.name}:`, error.message);
    throw error;
  }
}

// Clean response for Qwen3 output
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
const init = async (): Promise<void> => {
  if (initialized) return;
  
  try {
    console.log("Initializing Medical AI System...");
    
    if (!initHFInference()) {
      throw new Error("Failed to initialize Hugging Face API");
    }
    
    console.log("Loading medical reports database...");
    await loadReports();
    
    initialized = true;
    console.log("Medical AI System initialized with Qwen3-Next-80B-A3B-Instruct");
    
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
    const messages = createChatMessages(query, contextText, conversationHistory);
    
    const response = await generateWithQwen3(messages, model);
    const cleanedResponse = cleanResponse(response);
    
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