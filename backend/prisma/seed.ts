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

const EXCEL_PATH = path.resolve(__dirname, "../data/Taxonomy Data.xlsx");
const MODEL = "voyage-4-lite";
const OUTPUT_DIM = 1024;
const BATCH_SIZE = 128;
const FORCE = process.argv.includes("--force");

const SHEETS = {
  location:    "location_taxonomy",
  transaction: "transaction_taxonomy",
  cg:          "cg_data_dictionary",
  cgValues:    "cg_field_values",
} as const;

type SeedRow = {
  sourceType: "LOCATION" | "TRANSACTION" | "CG";
  label:      string;
  data:       object;
  textChunk:  string;
};

function parseLocation(sheet: ExcelJS.Worksheet): SeedRow[] {
  const rows: SeedRow[] = [];

  sheet.eachRow((row, i) => {
    if (i === 1) return;

    const top = row.getCell(1).value?.toString()?.trim() ?? "";
    const sub = row.getCell(2).value?.toString()?.trim() ?? "";

    if (!top || !sub) return;

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

function parseCg(sheet: ExcelJS.Worksheet): SeedRow[] {
  const rows: SeedRow[] = [];

  const headerRow = sheet.getRow(1);
  const colMap: Record<string, number> = {};
  headerRow.eachCell((cell, col) => {
    const key = cell.value?.toString()?.trim() ?? "";
    if (key) colMap[key] = col;
  });

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
        fieldValues,
        fieldRangeMin,
        fieldRangeMax,
      },
      textChunk: [description, field].filter(Boolean).join(" "),
    });
  });

  return rows;
}

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
        input_type:       "document",
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

async function main() {
  const existing = await prisma.taxonomyEmbedding.count();
  if (existing > 0 && !FORCE) {
    console.log(
      `Already seeded (${existing} taxonomy rows). Pass --force to re-seed.`
    );
    process.exit(0);
  }

  if (FORCE) {
    console.log("WARNING!!!:  --force passed — truncating and re-seeding...\n");
    await prisma.$executeRaw`TRUNCATE TABLE "taxonomy_embeddings" RESTART IDENTITY`;
    await prisma.$executeRaw`TRUNCATE TABLE "cg_field_lookup" RESTART IDENTITY`;
  }

  console.log("Seeding taxonomy...\n");

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(EXCEL_PATH);

  const embeddableSections = [
    { key: "location"    as const, name: SHEETS.location,    parser: parseLocation    },
    { key: "transaction" as const, name: SHEETS.transaction, parser: parseTransaction },
    { key: "cg"          as const, name: SHEETS.cg,          parser: parseCg          },
  ];

  for (const s of embeddableSections) {
    const sheet = workbook.getWorksheet(s.name);
    if (!sheet) {
      console.warn(`WARNING!!!:  Sheet "${s.name}" not found — skipping`);
      continue;
    }

    console.log(`Sheets: ${s.name}`);
    const rows = s.parser(sheet);
    console.log(`  Parsed: ${rows.length} rows`);

    const embeddings = await embedBatched(rows.map((r) => r.textChunk));
    await insertBatched(rows, embeddings);
    console.log(`  SUCCESS!!!: Inserted\n`);
  }

  const cgValuesSheet = workbook.getWorksheet(SHEETS.cgValues);
  if (!cgValuesSheet) {
    console.warn(`WARNING!!!:  Sheet "${SHEETS.cgValues}" not found — skipping`);
  } else {
    console.log(`Sheets: ${SHEETS.cgValues}`);
    await seedCgFieldLookup(cgValuesSheet);
    console.log(`  SUCCESS!!!: Inserted\n`);
  }

  // ── Users ────────────────────────────────────────────────────────────────────
  console.log(" Seeding users...")
  await seedUsers()
  console.log("")

  // ── Summary ──────────────────────────────────────────────────────────────────

  const totalEmbeddings = await prisma.taxonomyEmbedding.count();
  const totalLookups    = await prisma.cgFieldLookup.count();
  console.log(`Done.`);
  console.log(`   taxonomy_embeddings: ${totalEmbeddings} rows`);
  console.log(`   cg_field_lookup:     ${totalLookups} rows`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());