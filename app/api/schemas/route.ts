import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs/promises";

const SCHEMA_DIR = path.join(process.cwd(), "data", "schemas");

// Ensure schema directory exists
async function ensureSchemaDir() {
  try {
    await fs.access(SCHEMA_DIR);
  } catch {
    await fs.mkdir(SCHEMA_DIR, { recursive: true });
  }
}

export async function GET(request: NextRequest) {
  try {
    await ensureSchemaDir();
    const { searchParams } = new URL(request.url);
    const name = searchParams.get("name");

    if (name) {
      // Sanitize name to prevent path traversal
      const safeName = name.replace(/[^a-zA-Z0-9_\- ]/g, "").replace(/\s+/g, "_");
      const filePath = path.join(SCHEMA_DIR, `${safeName}.json`);
      try {
        const content = await fs.readFile(filePath, "utf8");
        return NextResponse.json(JSON.parse(content));
      } catch {
        return NextResponse.json({ error: "Schema not found" }, { status: 404 });
      }
    } else {
      const files = await fs.readdir(SCHEMA_DIR);
      // Return just the schema names (without .json)
      const schemas = files
        .filter((f) => f.endsWith(".json"))
        .map((f) => f.replace(/\.json$/, ""));
      return NextResponse.json(schemas);
    }
  } catch (error) {
    return NextResponse.json({ error: "Failed to list schemas" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    await ensureSchemaDir();
    const { name, schema } = await request.json();
    if (!name || typeof name !== "string" || !schema || typeof schema !== "object") {
      return NextResponse.json({ error: "Invalid schema or name" }, { status: 400 });
    }
    // Sanitize name to prevent path traversal
    const safeName = name.replace(/[^a-zA-Z0-9_\- ]/g, "").replace(/\s+/g, "_");
    const filePath = path.join(SCHEMA_DIR, `${safeName}.json`);
    await fs.writeFile(filePath, JSON.stringify(schema, null, 2));
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: "Failed to save schema" }, { status: 500 });
  }
}