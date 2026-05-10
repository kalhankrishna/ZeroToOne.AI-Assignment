import { prisma } from './lib/prisma.js';
import { runAgentLoop } from './lib/agent/index.js';

const TEST_USER_ID = 'test-user-001';
const TEST_CONVERSATION_ID = 'test-conv-001';

async function seed() {
	// Clean slate — delete in FK-safe order
	await prisma.signal.deleteMany({ where: { conversationId: TEST_CONVERSATION_ID } });
	await prisma.audienceEstimate.deleteMany({ where: { conversationId: TEST_CONVERSATION_ID } });
	await prisma.conversation.deleteMany({ where: { id: TEST_CONVERSATION_ID } });
	await prisma.user.deleteMany({ where: { id: TEST_USER_ID } });

	// Recreate
	await prisma.user.create({
		data: {
			id: TEST_USER_ID,
			email: 'test@test.com',
			passwordHash: 'dummy',
			role: 'PLANNER',
		},
	});

	await prisma.conversation.create({
		data: {
			id: TEST_CONVERSATION_ID,
			userId: TEST_USER_ID,
			status: 'BUILDING',
		},
	});
}

async function runTurn(
	userMessage: string,
	history: { role: 'user' | 'assistant'; content: string }[],
) {
	const signals = await prisma.signal.findMany({
		where: { conversationId: TEST_CONVERSATION_ID },
		orderBy: { createdAt: 'asc' },
	});

	const conversation = await prisma.conversation.findUnique({
		where: { id: TEST_CONVERSATION_ID },
	});

	const result = await runAgentLoop({
		conversationId: TEST_CONVERSATION_ID,
		userMessage,
		history,
		signals: signals.map((s) => ({
			id: s.id,
			type: s.type,
			label: s.label,
			confidence: s.confidence,
			data: s.data,
		})),
		status: conversation!.status as 'BUILDING' | 'CONFIRMED' | 'SIZED',
	});

	console.log('\n─── User ────────────────────────────────────────────');
	console.log(userMessage);
	console.log('\n─── Assistant ───────────────────────────────────────');
	console.log(result.assistantMessage);
	console.log('\n─── Tools Called ────────────────────────────────────');
	console.log(result.toolCallsMade);

	// Append this turn to history for next call
	history.push({ role: 'user', content: userMessage });
	history.push({ role: 'assistant', content: result.assistantMessage });

	return result;
}

async function main() {
	await seed();

	const history: { role: 'user' | 'assistant'; content: string }[] = [];

	// Turn 1 — initial audience description
	await runTurn('Hello! My name is Jason. Who are you? How do you do?', history);

	// Turn 2 — respond to options presented
	await runTurn(
		'Go with option 2 for fitness interest and option 1 for gym visits. Target all genders for age.',
		history,
	);

	// Turn 3 — confirm signals
	await runTurn('Looks good, confirm those signals', history);

	// Turn 4 — request estimate
	await runTurn('How many people can we reach?', history);

	await prisma.$disconnect();
}

main().catch((err) => {
	console.error(err);
	prisma.$disconnect();
	process.exit(1);
});
