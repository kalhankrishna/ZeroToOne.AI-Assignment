import { Navigate, Outlet } from 'react-router';
import { useAuth } from '../contexts/AuthContext';

interface Props {
	adminOnly?: boolean;
}

export function ProtectedRoute({ adminOnly = false }: Props) {
	const { user, isLoading } = useAuth();

	if (isLoading) {
		return <div className="page-center">Loading...</div>;
	}

	if (!user) {
		return <Navigate to="/login" replace />;
	}

	if (adminOnly && user.role !== 'ADMIN') {
		return <Navigate to="/conversations" replace />;
	}

	return <Outlet />;
}
