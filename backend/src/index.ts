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

app.use(
	cors({
		origin: process.env.FRONTEND_URL ?? 'http://localhost:5173',
		credentials: true,
	}),
);

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
