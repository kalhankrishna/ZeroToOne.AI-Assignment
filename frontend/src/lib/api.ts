const BASE_URL = import.meta.env.VITE_API_URL;

export class ApiError extends Error {
	status: number;

	constructor(status: number, message: string) {
		super(message);
		this.name = 'ApiError';
		this.status = status;
	}
}

export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
	const url = `${BASE_URL}${path}`;

	const res = await fetch(url, {
		...options,
		credentials: 'include',
		headers: {
			'Content-Type': 'application/json',
			...options.headers,
		},
	});

	if (res.status === 401) {
		const onAuthPage =
			window.location.pathname === '/login' || window.location.pathname === '/register';
		if (!onAuthPage) {
			window.location.href = '/login';
		}
		throw new ApiError(401, 'Unauthorized');
	}

	if (!res.ok) {
		const body = await res.json().catch(() => ({ message: 'Request failed' }));
		throw new ApiError(
			res.status,
			(body as { message?: string }).message || `HTTP ${res.status}`,
		);
	}

	if (res.status === 204) {
		return undefined as T;
	}

	return res.json() as Promise<T>;
}

export function login(email: string, password: string) {
	return apiFetch<{ user: import('./types').User }>('/auth/login', {
		method: 'POST',
		body: JSON.stringify({ email, password }),
	});
}

export function register(email: string, password: string) {
	return apiFetch<{ user: import('./types').User }>('/auth/register', {
		method: 'POST',
		body: JSON.stringify({ email, password }),
	});
}

export function logout() {
	return apiFetch<void>('/auth/logout', { method: 'POST' });
}

export function getMe() {
	return apiFetch<{ user: import('./types').User }>('/auth/me');
}

export function getConversations() {
	return apiFetch<import('./types').Conversation[]>('/conversations');
}

export function createConversation() {
	return apiFetch<import('./types').Conversation>('/conversations', {
		method: 'POST',
	});
}

export function getConversation(id: string) {
	return apiFetch<import('./types').ConversationDetail>(`/conversations/${id}`);
}

export function deleteConversation(id: string) {
	return apiFetch<void>(`/conversations/${id}`, { method: 'DELETE' });
}

export function sendMessage(conversationId: string, content: string) {
	return apiFetch<import('./types').SendMessageResponse>(
		`/conversations/${conversationId}/messages`,
		{
			method: 'POST',
			body: JSON.stringify({ content }),
		},
	);
}

export async function getUsers() {
	const res = await apiFetch<{ users: import('./types').User[] }>('/users');
	return res.users;
}

export async function updateUserRole(userId: string, role: 'ADMIN' | 'PLANNER') {
	const res = await apiFetch<{ user: import('./types').User }>(`/users/${userId}/role`, {
		method: 'PATCH',
		body: JSON.stringify({ role }),
	});
	return res.user;
}
