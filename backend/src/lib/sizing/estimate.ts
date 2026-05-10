import { SignalData, Signal, MergedSignal, EstimateResult } from "../types/types.js";

const BASE_POPULATION = 250_000_000;
const GLOBAL_FLOOR = 10_000;
const RANGE_LOW = 0.75;
const RANGE_HIGH = 1.25;

const DECAY_FACTORS = [0.6, 0.7, 0.8, 0.87, 0.92, 0.95, 0.97];

const US_AGE_BUCKETS = [
	{ min: 18, max: 24, pct: 0.1 },
	{ min: 25, max: 34, pct: 0.14 },
	{ min: 35, max: 44, pct: 0.13 },
	{ min: 45, max: 54, pct: 0.13 },
	{ min: 55, max: 64, pct: 0.13 },
	{ min: 65, max: 74, pct: 0.1 },
	{ min: 75, max: 95, pct: 0.07 },
];

function calculateAgeMultiplier(min: number, max: number): number {
	let total = 0;
	for (const bucket of US_AGE_BUCKETS) {
		const overlapMin = Math.max(min, bucket.min);
		const overlapMax = Math.min(max, bucket.max);
		const overlap = overlapMax - overlapMin;
		if (overlap <= 0) continue;
		const bucketSize = bucket.max - bucket.min;
		total += (overlap / bucketSize) * bucket.pct;
	}
	return total;
}

const SEMANTIC_CATEGORY_KEYWORDS: Record<string, string[]> = {
	CG_DEMOGRAPHICS: [
		'age',
		'gender',
		'male',
		'female',
		'ethnicity',
		'language',
		'religion',
		'education',
	],
	CG_HOUSEHOLD: [
		'household',
		'home office',
		'homebody',
		'family',
		'children',
		'parent',
		'spouse',
		'marital',
		'single',
		'renter',
		'homeown',
	],
	CG_FINANCE: [
		'credit',
		'invest',
		'financial',
		'wealth',
		'net worth',
		'bank',
		'premium card',
		'card holder',
	],
	CG_LIFESTYLE: ['lifestyle', 'sporty', 'upscale', 'common lifestyle', 'active'],
	CG_INTEREST: ['interested in', 'avidly interested', 'interest'],
	CG_PURCHASE_BEH: ['buys ', 'buyer', 'purchaser', 'shopper'],
	CG_DONATION: ['donor', 'donates', 'charitable', 'charity'],
	CG_OCCUPATION: [
		'programmer',
		'analyst',
		'operator',
		'engineer',
		'developer',
		'occupation',
		'professional',
	],

	LOC_BEAUTY: ['beauty', 'cosmetic', 'salon', 'spa', 'perfume'],
	LOC_FITNESS: ['fitness', 'gym', 'sport', 'recreation', 'athletic', 'weight reduc'],
	LOC_FOOD: ['restaurant', 'food', 'grocery', 'dining', 'cafe', 'drinking'],
	LOC_RETAIL: ['retail', 'department store', 'discount store', 'mall', 'outlet', 'warehouse'],
	LOC_HEALTH: ['pharmacy', 'drug store', 'medical', 'hospital', 'clinic', 'physician'],
	LOC_AUTO: ['auto', 'vehicle', 'car dealer', 'car wash', 'gas station'],

	TXN_BEAUTY: ['cosmetic', 'makeup', 'beauty', 'skincare', 'fragrance', 'facial'],
	TXN_FOOD: ['food', 'grocery', 'dining', 'restaurant', 'beverage', 'wine', 'drink', 'coffee'],
	TXN_FITNESS: [
		'fitness',
		'sport',
		'gym',
		'athletic',
		'supplement',
		'vitamin',
		'nutrition',
		'health',
	],
	TXN_FASHION: ['fashion', 'apparel', 'clothing', 'shoe', 'accessory', 'jewelry', 'watch'],
	TXN_TECH: ['technology', 'electronic', 'computer', 'software', 'gaming', 'mobile'],
	TXN_HOME: ['home', 'garden', 'furniture', 'appliance', 'hardware', 'improvement'],
	TXN_FINANCE: ['insurance', 'banking', 'mortgage', 'loan', 'financial service'],
	TXN_TRAVEL: ['travel', 'hotel', 'airline', 'vacation', 'cruise'],
};

function getSemanticCategory(signal: Signal): string {
	const labelLower = signal.label.toLowerCase();
	for (const [category, keywords] of Object.entries(SEMANTIC_CATEGORY_KEYWORDS)) {
		if (keywords.some((kw) => labelLower.includes(kw))) return category;
	}
	return `MISC_${signal.type}_${signal.id}`;
}

const BASE_MULTIPLIERS: Record<string, number> = {
	CG_DEMOGRAPHICS: 0.25,
	CG_HOUSEHOLD: 0.25,
	CG_FINANCE: 0.15,
	CG_LIFESTYLE: 0.12,
	CG_INTEREST: 0.25,
	CG_PURCHASE_BEH: 0.35,
	CG_DONATION: 0.15,
	CG_OCCUPATION: 0.05,

	LOC_BEAUTY: 0.2,
	LOC_FITNESS: 0.15,
	LOC_FOOD: 0.4,
	LOC_RETAIL: 0.3,
	LOC_HEALTH: 0.2,
	LOC_AUTO: 0.15,

	TXN_BEAUTY: 0.3,
	TXN_FOOD: 0.45,
	TXN_FITNESS: 0.2,
	TXN_FASHION: 0.25,
	TXN_TECH: 0.25,
	TXN_HOME: 0.2,
	TXN_FINANCE: 0.15,
	TXN_TRAVEL: 0.18,

	DEFAULT: 0.15,
};

function getIndividualSize(signal: Signal): number {
	if (
		signal.type === 'CONSUMER_GRAPH' &&
		signal.data.fieldType === 'INT' &&
		signal.data.field === 'age' &&
		signal.data.range
	) {
		return (
			BASE_POPULATION * calculateAgeMultiplier(signal.data.range.min, signal.data.range.max)
		);
	}

	if (signal.type === 'CONSUMER_GRAPH' && signal.data.field) {
		const field = signal.data.field;

		if (field === 'gender') return BASE_POPULATION * 0.5;
		if (field.startsWith('hh_adults_')) return BASE_POPULATION * 0.14;
		if (field.startsWith('hh_income_group')) return BASE_POPULATION * 0.1;
		if (field.startsWith('occupation')) return BASE_POPULATION * 0.05;
		if (field.startsWith('interest_')) return BASE_POPULATION * 0.2;
		if (field.startsWith('net_worth')) return BASE_POPULATION * 0.15;
	}

	const category = getSemanticCategory(signal);
	const multiplier = category.startsWith('MISC_')
		? BASE_MULTIPLIERS.DEFAULT
		: (BASE_MULTIPLIERS[category] ?? BASE_MULTIPLIERS.DEFAULT);

	return BASE_POPULATION * multiplier;
}

function getGroupKey(signal: Signal): string | null {
	if (signal.type !== 'CONSUMER_GRAPH') return null;
	const field = signal.data.field ?? '';

	if (
		field.startsWith('hh_adults_male_') ||
		field.startsWith('hh_adults_female_') ||
		field.startsWith('hh_adults_unknown_')
	) {
		return 'hh_adults_age_band';
	}

	if (field.startsWith('hh_income_group')) {
		return 'hh_income_group';
	}

	return field;
}

function mergeFieldSignals(signals: Signal[]): MergedSignal[] {
	const fieldGroups = new Map<string, Signal[]>();
	const nonGrouped: Signal[] = [];

	for (const signal of signals) {
		const groupKey = getGroupKey(signal);
		if (groupKey) {
			if (!fieldGroups.has(groupKey)) fieldGroups.set(groupKey, []);
			fieldGroups.get(groupKey)!.push(signal);
		} else {
			nonGrouped.push(signal);
		}
	}

	const merged: MergedSignal[] = [...nonGrouped];

	for (const [, group] of fieldGroups.entries()) {
		if (group.length === 1) {
			merged.push(group[0]);
			continue;
		}

		const combinedSize = Math.min(
			group.reduce((sum, s) => sum + getIndividualSize(s), 0),
			BASE_POPULATION,
		);

		merged.push({
			...group[0],
			id: `merged_${group[0].data.field}`,
			label: group.map((s) => s.label).join(' or '),
			_mergedSize: combinedSize,
		});
	}

	return merged;
}

function getMergedSize(signal: MergedSignal): number {
	if (signal._mergedSize !== undefined) return signal._mergedSize;
	return getIndividualSize(signal);
}

export function estimateAudience(signals: Signal[]): EstimateResult {
	if (signals.length === 0) return { low: 0, high: 0 };

	const mergedSignals = mergeFieldSignals(signals);

	const individualSizes = mergedSignals.map((s) => {
		const size = getMergedSize(s);
		return size;
	});

	const ceiling = Math.min(...individualSizes);

	const additionalCount = mergedSignals.length - 1;

	let combinedDecay = 1.0;
	for (let i = 0; i < additionalCount; i++) {
		const factor = DECAY_FACTORS[Math.min(i, DECAY_FACTORS.length - 1)];
		combinedDecay *= factor;
	}

	const raw = Math.max(Math.round(ceiling * combinedDecay), GLOBAL_FLOOR);

	return {
		low: Math.round(raw * RANGE_LOW),
		high: Math.round(raw * RANGE_HIGH),
	};
}
