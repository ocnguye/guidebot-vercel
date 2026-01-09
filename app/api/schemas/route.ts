import { NextRequest, NextResponse } from "next/server";
import { put, list } from "@vercel/blob";

export const runtime = "nodejs";

/* ----------------------------------------
   Helpers
---------------------------------------- */

function sanitizeName(name: string) {
  return name.replace(/[^a-zA-Z0-9_-]/g, "_");
}

/* ----------------------------------------
   GET: list schemas OR fetch a schema
---------------------------------------- */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const name = searchParams.get("name");

    // ------------------------------
    // Fetch single schema
    // ------------------------------
    if (name) {
      const safeName = sanitizeName(name);
      const targetPath = `schemas/${safeName}.json`;

      const blobs = await list({ prefix: "schemas/" });
      const blob = blobs.blobs.find(b => b.pathname === targetPath);

      if (!blob) {
        return NextResponse.json(
          { error: "Schema not found" },
          { status: 404 }
        );
      }

      const res = await fetch(blob.url, { cache: "no-store" });

      if (!res.ok) {
        return NextResponse.json(
          { error: "Failed to fetch schema blob" },
          { status: 500 }
        );
      }

      const schema = await res.json();
      return NextResponse.json(schema);
    }

    // ------------------------------
    // List all schemas
    // ------------------------------
    const blobs = await list({ prefix: "schemas/" });

    const items = blobs.blobs.map(blob => ({
      name: blob.pathname
        .replace("schemas/", "")
        .replace(/\.json$/, ""),
      blobUrl: blob.url,
      size: blob.size,
      uploadedAt: blob.uploadedAt,
    }));

    return NextResponse.json(items);
  } catch (error) {
    console.error("GET /api/schemas error:", error);
    return NextResponse.json(
      { error: "Failed to get schemas" },
      { status: 500 }
    );
  }
}

/* ----------------------------------------
   POST: upload schema to schemas/
---------------------------------------- */

export async function POST(request: NextRequest) {
  try {
    const { name, schema } = await request.json();

    if (!name || typeof schema !== "object") {
      return NextResponse.json(
        { error: "Invalid name or schema" },
        { status: 400 }
      );
    }

    const safeName = sanitizeName(name);
    const pathname = `schemas/${safeName}.json`;

    const blob = await put(pathname, JSON.stringify(schema, null, 2), {
      access: "public",
      contentType: "application/json",
    });

    return NextResponse.json({
      success: true,
      name: safeName,
      blobUrl: blob.url,
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "Failed to save schema" },
      { status: 500 }
    );
  }
}
