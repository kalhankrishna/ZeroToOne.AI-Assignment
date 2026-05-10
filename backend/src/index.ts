import 'dotenv/config.js';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { errorHandler } from './lib/errorHandler.js';
import { authRouter } from './routes/auth.js';
import { usersRouter } from './routes/users.js';
import { conversationsRouter } from './routes/conversations.js';

const app = express();
const PORT = process.env.PORT ?? 3000;

app.set('trust proxy', 1);

const apiLimiter = rateLimit({
	windowMs: 15 * 60 * 1000,
	max: 100,
	message: { error: 'Too many requests, please try again later.' },
	standardHeaders: true,
	legacyHeaders: false,
});

const agentLimiter = rateLimit({
	windowMs: 60 * 1000,
	max: 10,
	message: { error: 'Message rate limit exceeded. Please slow down.' },
	standardHeaders: true,
	legacyHeaders: false,
});

app.use(helmet());
app.use(apiLimiter);
app.use('/api/conversations/:conversationId/messages', agentLimiter);

const ALLOWED_ORIGINS = [
  process.env.FRONTEND_URL ?? "https://zero-to-one-ai-assignment-frontend.vercel.app",
  "http://localhost:5173",
];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
    callback(new Error(`CORS policy: origin ${origin} not allowed.`));
  },
  credentials: true,
  methods:     ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
}));

app.use(express.json({ limit: '10kb' }));
app.use(cookieParser());

app.use('/auth', authRouter);
app.use('/users', usersRouter);
app.use('/conversations', conversationsRouter);

app.get('/health', (_req, res) => {
	res.json({ status: 'ok' });
});

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
	console.error('Unhandled error:', err);
	res.status(500).json({ error: 'Internal server error' });
});

app.use(errorHandler);

app.listen(PORT, () => {
	console.log(`Server running on port ${PORT}`);
});

export { app };
