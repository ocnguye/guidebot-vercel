import { NextRequest, NextResponse } from "next/server";
import { HfInference } from "@huggingface/inference";
import * as XLSX from "xlsx";
import { jsonrepair } from "jsonrepair";

const HF_TOKEN = process.env.GUIDEBOT3;
const MODEL = "Qwen/Qwen3-Next-80B-A3B-Instruct";

// Helper to parse Excel/CSV buffer to array of objects
function parseFileToCases(buffer: Buffer, filename: string): any[] {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheetName = workbook.SheetNames[0];
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);
  return rows;
}

export async function POST(req: NextRequest) {
  try {
    // Check if multipart/form-data (file upload)
    const contentType = req.headers.get("content-type") || "";
    let cases: any[] = [];

    if (contentType.includes("multipart/form-data")) {
      // Parse the form data
      const formData = await req.formData();
      const file = formData.get("file") as File;
      if (!file) {
        return NextResponse.json({ error: "No file uploaded." }, { status: 400 });
      }
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      cases = parseFileToCases(buffer, file.name);
    } else {
      // Assume JSON body with { cases }
      const body = await req.json();
      cases = body.cases;
    }

    if (!HF_TOKEN || !cases || !Array.isArray(cases) || cases.length === 0) {
      return NextResponse.json({ error: "HF token and cases required." }, { status: 400 });
    }

    const prompt = `
Given the following radiology report examples, suggest a simple JSON schema for extracting key fields. 
Each field should have: type ("radio" or "list"), description, options (if applicable), max_points, key_field.
Respond with only the JSON schema as a markdown code block.

Examples:
${cases.map((c, i) => `Case ${i + 1}:\n${c.ContentText || JSON.stringify(c)}`).join("\n\n")}
`;

    const hf = new HfInference(HF_TOKEN);

    const response = await hf.chatCompletion({
      model: MODEL,
      messages: [
        {
          role: "system",
          content: "You are a helpful assistant that generates JSON schemas for radiology report extraction.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      max_tokens: 1024,
      temperature: 0.2,
    }) as {
      choices?: Array<{
        message?: { content?: string };
        generated_text?: string;
      }>;
      generated_text?: string;
    };

    const content: string =
      response.choices?.[0]?.message?.content ||
      response.generated_text ||
      response.choices?.[0]?.generated_text ||
      "";

    // Try to extract JSON from markdown code block
    let match = content.match(/```json\s*([\s\S]*?)```/i);
    let schema = null;
    let parseError = null;

    if (match) {
      try {
        schema = JSON.parse(match[1]);
      } catch (err: any) {
        // Try to repair JSON if parsing fails
        try {
          schema = JSON.parse(jsonrepair(match[1]));
        } catch (repairErr: any) {
          parseError = repairErr.message;
        }
      }
    } else {
      // Try to find any JSON in the output, even if not in a code block
      const jsonMatch = content.match(/{[\s\S]*}/);
      if (jsonMatch) {
        try {
          schema = JSON.parse(jsonMatch[0]);
        } catch (err: any) {
          // Try to repair JSON if parsing fails
          try {
            schema = JSON.parse(jsonrepair(jsonMatch[0]));
          } catch (repairErr: any) {
            parseError = repairErr.message;
          }
        }
      }
    }

    if (!schema) {
      console.error("Model output:", content);
      console.error("Parse error:", parseError);
      return NextResponse.json(
        {
          error: "Could not parse schema from model output.",
          modelOutput: content,
          parseError: parseError || "No JSON found in model output."
        },
        { status: 500 }
      );
    }

    return NextResponse.json({ schema });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Internal server error" },
      { status: 500 }
    );
  }
}