// app/api/openai/verify/route.ts
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { apiKey, model } = await req.json();

    if (!apiKey) {
      return NextResponse.json({ error: "API key required" }, { status: 400 });
    }

    // Try listing available models from OpenAI
    const resp = await fetch("https://api.openai.com/v1/models", {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
    });

    if (!resp.ok) {
      const errorBody = await resp.text();
      return NextResponse.json(
        { error: `OpenAI error: ${resp.status} ${errorBody}` },
        { status: resp.status }
      );
    }

    const data = await resp.json();

    // Optionally check if the chosen model is in the returned list
    const models = data.data.map((m: any) => m.id);
    const validModel = model && models.includes(model);

    return NextResponse.json({ models, validModel });
  } catch (err: any) {
    console.error("Verify error:", err);
    return NextResponse.json(
      { error: err.message || "Internal server error" },
      { status: 500 }
    );
  }
}
