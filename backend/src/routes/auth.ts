import { Router } from 'express';
import type { Request, Response } from 'express';
import { prisma } from '../lib/prisma.js';
import { hashPassword, comparePassword } from '../lib/auth/passwords.js';
import { signToken, COOKIE_NAME, COOKIE_OPTIONS } from '../lib/auth/jwt.js';
import { requireAuth } from '../lib/auth/middleware.js';

export const authRouter = Router();

authRouter.post('/register', async (req: Request, res: Response) => {
	const { email, password } = req.body;

	if (!email || !password) {
		res.status(400).json({ error: 'email and password required' });
		return;
	}

	if (typeof email !== 'string' || typeof password !== 'string') {
		res.status(400).json({ error: 'email and password must be strings' });
		return;
	}

	if (password.length < 6) {
		res.status(400).json({ error: 'Password must be at least 6 characters' });
		return;
	}

	const existing = await prisma.user.findUnique({ where: { email } });
	if (existing) {
		res.status(409).json({ error: 'Email already registered' });
		return;
	}

	const passwordHash = await hashPassword(password);
	const user = await prisma.user.create({
		data: { email, passwordHash, role: 'PLANNER' },
	});

	const token = signToken({ userId: user.id, role: user.role });
	res.cookie(COOKIE_NAME, token, COOKIE_OPTIONS);

	res.status(201).json({
		user: { id: user.id, email: user.email, role: user.role },
	});
});

authRouter.post('/login', async (req: Request, res: Response) => {
	const { email, password } = req.body;

	if (!email || !password) {
		res.status(400).json({ error: 'email and password required' });
		return;
	}

	const user = await prisma.user.findUnique({ where: { email } });
	if (!user) {
		res.status(401).json({ error: 'Invalid credentials' });
		return;
	}

	const valid = await comparePassword(password, user.passwordHash);
	if (!valid) {
		res.status(401).json({ error: 'Invalid credentials' });
		return;
	}

	const token = signToken({ userId: user.id, role: user.role });
	res.cookie(COOKIE_NAME, token, COOKIE_OPTIONS);

	res.json({
		user: { id: user.id, email: user.email, role: user.role },
	});
});

authRouter.post('/logout', (_req: Request, res: Response) => {
	res.clearCookie(COOKIE_NAME, { path: '/' });
	res.json({ message: 'Logged out' });
});

authRouter.get('/me', requireAuth, async (req: Request, res: Response) => {
	const user = await prisma.user.findUnique({
		where: { id: req.user!.userId },
		select: { id: true, email: true, role: true, createdAt: true },
	});

	if (!user) {
		res.status(404).json({ error: 'User not found' });
		return;
	}

	res.json({ user });
});
