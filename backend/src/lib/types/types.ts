import type { Role } from '../../generated/prisma/client.js';

export interface JWTPayload {
	userId: string;
	role: Role;
}

export interface AgentContext {
	conversationId: string;
	userMessage: string;
	history: { role: 'user' | 'assistant'; content: string }[];
	signals: {
		id: string;
		type: string;
		label: string;
		confidence: number;
		data: unknown;
	}[];
	status: 'BUILDING' | 'CONFIRMED' | 'SIZED';
}

export interface AgentResult {
	assistantMessage: string;
	toolCallsMade: string[];
	estimateCalled: boolean;
}

export interface SignalData {
	type: 'LOCATION' | 'TRANSACTION' | 'CONSUMER_GRAPH';
	top_category?: string;
	sub_category?: string;
	level1?: string;
	level2?: string | null;
	level3?: string | null;
	level4?: string | null;
	field?: string;
	fieldType?: 'BOOL' | 'INT' | 'ALPHA' | 'ALPHA_NUM';
	value?: string | boolean;
	values?: string[];
	range?: { min: number; max: number };
}

export interface Signal {
	id: string;
	type: 'LOCATION' | 'TRANSACTION' | 'CONSUMER_GRAPH';
	data: SignalData;
	label: string;
	confidence: number;
}

export interface MergedSignal extends Signal {
	_mergedSize?: number;
}

export interface EstimateResult {
	low: number;
	high: number;
}

export type SourceType = 'LOCATION' | 'TRANSACTION' | 'CG';

export interface SearchResult {
	label: string;
	score: number;
	zone: 'high' | 'medium' | 'low';
	field?: string;
	fieldType?: 'BOOL' | 'INT' | 'ALPHA' | 'ALPHA_NUM';
	fieldRangeMin?: number | null;
	fieldRangeMax?: number | null;
	decodedValues?: { value: string; label: string }[];
	top_category?: string;
	sub_category?: string;
	level1?: string;
	level2?: string | null;
	level3?: string | null;
	level4?: string | null;
}

export interface ToolSearchResult {
	query: string;
	sourceType: string;
	results: SearchResult[];
	best_score: number;
	direct_match: boolean;
	hint?: string;
}