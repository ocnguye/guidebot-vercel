import { NextRequest, NextResponse } from "next/server";
import { HfInference } from "@huggingface/inference";

const HF_TOKEN = process.env.GUIDEBOT_TOKEN;
const MODEL = "Qwen/Qwen3-Next-80B-A3B-Instruct";

const baseSystemPrompt = `
You are a helpful assistant for designing medical data extraction schemas.
When asked, suggest a JSON object where each key is a field name and each value is an object with:
- type ("radio" or "list")
- description (string)
- options (array of strings, if applicable)
- max_points (number, if applicable)
- key_field (boolean, if applicable)
Respond with a short explanation, then output the JSON schema as a markdown code block.
`;

export async function POST(req: NextRequest) {
  try {
    const { messages, currentSchema } = await req.json();

    if (!HF_TOKEN) {
      return NextResponse.json({ error: "No Hugging Face token set." }, { status: 500 });
    }

    const hf = new HfInference(HF_TOKEN);

    // Optionally include current schema in the system prompt for context
    let systemPrompt = baseSystemPrompt;
    if (currentSchema && Object.keys(currentSchema).length > 0) {
      systemPrompt += `\n\nCurrent schema fields:\n${JSON.stringify(currentSchema, null, 2)}\n\nSuggest only new fields or improvements.`;
    }

    // Prepare chat messages for chatCompletion
    const chatMessages = [
      { role: "system", content: systemPrompt },
      ...messages,
    ];

    // Call chatCompletion (make sure your model supports this task)
    const response = await hf.chatCompletion({
      model: MODEL,
      messages: chatMessages,
      parameters: {
        max_new_tokens: 512,
        temperature: 0.3,
      },
    });

    const reply = response.choices?.[0]?.message?.content || "";

    // Extract JSON from markdown code block if present
    const match = reply.match(/```json\s*([\s\S]*?)```/);
    let schema = null;
    if (match) {
      try {
        schema = JSON.parse(match[1]);
      } catch {}
    }

    return NextResponse.json({ reply, schema });
  } catch (error: any) {
    console.error("Schema helper error:", error);
    return NextResponse.json({ error: "Failed to generate schema suggestion." }, { status: 500 });
  }
}