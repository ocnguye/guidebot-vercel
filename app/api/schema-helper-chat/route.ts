import { NextRequest, NextResponse } from "next/server";

const OPENAI_API_KEY = process.env.OPENAI_KEY;
const MODEL = "gpt-4o"; // or "gpt-4", "gpt-3.5-turbo"

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

    if (!OPENAI_API_KEY) {
      return NextResponse.json({ error: "No OpenAI API key set." }, { status: 500 });
    }

    // Optionally include current schema in the system prompt for context
    let systemPrompt = baseSystemPrompt;
    if (currentSchema && Object.keys(currentSchema).length > 0) {
      systemPrompt += `\n\nCurrent schema fields:\n${JSON.stringify(currentSchema, null, 2)}\n\nSuggest only new fields or improvements.`;
    }

    // Prepare chat messages for OpenAI
    const chatMessages = [
      { role: "system", content: systemPrompt },
      ...messages,
    ];

    // Call OpenAI Chat Completion API
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        messages: chatMessages,
        max_tokens: 512,
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      return NextResponse.json({ error: `OpenAI API error: ${errText}` }, { status: 500 });
    }

    const data = await response.json();
    const reply: string =
      data.choices?.[0]?.message?.content ||
      data.generated_text ||
      data.choices?.[0]?.generated_text ||
      "";

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