import type { Role, Conversation } from '../generated/prisma/client.js';

declare global {
	namespace Express {
		interface Request {
			user?: {
				userId: string;
				role: Role;
			};
			conversation?: Conversation;
		}
	}
}
