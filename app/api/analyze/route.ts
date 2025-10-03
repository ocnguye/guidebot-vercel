import { NextRequest, NextResponse } from "next/server";
import { jsonrepair } from "jsonrepair";

const OPENAI_API_KEY = process.env.OPENAI_KEY;
const MODEL = "gpt-4o"; // or "gpt-4", "gpt-3.5-turbo", etc.

function buildPrompt(report: string, schema: any) {
  return `Please answer the following questions based on the radiology report below.

1. Does this report describe a case of the target pathology (e.g., Pulmonary Embolism)? Respond with either 'Present' or 'Not Present'.
2. If present, extract the following schema fields.

Radiology Report:
${report}

Schema:
${JSON.stringify(schema, null, 2)}

Return your answer in this format (respond with ONLY valid JSON, no explanation, no markdown, no extra text):
{
  "Pathology Presence": "Present" or "Not Present",
  "Schema": {
    "Field1": value,
    "Field2": value,
    ...
  }
}`;
}

async function openaiChatCompletion(prompt: string) {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: "user", content: prompt }],
      max_tokens: 512,
      temperature: 0,
    }),
  });

  if (!res.ok) {
    throw new Error(`OpenAI API error: ${res.statusText}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content || "";
}

export async function POST(req: NextRequest) {
  try {
    const { cases, schema } = await req.json();
    if (!OPENAI_API_KEY) {
      return NextResponse.json({ error: "No OpenAI API key set." }, { status: 500 });
    }

    // Batch process all cases in parallel
    const results = await Promise.all(
      cases.map(async (caseData: any) => {
        const prompt = buildPrompt(caseData.ContentText, schema);

        let content = "";
        let presence = "Unknown";
        let extractedSchema = {};
        try {
          content = await openaiChatCompletion(prompt);
          let parsed;
          try {
            parsed = typeof content === "string" ? JSON.parse(content) : content;
          } catch {
            // Try to repair JSON if parsing fails
            try {
              parsed = JSON.parse(jsonrepair(content));
            } catch {
              // Try to extract JSON from within the text (e.g., markdown/code block)
              const match = content.match(/{[\s\S]*}/);
              if (match) {
                try {
                  parsed = JSON.parse(jsonrepair(match[0]));
                } catch {
                  throw new Error("No valid JSON found in model output");
                }
              } else {
                throw new Error("No JSON found in model output");
              }
            }
          }
          presence = parsed["Pathology Presence"] || "Unknown";
          extractedSchema = parsed["Schema"] || {};
          // Log to console for debugging
          console.log(`Accession: ${caseData.AccessionNumber || "N/A"} | Presence: ${presence}`);
        } catch (err) {
          // fallback: try to extract with regex or leave as unknown
          console.warn(`Failed to parse model output for Accession: ${caseData.AccessionNumber || "N/A"}`);
        }

        // Calculate completion
        const totalFields = Object.keys(schema).length;
        const filledFields = Object.values(extractedSchema).filter(
          v => v !== "" && v !== null && v !== undefined && !(Array.isArray(v) && v.length === 0)
        ).length;
        const completion = totalFields > 0 ? filledFields / totalFields : 0;

        return {
          ...caseData,
          "Raw Extraction": content,
          "Pathology Presence": presence,
          "Schema Extraction": JSON.stringify(extractedSchema),
          "Fields Filled": filledFields,
          "Total Fields": totalFields,
          "Completion %": completion,
        };
      })
    );

    return NextResponse.json({ processed: results });
  } catch (error) {
    console.error("Process error:", error);
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }
}