import { NextRequest, NextResponse } from "next/server";
import { HfInference } from "@huggingface/inference";
import { loadReports, retrieveRelevantReports } from "@/lib/reports";

// Types
interface RequestBody {
  query: string;
}

interface MedicalModel {
  name: string;
  description: string;
}

interface ChatCompletionInputMessage {
  role: string;
  content: string;
  [key: string]: unknown;
}

interface ChatCompletionChoice {
  message?: {
    content?: string;
  };
}

interface ChatCompletionResponse {
  choices: ChatCompletionChoice[];
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
  const token = process.env.HF_TOKEN || process.env.GUIDEBOT_TOKEN || process.env.HUGGINGFACE_API_KEY;
  
  if (!token) {
    console.error("No Hugging Face token found. Please set HF_TOKEN in .env.local");
    return false;
  }

  try {
    hf = new HfInference(token);
    console.log("Hugging Face Inference API initialized");
    return true;
  } catch (error: unknown) {
    console.error("Failed to initialize HF Inference:", error);
    return false;
  }
};

// Create system and user messages for chat completion
function createChatMessages(query: string, context: string): ChatCompletionInputMessage[] {
  const limitedContext = context.substring(0, 2000);

  return [
    {
      role: "system",
      content: "You are GuideBot, a radiology assistant. Use ONLY the context provided to answer questions. If you're unsure or the context doesn't contain the answer, say you don't know. Be precise and medical in your responses."
    },
    {
      role: "user",
      content: `Context:
${limitedContext}

Question: ${query}`
    }
  ];
}

// Generate response using Qwen3 via chat completion
async function generateWithQwen3(messages: ChatCompletionInputMessage[], model: MedicalModel): Promise<string> {
  if (!hf) throw new Error("HF Inference not initialized");

  try {
    console.log(`Generating with ${model.name}...`);
    
    const response = await hf.chatCompletion({
      model: model.name,
      messages: messages,
      max_tokens: 400,
      temperature: 0.1, // Low temperature for medical accuracy
      top_p: 0.9,
      stop: ["Question:", "Context:", "Human:", "User:"]
    }) as ChatCompletionResponse;
    
    return response.choices[0]?.message?.content || "";
    
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`Generation failed with ${model.name}:`, errorMessage);
    throw error;
  }
}

// Clean response for Qwen3 output
function cleanResponse(response: string): string {
  return response
    .trim()
    .replace(/^(Answer:|Response:)\s*/i, '') // Remove answer prefixes
    .replace(/\n{3,}/g, '\n\n') // Limit consecutive line breaks
    .replace(/^\s*[\-\*]\s*/, '') // Remove leading bullet points
    .replace(/^(Assistant|Model):\s*/i, '') // Remove model prefixes
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
    
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error("Initialization failed:", errorMessage);
    throw error;
  }
};

// Main API endpoint
export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body: RequestBody = await req.json();
    const { query } = body;
    
    if (!query || typeof query !== "string" || query.trim().length === 0) {
      return NextResponse.json({ error: "Valid query required" }, { status: 400 });
    }

    console.log(`Processing medical query: "${query}"`);

    // Initialize system
    await init();

    // Retrieve relevant context from medical reports
    let contextText = "";
    try {
      const relevantReports = await retrieveRelevantReports(query, 3);
      contextText = relevantReports.map((r: { text: string }) => r.text).join("\n\n");
      console.log(`Retrieved ${relevantReports.length} relevant medical reports`);
    } catch (reportsError: unknown) {
      const errorMessage = reportsError instanceof Error ? reportsError.message : 'Unknown error';
      console.warn("Reports retrieval failed:", errorMessage);
      // Continue without context rather than failing
    }

    // Generate response using Qwen3
    const model = getMedicalModel();
    
    try {
      // Create chat messages for instruction-tuned model
      const messages = createChatMessages(query, contextText);
      console.log("Generating medical response...");
      console.log(`Using model: ${model.name}`);
      console.log(`Messages created: ${messages.length} messages`);
      
      const response = await generateWithQwen3(messages, model);
      console.log(`Raw response: "${response}"`);
      
      if (!response || response.trim().length < 10) {
        console.log("Response too short or empty");
        return NextResponse.json({
          result: "I'm having trouble generating a response right now. Please try rephrasing your question or try again later."
        });
      }
      
      const cleanedResponse = cleanResponse(response);
      console.log(`Cleaned response: "${cleanedResponse}"`);
      
      if (cleanedResponse.length < 5) {
        return NextResponse.json({
          result: "I couldn't generate a complete response. Please try rephrasing your question."
        });
      }
      
      return NextResponse.json({
        result: cleanedResponse,
        model_used: model.name
      });
      
    } catch (generationError: unknown) {
      const errorMessage = generationError instanceof Error ? generationError.message : 'Unknown error';
      console.error("Qwen3 generation failed:", errorMessage);
      
      // Provide more specific error handling for Qwen3
      if (errorMessage.includes('overloaded') || errorMessage.includes('currently loading')) {
        return NextResponse.json({ 
          result: "The Qwen3 model is currently overloaded or loading. Please try again in a few moments."
        });
      } else if (errorMessage.includes('timeout')) {
        return NextResponse.json({ 
          result: "The request timed out. Please try with a shorter question."
        });
      } else if (errorMessage.includes('rate limit')) {
        return NextResponse.json({ 
          result: "Rate limit exceeded. Please wait before making another request."
        });
      } else if (errorMessage.includes('no inference providers') || errorMessage.includes('not available')) {
        return NextResponse.json({ 
          result: "The Qwen3 model is not currently available on the free tier. This 80B model likely requires a Pro account or paid inference endpoints."
        });
      } else if (errorMessage.includes('conversational')) {
        return NextResponse.json({ 
          result: "The model requires conversational API access. This indicates the model may not be available through the current inference method."
        });
      } else {
        return NextResponse.json({ 
          error: `Model generation failed: ${errorMessage}`
        }, { status: 500 });
      }
    }

  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    console.error("API error:", errorMessage);
    
    return NextResponse.json({ 
      error: `Failed to process medical query: ${errorMessage}`
    }, { status: 500 });
  }
}