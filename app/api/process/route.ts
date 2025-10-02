import { NextRequest, NextResponse } from "next/server";
import { HfInference } from "@huggingface/inference";

const HF_TOKEN = process.env.GUIDEBOT3;
const MODEL = "Qwen/Qwen3-Next-80B-A3B-Instruct";

function buildPrompt(report: string, schema: any) {
  return `Please answer the following questions based on the radiology report below.

1. Does this report describe a case of the target pathology (e.g., Pulmonary Embolism)? Respond with either 'Present' or 'Not Present'.
2. If present, extract the following schema fields.

Radiology Report:
${report}

Schema:
${JSON.stringify(schema, null, 2)}

Return your answer in this format:
{
  "Pathology Presence": "Present" or "Not Present",
  "Schema": {
    "Field1": value,
    "Field2": value,
    ...
  }
}`;
}

export async function POST(req: NextRequest) {
  try {
    const { cases, schema } = await req.json();
    if (!HF_TOKEN) {
      return NextResponse.json({ error: "No Hugging Face token set." }, { status: 500 });
    }
    const hf = new HfInference(HF_TOKEN);

    const results = [];
    for (const caseData of cases) {
      const prompt = buildPrompt(caseData.ContentText, schema);

      // Call the LLM (adjust for your provider)
      const response = await hf.chatCompletion({
        model: MODEL,
        messages: [{ role: "user", content: prompt }],
        parameters: { max_new_tokens: 512, temperature: 0 },
      });

      const content = response.choices?.[0]?.message?.content || "";
      let presence = "Unknown";
      let extractedSchema = {};
      try {
        const parsed = typeof content === "string" ? JSON.parse(content) : content;
        presence = parsed["Pathology Presence"] || "Unknown";
        extractedSchema = parsed["Schema"] || {};
      } catch {
        // fallback: try to extract with regex or leave as unknown
      }

      // Calculate completion
      const totalFields = Object.keys(schema).length;
      const filledFields = Object.values(extractedSchema).filter(
        v => v !== "" && v !== null && v !== undefined && !(Array.isArray(v) && v.length === 0)
      ).length;
      const completion = totalFields > 0 ? filledFields / totalFields : 0;

      results.push({
        ...caseData,
        "Raw Extraction": content,
        "Pathology Presence": presence,
        "Schema Extraction": JSON.stringify(extractedSchema),
        "Fields Filled": filledFields,
        "Total Fields": totalFields,
        "Completion %": completion,
      });
    }

    return NextResponse.json({ processed: results });
  } catch (error) {
    console.error("Process error:", error);
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }
}