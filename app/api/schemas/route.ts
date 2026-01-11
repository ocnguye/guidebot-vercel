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

        // Try to find the blob entry via the SDK list and fetch its URL
        try {
          const result = await list({ prefix: `schemas/${safeName}` });
          const listArray = Array.isArray(result?.blobs) ? result.blobs : (Array.isArray(result) ? result : []);
          const blobEntry = listArray[0];
          const url = blobEntry?.url || blobEntry?.downloadUrl || null;
          if (!url) {
            return NextResponse.json({ error: "Schema not found" }, { status: 404 });
          }
          const res = await fetch(url, { cache: "no-store" });
          if (!res.ok) return NextResponse.json({ error: "Schema not found" }, { status: 404 });
          const schema = await res.json();
          return NextResponse.json(schema);
        } catch (err) {
          console.warn("Error fetching single schema via blob list:", err);
          return NextResponse.json({ error: "Schema not found" }, { status: 404 });
        }
    }

    // ------------------------------
    // List all schemas
    // ------------------------------
    const blobs = await list({ prefix: "schemas/" });

    const listArray = Array.isArray(blobs?.blobs) ? blobs.blobs : (Array.isArray(blobs) ? blobs : []);

    const items = listArray.map((blob: any) => {
      // blob path/name can be in different properties depending on provider response
      const rawPath = blob.pathname || blob.path || blob.name || blob.key || blob.filename || null;
      // Fallback: derive name from URL if nothing else
      const urlFallback = blob.url || blob.downloadUrl || blob.href || null;
      const fallbackPathFromUrl = urlFallback ? urlFallback.split("/").pop() : null;
      const effectivePath = rawPath || fallbackPathFromUrl || "";

      const name = effectivePath.replace(/^schemas\//, "").replace(/\.json$/, "");
      const blobUrl = blob.url || blob.downloadUrl || blob.href || null;

      return {
        name,
        blobUrl,
        size: blob.size || blob.length || null,
        uploadedAt: blob.uploadedAt || blob.createdAt || null,
      };
    });

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
