import "dotenv/config.js";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import { errorHandler } from "./lib/errorHandler.js";
import { authRouter } from "./routes/auth.js";
import { usersRouter } from "./routes/users.js";
import { conversationsRouter } from "./routes/conversations.js";

const app = express();
const PORT = process.env.PORT ?? 3000;

// General API rate limit
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max:      100,
  message:  { error: "Too many requests, please try again later." },
  standardHeaders: true,
  legacyHeaders:   false,
});

// Stricter limit for agent endpoint — protects Anthropic credits
const agentLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max:      10,        // 10 messages per minute per IP
  message:  { error: "Message rate limit exceeded. Please slow down." },
  standardHeaders: true,
  legacyHeaders:   false,
});

// ─── Global middleware ────────────────────────────────────────────────────────

app.use(helmet());
app.use(apiLimiter);
app.use("/api/conversations/:conversationId/messages", agentLimiter);

app.use(
  cors({
    origin: process.env.FRONTEND_URL ?? "http://localhost:5173",
    credentials: true,
  })
);

app.use(express.json({ limit: "10kb" }));
app.use(cookieParser());

// ─── Routes ───────────────────────────────────────────────────────────────────

app.use("/auth", authRouter);
app.use("/users", usersRouter);
app.use("/conversations", conversationsRouter);

// Health check
app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

// ─── Global error handler ─────────────────────────────────────────────────────

app.use(
  (
    err: Error,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction
  ) => {
    console.error("Unhandled error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
);

app.use(errorHandler);

// ─── Start ────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

export { app };