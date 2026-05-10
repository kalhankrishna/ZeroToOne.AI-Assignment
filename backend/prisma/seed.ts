import "dotenv/config.js";
import ExcelJS from "exceljs";
import path from "path";
import { fileURLToPath } from "url";
import { PrismaClient } from "../src/generated/prisma/client.js";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

// ─── Config ──────────────────────────────────────────────────────────────────

const EXCEL_PATH = path.resolve(__dirname, "../data/Taxonomy Data.xlsx");
const MODEL = "voyage-4-lite";
const OUTPUT_DIM = 1024;
const BATCH_SIZE = 128;
const FORCE = process.argv.includes("--force");

// ─── Sheet names (verified against actual file) ───────────────────────────────

const SHEETS = {
  location:    "location_taxonomy",
  transaction: "transaction_taxonomy",
  cg:          "cg_data_dictionary",
  cgValues:    "cg_field_values",
} as const;

// ─── Types ────────────────────────────────────────────────────────────────────

type SeedRow = {
  sourceType: "LOCATION" | "TRANSACTION" | "CG";
  label:      string;
  data:       object;
  textChunk:  string;
};

// ─── Parsers ──────────────────────────────────────────────────────────────────

/**
 * location_taxonomy
 * Verified columns: top_category (A), sub_category (B)
 * Skip rows where sub_category is empty — those are parent-only header rows.
 */
function parseLocation(sheet: ExcelJS.Worksheet): SeedRow[] {
  const rows: SeedRow[] = [];

  sheet.eachRow((row, i) => {
    if (i === 1) return; // skip header row

    const top = row.getCell(1).value?.toString()?.trim() ?? "";
    const sub = row.getCell(2).value?.toString()?.trim() ?? "";

    if (!top || !sub) return; // skip parent header rows

    const topClean = top.replace(/_/g, " ");
    const subClean = sub.replace(/_/g, " ");

    rows.push({
      sourceType: "LOCATION",
      label:      `${topClean} > ${subClean}`,
      data:       { type: "LOCATION", top_category: top, sub_category: sub },
      textChunk:  `${topClean} ${subClean}`,
    });
  });

  return rows;
}

/**
 * transaction_taxonomy
 * Verified columns: Level 1 (A), Level 2 (B), Level 3 (C), Level 4 (D)
 * Skip rows where everything below Level 1 is empty — parent-only rows.
 */
function parseTransaction(sheet: ExcelJS.Worksheet): SeedRow[] {
  const rows: SeedRow[] = [];

  sheet.eachRow((row, i) => {
    if (i === 1) return;

    const l1 = row.getCell(1).value?.toString()?.trim() ?? "";
    const l2 = row.getCell(2).value?.toString()?.trim() ?? "";
    const l3 = row.getCell(3).value?.toString()?.trim() ?? "";
    const l4 = row.getCell(4).value?.toString()?.trim() ?? "";

    if (!l1 || (!l2 && !l3 && !l4)) return;

    const parts    = [l1, l2, l3, l4].filter(Boolean);
    const fullPath = parts.join(" > ");

    rows.push({
      sourceType: "TRANSACTION",
      label:      fullPath,
      data: {
        type:   "TRANSACTION",
        level1: l1,
        level2: l2 || null,
        level3: l3 || null,
        level4: l4 || null,
      },
      textChunk: fullPath,
    });
  });

  return rows;
}

/**
 * cg_data_dictionary
 * Verified columns:
 *   A: Field Description
 *   B: Field Name
 *   C: Field Type      (BOOL | INT | ALPHA | ALPHA_NUM)
 *   D: Attributes      (count of distinct values — not stored, not needed)
 *   E: Field Values    (comma-separated codes for ALPHA/ALPHA_NUM, "#" for INT)
 *   F: Field Range Min (for INT fields)
 *   G: Field Range Max (for INT fields)
 *
 * Uses header-name lookup (colMap) so column order doesn't matter.
 * Throws if any required header is missing — fail loudly, not silently.
 *
 * All 7 fields are extracted. fieldValues/fieldRangeMin/fieldRangeMax are
 * stored in data JSON so the agent can validate signal values at query time.
 */
function parseCg(sheet: ExcelJS.Worksheet): SeedRow[] {
  const rows: SeedRow[] = [];

  // Build column index from header row
  const headerRow = sheet.getRow(1);
  const colMap: Record<string, number> = {};
  headerRow.eachCell((cell, col) => {
    const key = cell.value?.toString()?.trim() ?? "";
    if (key) colMap[key] = col;
  });

  // Fail loudly if any required header is missing
  const required = [
    "Field Description",
    "Field Name",
    "Field Type",
    "Field Values",
    "Field Range Min",
    "Field Range Max",
  ];
  for (const key of required) {
    if (!colMap[key]) {
      throw new Error(
        `cg_data_dictionary missing header: "${key}". Found: ${Object.keys(colMap).join(", ")}`
      );
    }
  }

  const COL = {
    description:   colMap["Field Description"],
    fieldName:     colMap["Field Name"],
    fieldType:     colMap["Field Type"],
    fieldValues:   colMap["Field Values"],
    fieldRangeMin: colMap["Field Range Min"],
    fieldRangeMax: colMap["Field Range Max"],
  };

  sheet.eachRow((row, i) => {
    if (i === 1) return;

    const field       = row.getCell(COL.fieldName).value?.toString()?.trim() ?? "";
    const description = row.getCell(COL.description).value?.toString()?.trim() ?? "";
    const fieldType   = row.getCell(COL.fieldType).value?.toString()?.trim() ?? "";
    const fieldValues = row.getCell(COL.fieldValues).value?.toString()?.trim() || null;
    const rawMin      = row.getCell(COL.fieldRangeMin).value;
    const rawMax      = row.getCell(COL.fieldRangeMax).value;

    if (!field) return;

    const fieldRangeMin = rawMin !== null && rawMin !== undefined && rawMin !== ""
      ? Number(rawMin) : null;
    const fieldRangeMax = rawMax !== null && rawMax !== undefined && rawMax !== ""
      ? Number(rawMax) : null;

    rows.push({
      sourceType: "CG",
      label:      description || field,
      data: {
        type: "CONSUMER_GRAPH",
        field,
        fieldType,
        // fieldValues: comma-separated valid codes for ALPHA/ALPHA_NUM (e.g. "f,m")
        //              "#" for INT fields (means "any number in range")
        //              "TRUE" or "FALSE,TRUE" for BOOL fields
        fieldValues,
        // fieldRangeMin/Max: only populated for INT fields, null otherwise
        fieldRangeMin,
        fieldRangeMax,
      },
      textChunk: [description, field].filter(Boolean).join(" "),
    });
  });

  return rows;
}

// ─── Embed ────────────────────────────────────────────────────────────────────

/**
 * Batch embed via Voyage AI.
 * input_type: "document" for seeding (use "query" at search time — they are asymmetric).
 */
async function embedBatched(texts: string[]): Promise<number[][]> {
  const result: number[][] = [];

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);
    console.log(`  Embedding ${i}–${i + batch.length} / ${texts.length}`);

    const res = await fetch("https://api.voyageai.com/v1/embeddings", {
      method:  "POST",
      headers: {
        Authorization:  `Bearer ${process.env.VOYAGE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        input:            batch,
        model:            MODEL,
        output_dimension: OUTPUT_DIM,
        input_type:       "document", // ⚠️ use "query" at search time
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Voyage API error: ${err}`);
    }

    const json = (await res.json()) as { data: { embedding: number[] }[] };
    for (const item of json.data) result.push(item.embedding);
  }

  return result;
}

// ─── Insert taxonomy_embeddings ───────────────────────────────────────────────

async function insertBatched(rows: SeedRow[], embeddings: number[][]): Promise<void> {
  const CHUNK = 50;

  for (let i = 0; i < rows.length; i += CHUNK) {
    await Promise.all(
      rows.slice(i, i + CHUNK).map((row, j) => {
        const vec = `[${embeddings[i + j].join(",")}]`;
        return prisma.$executeRaw`
          INSERT INTO "taxonomy_embeddings" ("sourceType", "label", "data", "textChunk", "embedding")
          VALUES (
            ${row.sourceType},
            ${row.label},
            ${JSON.stringify(row.data)}::jsonb,
            ${row.textChunk},
            ${vec}::vector
          )
        `;
      })
    );
  }
}

// ─── Seed cg_field_values (lookup table, no embedding) ───────────────────────

/**
 * cg_field_values
 * Verified columns: Field Name (A), Field Value (B), Field Value Description (C)
 * Plain insert — no embedding needed. Used at display time to decode codes → labels.
 */
async function seedCgFieldLookup(sheet: ExcelJS.Worksheet): Promise<void> {
  const rows: { fieldName: string; value: string; label: string }[] = [];

  sheet.eachRow((row, i) => {
    if (i === 1) return;

    const fieldName = row.getCell(1).value?.toString()?.trim() ?? "";
    const value     = row.getCell(2).value?.toString()?.trim() ?? "";
    const label     = row.getCell(3).value?.toString()?.trim() ?? "";

    if (!fieldName || !value || !label) return;
    rows.push({ fieldName, value, label });
  });

  console.log(`  Parsed: ${rows.length} rows`);

  const CHUNK = 100;
  for (let i = 0; i < rows.length; i += CHUNK) {
    await prisma.cgFieldLookup.createMany({
      data:           rows.slice(i, i + CHUNK),
      skipDuplicates: true,
    });
  }
}

async function seedUsers(): Promise<void> {
  const users = [
    { email: "admin@demo.com",   password: "admin123",   role: "ADMIN"   as const },
    { email: "planner@demo.com", password: "planner123", role: "PLANNER" as const },
  ]

  for (const u of users) {
    const existing = await prisma.user.findUnique({ where: { email: u.email } })
    if (existing) {
      console.log(`  ⏭  ${u.email} already exists — skipping`)
      continue
    }
    const passwordHash = await bcrypt.hash(u.password, 10)
    await prisma.user.create({
      data: { email: u.email, passwordHash, role: u.role }
    })
    console.log(`  ✓ Created ${u.role}: ${u.email}`)
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  // Guard: don't re-embed unless --force is passed
  const existing = await prisma.taxonomyEmbedding.count();
  if (existing > 0 && !FORCE) {
    console.log(
      `✅ Already seeded (${existing} taxonomy rows). Pass --force to re-seed.`
    );
    process.exit(0);
  }

  if (FORCE) {
    console.log("⚠️  --force passed — truncating and re-seeding...\n");
    await prisma.$executeRaw`TRUNCATE TABLE "taxonomy_embeddings" RESTART IDENTITY`;
    await prisma.$executeRaw`TRUNCATE TABLE "cg_field_lookup" RESTART IDENTITY`;
  }

  console.log("🌱 Seeding taxonomy...\n");

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(EXCEL_PATH);

  // ── Taxonomy embeddings (3 sheets) ──────────────────────────────────────────

  const embeddableSections = [
    { key: "location"    as const, name: SHEETS.location,    parser: parseLocation    },
    { key: "transaction" as const, name: SHEETS.transaction, parser: parseTransaction },
    { key: "cg"          as const, name: SHEETS.cg,          parser: parseCg          },
  ];

  for (const s of embeddableSections) {
    const sheet = workbook.getWorksheet(s.name);
    if (!sheet) {
      console.warn(`⚠️  Sheet "${s.name}" not found — skipping`);
      continue;
    }

    console.log(`📄 ${s.name}`);
    const rows = s.parser(sheet);
    console.log(`  Parsed: ${rows.length} rows`);

    const embeddings = await embedBatched(rows.map((r) => r.textChunk));
    await insertBatched(rows, embeddings);
    console.log(`  ✓ Inserted\n`);
  }

  // ── CG field lookup (no embedding) ──────────────────────────────────────────

  const cgValuesSheet = workbook.getWorksheet(SHEETS.cgValues);
  if (!cgValuesSheet) {
    console.warn(`⚠️  Sheet "${SHEETS.cgValues}" not found — skipping`);
  } else {
    console.log(`📄 ${SHEETS.cgValues}`);
    await seedCgFieldLookup(cgValuesSheet);
    console.log(`  ✓ Inserted\n`);
  }

  // ── Users ────────────────────────────────────────────────────────────────────
  console.log("👤 Seeding users...")
  await seedUsers()
  console.log("")

  // ── Summary ──────────────────────────────────────────────────────────────────

  const totalEmbeddings = await prisma.taxonomyEmbedding.count();
  const totalLookups    = await prisma.cgFieldLookup.count();
  console.log(`✅ Done.`);
  console.log(`   taxonomy_embeddings: ${totalEmbeddings} rows`);
  console.log(`   cg_field_lookup:     ${totalLookups} rows`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());