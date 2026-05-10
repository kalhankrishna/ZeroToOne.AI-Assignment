import { useEffect, useState } from 'react';
import { Outlet, useNavigate, useParams, Link } from 'react-router';
import { toast } from 'react-toastify';
import { Plus, Trash2, LogOut, Shield, MessageSquare } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import * as api from '../lib/api';
import { ApiError } from '../lib/api';
import type { Conversation } from '../lib/types';
import { ConfirmDialog } from '../components/ConfirmDialog';

export default function ConversationLayout() {
	const { user, logout } = useAuth();
	const navigate = useNavigate();
	const { id: activeId } = useParams<{ id: string }>();

	const [conversations, setConversations] = useState<Conversation[]>([]);
	const [loadingList, setLoadingList] = useState(true);
	const [creating] = useState(false);
	const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

	useEffect(() => {
		api.getConversations()
			.then(setConversations)
			.catch((err) => {
				if (!(err instanceof ApiError && err.status === 401)) {
					toast.error('Failed to load conversations');
				}
			})
			.finally(() => setLoadingList(false));
	}, []);

	function handleNew() {
		navigate('/conversations');
	}

	async function handleDelete(convId: string) {
		try {
			await api.deleteConversation(convId);
			setConversations((prev) => prev.filter((c) => c.id !== convId));
			toast.success('Conversation deleted');
			if (activeId === convId) {
				navigate('/conversations');
			}
		} catch {
			toast.error('Failed to delete conversation');
		} finally {
			setDeleteTarget(null);
		}
	}

	async function handleLogout() {
		await logout();
		navigate('/login', { replace: true });
	}

	async function refreshList() {
		try {
			const list = await api.getConversations();
			setConversations(list);
		} catch {
			// silent — sidebar is non-critical
		}
	}

	return (
		<div className="app-layout">
			<aside className="sidebar">
				<div className="sidebar-header">
					<h2>Campaigns</h2>
					<button
						className="icon-btn"
						onClick={handleNew}
						disabled={creating}
						title="New conversation"
					>
						<Plus size={18} />
					</button>
				</div>

				<nav className="sidebar-list">
					{loadingList && <p className="sidebar-empty">Loading...</p>}
					{!loadingList && conversations.length === 0 && (
						<p className="sidebar-empty">No conversations yet.</p>
					)}
					{conversations.map((conv) => (
						<div
							key={conv.id}
							className={`sidebar-item ${conv.id === activeId ? 'active' : ''}`}
						>
							<Link to={`/conversations/${conv.id}`} className="sidebar-link">
								<MessageSquare size={14} />
								<span>{conv.title || 'Untitled'}</span>
								{user?.role === 'ADMIN' && conv.user && (
									<span className="sidebar-owner">{conv.user.email}</span>
								)}
								<span className="sidebar-status">{conv.status}</span>
							</Link>
							<button
								className="icon-btn delete-btn"
								onClick={(e) => {
									e.stopPropagation();
									setDeleteTarget(conv.id);
								}}
								title="Delete"
							>
								<Trash2 size={14} />
							</button>
						</div>
					))}
				</nav>

				<div className="sidebar-footer">
					{user?.role === 'ADMIN' && (
						<Link to="/admin/users" className="sidebar-admin-btn">
							<Shield size={14} />
							Admin
						</Link>
					)}
					<button className="sidebar-footer-link" onClick={handleLogout}>
						<LogOut size={14} />
						Log out
					</button>
					<span className="sidebar-email">{user?.email}</span>
				</div>
			</aside>

			<main className="main-panel">
				<Outlet context={{ refreshList }} />
			</main>
			{deleteTarget && (
				<ConfirmDialog
					title="Delete conversation"
					message="This cannot be undone. All messages and signals will be lost."
					confirmLabel="Delete"
					onConfirm={() => handleDelete(deleteTarget)}
					onCancel={() => setDeleteTarget(null)}
				/>
			)}
		</div>
	);
}

export interface ConversationOutletContext {
	refreshList: () => Promise<void>;
}
