import { Router } from 'express';
import type { Request, Response } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requireAdmin } from '../lib/auth/middleware.js';

export const usersRouter = Router();
usersRouter.use(requireAuth, requireAdmin);


usersRouter.patch('/:id/role', async (req: Request, res: Response) => {
	const id = req.params.id;
	const { role } = req.body;

	if (!id || Array.isArray(id)) {
		res.status(400).json({ error: 'User id param required' });
		return;
	}

	if (!role || !['ADMIN', 'PLANNER'].includes(role)) {
		res.status(400).json({ error: 'role must be ADMIN or PLANNER' });
		return;
	}

	const user = await prisma.user.findUnique({ where: { id } });
	if (!user) {
		res.status(404).json({ error: 'User not found' });
		return;
	}

	const updated = await prisma.user.update({
		where: { id },
		data: { role },
		select: { id: true, email: true, role: true },
	});

	res.json({ user: updated });
});

usersRouter.get('/', async (_req: Request, res: Response) => {
	const users = await prisma.user.findMany({
		select: { id: true, email: true, role: true, createdAt: true },
		orderBy: { createdAt: 'asc' },
	});

	res.json({ users });
});
