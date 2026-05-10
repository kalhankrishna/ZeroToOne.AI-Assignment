export interface User {
	id: string;
	email: string;
	role: 'ADMIN' | 'PLANNER';
	createdAt: string;
}

export interface Conversation {
	id: string;
	userId: string;
	title: string | null;
	status: 'BUILDING' | 'CONFIRMED' | 'SIZED';
	createdAt: string;
	updatedAt: string;
	user?: { email: string };
}

export interface Message {
	id: string;
	conversationId: string;
	role: 'USER' | 'ASSISTANT';
	content: string;
	createdAt: string;
}

export interface Signal {
	id: string;
	conversationId: string;
	type: 'LOCATION' | 'TRANSACTION' | 'CONSUMER_GRAPH';
	label: string;
	confidence: number;
	data: Record<string, unknown>;
	createdAt: string;
}

export interface AudienceEstimate {
	id: string;
	conversationId: string;
	estimateLow: number;
	estimateHigh: number;
	reasoning: string;
	createdAt: string;
}

export interface ConversationDetail extends Conversation {
	messages: Message[];
	signals: Signal[];
	estimate: AudienceEstimate | null;
}

export interface SendMessageResponse {
	message: Message;
	signals: Signal[];
	status: 'BUILDING' | 'CONFIRMED' | 'SIZED';
	estimate?: AudienceEstimate;
}
