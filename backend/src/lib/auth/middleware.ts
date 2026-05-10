import type { Request, Response, NextFunction } from 'express';
import { verifyToken, COOKIE_NAME } from './jwt.js';
import { prisma } from '../prisma.js';

export function requireAuth(req: Request, res: Response, next: NextFunction) {
	const token = req.cookies?.[COOKIE_NAME];

	if (!token) {
		res.status(401).json({ error: 'Authentication required' });
		return;
	}

	try {
		const payload = verifyToken(token);
		req.user = payload;
		next();
	} catch {
		res.status(401).json({ error: 'Invalid or expired token' });
	}
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
	if (req.user?.role !== 'ADMIN') {
		res.status(403).json({ error: 'Admin access required' });
		return;
	}
	next();
}

export async function requireOwnership(req: Request, res: Response, next: NextFunction) {
	const conversationId = req.params.conversationId;

	if (!conversationId || Array.isArray(conversationId)) {
		res.status(400).json({ error: 'conversationId param required' });
		return;
	}

	const conversation = await prisma.conversation.findUnique({
		where: { id: conversationId },
	});

	if (!conversation) {
		res.status(404).json({ error: 'Conversation not found' });
		return;
	}

	if (req.user!.role !== 'ADMIN' && conversation.userId !== req.user!.userId) {
		res.status(403).json({ error: 'Not your conversation' });
		return;
	}

	req.conversation = conversation;
	next();
}
