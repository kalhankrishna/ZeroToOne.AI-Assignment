import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requireOwnership } from '../lib/auth/middleware.js';
import { runAgentLoop, generateConversationTitle } from '../lib/agent/index.js';

const router = Router();
router.use(requireAuth);

router.get('/', async (req, res) => {
	const where = req.user!.role === 'ADMIN' ? {} : { userId: req.user!.userId };

	const conversations = await prisma.conversation.findMany({
		where,
		orderBy: { updatedAt: 'desc' },
		select: {
			id: true,
			title: true,
			status: true,
			createdAt: true,
			updatedAt: true,
			_count: { select: { messages: true, signals: true } },
			user: { select: { email: true } },
		},
	});

	res.json(conversations);
});

router.post('/', async (req, res) => {
	const conversation = await prisma.conversation.create({
		data: {
			userId: req.user!.userId,
			title: req.body.title ?? null,
		},
	});

	res.status(201).json(conversation);
});

router.get('/:conversationId', requireOwnership, async (req, res) => {
	const conversation = await prisma.conversation.findUnique({
		where: { id: req.params.conversationId as string },
		include: {
			messages: { orderBy: { createdAt: 'asc' } },
			signals: { orderBy: { createdAt: 'asc' } },
			estimate: true,
		},
	});

	res.json(conversation);
});

router.delete('/:conversationId', requireOwnership, async (req, res) => {
	const id = req.params.conversationId;

	if (!id || Array.isArray(id)) {
		res.status(400).json({ error: 'User id param required' });
		return;
	}

	await prisma.$transaction([
		prisma.audienceEstimate.deleteMany({ where: { conversationId: id } }),
		prisma.signal.deleteMany({ where: { conversationId: id } }),
		prisma.message.deleteMany({ where: { conversationId: id } }),
		prisma.conversation.delete({ where: { id } }),
	]);

	res.status(204).send();
});

router.patch('/:conversationId/status', requireOwnership, async (req, res) => {
	const { status } = req.body;

	const valid = ['BUILDING', 'CONFIRMED', 'SIZED'] as const;
	if (!valid.includes(status)) {
		res.status(400).json({ error: `Invalid status. Must be one of: ${valid.join(', ')}` });
		return;
	}

	const conversation = req.conversation!;

	if (conversation.status === 'SIZED' && status !== 'SIZED') {
		res.status(400).json({ error: 'Cannot change status after audience is sized.' });
		return;
	}

	const updated = await prisma.conversation.update({
		where: { id: req.params.id as string },
		data: { status },
	});

	res.json(updated);
});

router.post('/:conversationId/messages', requireOwnership, async (req, res) => {
	const conversation = req.conversation!;
	const content = req.body.content?.trim();

	if (!content) {
		res.status(400).json({ error: 'Message content is required.' });
		return;
	}

	const historyRows = await prisma.message.findMany({
		where: { conversationId: conversation.id },
		orderBy: { createdAt: 'desc' },
		take: 20,
	});
	historyRows.reverse();

	const currentSignals = await prisma.signal.findMany({
		where: { conversationId: conversation.id },
		orderBy: { createdAt: 'asc' },
	});

	await prisma.message.create({
		data: {
			conversationId: conversation.id,
			role: 'USER',
			content,
		},
	});

	const messageCount = await prisma.message.count({
		where: { conversationId: conversation.id },
	});

	if (messageCount === 1) {
		generateConversationTitle(conversation.id, content).catch(() => {});
	}

	const result = await runAgentLoop({
		conversationId: conversation.id,
		userMessage: content,
		history: historyRows.map((m) => ({
			role: m.role === 'USER' ? ('user' as const) : ('assistant' as const),
			content: m.content,
		})),
		signals: currentSignals.map((s) => ({
			id: s.id,
			type: s.type,
			label: s.label,
			confidence: s.confidence,
			data: s.data,
		})),
		status: conversation.status as 'BUILDING' | 'CONFIRMED' | 'SIZED',
	});

	const assistantMessage = await prisma.message.create({
		data: {
			conversationId: conversation.id,
			role: 'ASSISTANT',
			content: result.assistantMessage,
		},
	});

	if (result.estimateCalled) {
		await prisma.audienceEstimate.upsert({
			where: { conversationId: conversation.id },
			create: {
				conversationId: conversation.id,
				estimateLow: 0,
				estimateHigh: 0,
				reasoning: result.assistantMessage,
			},
			update: {
				reasoning: result.assistantMessage,
			},
		});
	}

	const [updatedConversation, updatedSignals, estimate] = await Promise.all([
		prisma.conversation.findUniqueOrThrow({ where: { id: conversation.id } }),
		prisma.signal.findMany({
			where: { conversationId: conversation.id },
			orderBy: { createdAt: 'asc' },
		}),
		prisma.audienceEstimate.findUnique({
			where: { conversationId: conversation.id },
		}),
	]);

	res.json({
		message: {
			id: assistantMessage.id,
			role: assistantMessage.role,
			content: assistantMessage.content,
			createdAt: assistantMessage.createdAt,
		},
		signals: updatedSignals.map((s) => ({
			id: s.id,
			type: s.type,
			label: s.label,
			confidence: s.confidence,
			data: s.data,
			createdAt: s.createdAt,
		})),
		status: updatedConversation.status,
		estimate: estimate ?? undefined,
	});
});

export { router as conversationsRouter };
