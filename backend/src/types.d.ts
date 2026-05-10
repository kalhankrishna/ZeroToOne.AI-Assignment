import type { Role, Conversation } from "../generated/prisma/client.js";

declare global {
  namespace Express {
    interface Request {
      /** Set by requireAuth middleware */
      user?: {
        userId: string;
        role: Role;
      };
      /** Set by requireOwnership middleware — avoids double-fetch */
      conversation?: Conversation;
    }
  }
}