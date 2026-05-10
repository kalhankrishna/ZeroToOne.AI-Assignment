import { Prisma } from "../../generated/prisma/client.js";
import { prisma } from "../prisma.js";
import pgvector from "pgvector";
import { pool } from "../pgClient.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export type SourceType = "LOCATION" | "TRANSACTION" | "CG";

export interface SearchResult {
  label: string;
  score: number;
  zone: "high" | "medium" | "low";
  // CG-only
  field?: string;
  fieldType?: "BOOL" | "INT" | "ALPHA" | "ALPHA_NUM";
  fieldRangeMin?: number | null;
  fieldRangeMax?: number | null;
  decodedValues?: { value: string; label: string }[];
  // LOCATION-only
  top_category?: string;
  sub_category?: string;
  // TRANSACTION-only
  level1?: string;
  level2?: string | null;
  level3?: string | null;
  level4?: string | null;
}

export interface ToolSearchResult {
  query: string;
  sourceType: string;
  results: SearchResult[];
  best_score: number;
  direct_match: boolean;
  hint?: string;
}

// ─── Voyage Embedding ─────────────────────────────────────────────────────────

export async function embedQuery(query: string): Promise<number[]> {
  const response = await fetch("https://api.voyageai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.VOYAGE_API_KEY}`,
    },
    body: JSON.stringify({
      input: [query],
      model: "voyage-4-lite",
      input_type: "query",
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Voyage API error ${response.status}: ${err}`);
  }

  const json = (await response.json()) as {
    data: { embedding: number[] }[];
  };

  return json.data[0].embedding;
}

// ─── Zone Assessment ──────────────────────────────────────────────────────────

function assessZone(score: number): "high" | "medium" | "low" {
  if (score > 0.75) return "high";
  if (score >= 0.4) return "medium";
  return "low";
}

// ─── ALPHA Decoding ───────────────────────────────────────────────────────────

async function decodeAlphaValues(
  fieldName: string,
  fieldValues: string | null
): Promise<{ value: string; label: string }[]> {
  if (!fieldValues || fieldValues === "#") return [];

  const codes = fieldValues
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean);

  if (codes.length === 0) return [];

  const rows = await prisma.cgFieldLookup.findMany({
    where: {
      fieldName: { equals: fieldName, mode: "insensitive" },
      value: { in: codes },
    },
  });

  return rows.map((r) => ({ value: r.value, label: r.label }));
}

// ─── Misrouting Hint ──────────────────────────────────────────────────────────

function generateHint(
  query: string,
  sourceType: SourceType,
  bestScore: number
): string | undefined {
  if (bestScore > 0.4) return undefined;

  const q = query.toLowerCase();

  const locationKw = ["store", "visit", "restaurant", "gym", "venue", "place", "center", "mall", "clinic", "hospital", "shop"];
  const txnKw = ["buy", "purchase", "spend", "transaction", "order", "shop for"];
  const cgKw = ["age", "gender", "income", "interest", "lifestyle", "household", "credit", "invest", "education"];

  if (sourceType !== "LOCATION" && locationKw.some((k) => q.includes(k))) {
    return "Low match. This query looks location-based — try search_location_taxonomy instead.";
  }
  if (sourceType !== "TRANSACTION" && txnKw.some((k) => q.includes(k))) {
    return "Low match. This query looks transaction-based — try search_transaction_taxonomy instead.";
  }
  if (sourceType !== "CG" && cgKw.some((k) => q.includes(k))) {
    return "Low match. This query looks demographic — try search_cg_fields instead.";
  }

  return undefined;
}

// ─── Core Search ──────────────────────────────────────────────────────────────

export async function searchTaxonomy(input: {
  query: string;
  conversationId: string;
  sourceType: SourceType;
  topK?: number;
}): Promise<ToolSearchResult> {
  const topK = input.topK ?? 5;

  // 1. Embed the query
  const embeddingArray = await embedQuery(input.query);
  const vec = pgvector.toSql(embeddingArray);

  // 2. pgvector cosine similarity search
  const { rows: raw } = await pool.query<{
    label: string;
    data: Record<string, unknown>;
    score: number;
  }>(
    `SELECT
        label,
        data,
        1 - (embedding <=> $1::vector) AS score
    FROM taxonomy_embeddings
    WHERE "sourceType" = $2
    ORDER BY embedding <=> $1::vector
    LIMIT $3`,
    [vec, input.sourceType, topK]
  );

  // 3. Build results: assess zones, decode ALPHA values, strip internal fields
  const results: SearchResult[] = await Promise.all(
    raw.map(async (row) => {
      const score = Number(row.score);
      const zone = assessZone(score);
      const data = row.data;

      // Build result — explicitly map fields, never blind-spread data
      // This prevents internal fields like fieldValues leaking to Claude
      const result: SearchResult = {
        label: row.label,
        score,
        zone,
      };

      if (input.sourceType === "LOCATION") {
        result.top_category = data.top_category as string;
        result.sub_category = data.sub_category as string;
      }

      if (input.sourceType === "TRANSACTION") {
        result.level1 = data.level1 as string;
        result.level2 = (data.level2 as string) ?? null;
        result.level3 = (data.level3 as string) ?? null;
        result.level4 = (data.level4 as string) ?? null;
      }

      if (input.sourceType === "CG") {
        result.field = data.field as string;
        result.fieldType = data.fieldType as SearchResult["fieldType"];
        result.fieldRangeMin = (data.fieldRangeMin as number) ?? null;
        result.fieldRangeMax = (data.fieldRangeMax as number) ?? null;

        if (
          data.fieldType === "ALPHA" ||
          data.fieldType === "ALPHA_NUM"
        ) {
          result.decodedValues = await decodeAlphaValues(
            data.field as string,
            data.fieldValues as string | null
          );
        }
      }

      return result;
    })
  );

  const best_score = results[0]?.score ?? 0;
  const direct_match = results.some((r) => r.zone === "high");
  const hint = generateHint(input.query, input.sourceType, best_score);

  return {
    query: input.query,
    sourceType: input.sourceType,
    results,
    best_score,
    direct_match,
    ...(hint ? { hint } : {}),
  };
}

// ─── Three Thin Wrappers ──────────────────────────────────────────────────────

export async function handleSearchCgFields(input: {
  query: string;
  conversationId: string;
}): Promise<ToolSearchResult> {
  return searchTaxonomy({ ...input, sourceType: "CG" });
}

export async function handleSearchLocation(input: {
  query: string;
  conversationId: string;
}): Promise<ToolSearchResult> {
  return searchTaxonomy({ ...input, sourceType: "LOCATION" });
}

export async function handleSearchTransaction(input: {
  query: string;
  conversationId: string;
}): Promise<ToolSearchResult> {
  return searchTaxonomy({ ...input, sourceType: "TRANSACTION" });
}