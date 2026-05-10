import type { Request, Response, NextFunction } from 'express';
import { Prisma } from '../generated/prisma/client.js';

export function errorHandler(err: unknown, req: Request, res: Response, next: NextFunction): void {
	console.error('[error]', err);

	if (err instanceof Prisma.PrismaClientKnownRequestError) {
		if (err.code === 'P2025') {
			res.status(404).json({ error: 'Resource not found.' });
			return;
		}
		if (err.code === 'P2003') {
			res.status(400).json({ error: 'Invalid reference — related record not found.' });
			return;
		}
	}

	if (err instanceof SyntaxError && 'body' in err) {
		res.status(400).json({ error: 'Invalid JSON in request body.' });
		return;
	}

	if (err instanceof Error && err.name === 'JsonWebTokenError') {
		res.status(401).json({ error: 'Invalid token.' });
		return;
	}

	if (err instanceof Error && err.name === 'TokenExpiredError') {
		res.status(401).json({ error: 'Token expired.' });
		return;
	}

	res.status(500).json({ error: 'An unexpected error occurred. Please try again.' });
}
