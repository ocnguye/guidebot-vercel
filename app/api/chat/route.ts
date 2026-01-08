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
    });

    if (!response.ok) {
      // Try to read response body for more detailed error info
      let bodyText: string;
      try {
        bodyText = await response.text();
      } catch (e) {
        bodyText = `<unable to read body: ${String(e)}>`;
      }

      const errMsg = `OpenAI API error ${response.status} ${response.statusText}: ${bodyText}`;
      console.error(errMsg);
      throw new Error(errMsg);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || "";
  } catch (error: any) {
    console.error(`Generation failed with ${model.name}:`, error?.message || error);
    throw error;
  }
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
    const messages = createChatMessages(query, contextText, conversationHistory);

    const response = await generateWithOpenAI(messages, model);
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