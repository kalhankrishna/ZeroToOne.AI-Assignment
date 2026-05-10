import "dotenv/config.js";
import pg from "pg";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

async function setup() {
  const client = await pool.connect();
  try {
    console.log("Creating HNSW index...");
    await client.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS taxonomy_embeddings_embedding_idx
      ON taxonomy_embeddings USING hnsw (embedding vector_cosine_ops)
      WITH (m = 16, ef_construction = 64)
    `);
    console.log("SUCCESFULLY CREATED HNSW INDEXES");
  } finally {
    client.release();
    await pool.end();
  }
}

setup().catch((err) => {
  console.error(err);
  process.exit(1);
});