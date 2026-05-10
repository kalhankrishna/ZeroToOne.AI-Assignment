import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { toast } from 'react-toastify';
import { ArrowLeft } from 'lucide-react';
import * as api from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import type { User } from '../lib/types';
import { ConfirmDialog } from '../components/ConfirmDialog';

export default function AdminUsersPage() {
	const { user: currentUser } = useAuth();
	const [users, setUsers] = useState<User[]>([]);
	const [loading, setLoading] = useState(true);
	const [updating, setUpdating] = useState<string | null>(null);
	const [roleTarget, setRoleTarget] = useState<{ id: string; currentRole: User['role'] } | null>(
		null,
	);

	useEffect(() => {
		api.getUsers()
			.then(setUsers)
			.catch(() => toast.error('Failed to load users'))
			.finally(() => setLoading(false));
	}, []);

	async function toggleRole(userId: string, currentRole: User['role']) {
		const newRole = currentRole === 'ADMIN' ? 'PLANNER' : 'ADMIN';
		setUpdating(userId);
		try {
			const updated = await api.updateUserRole(userId, newRole);
			setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, ...updated } : u)));
			toast.success(`Role updated to ${newRole}`);
		} catch {
			toast.error('Failed to update role');
		} finally {
			setUpdating(null);
		}
	}

	if (loading) {
		return <div className="page-center">Loading...</div>;
	}

	return (
		<div className="admin-page">
			<div className="admin-header">
				<Link to="/conversations" className="back-link">
					<ArrowLeft size={16} /> Back
				</Link>
				<h1>User Management</h1>
			</div>

			<table className="admin-table">
				<thead>
					<tr>
						<th>Email</th>
						<th>Role</th>
						<th>Created</th>
						<th>Action</th>
					</tr>
				</thead>
				<tbody>
					{users.map((u) => (
						<tr key={u.id}>
							<td>{u.email}</td>
							<td>{u.role}</td>
							<td>{new Date(u.createdAt).toLocaleDateString()}</td>
							<td>
								{u.id === currentUser?.id ? (
									<span style={{ color: '#999' }}>You</span>
								) : (
									<button
										onClick={() =>
											setRoleTarget({ id: u.id, currentRole: u.role })
										}
										disabled={updating === u.id}
									>
										{updating === u.id
											? '...'
											: u.role === 'ADMIN'
												? 'Demote'
												: 'Promote'}
									</button>
								)}
							</td>
						</tr>
					))}
				</tbody>
			</table>
			{roleTarget && (
				<ConfirmDialog
					title="Change user role"
					message={`Change this user's role to ${roleTarget.currentRole === 'ADMIN' ? 'PLANNER' : 'ADMIN'}?`}
					confirmLabel={roleTarget.currentRole === 'ADMIN' ? 'Demote' : 'Promote'}
					onConfirm={() => {
						toggleRole(roleTarget.id, roleTarget.currentRole);
						setRoleTarget(null);
					}}
					onCancel={() => setRoleTarget(null)}
				/>
			)}
		</div>
	);
}
