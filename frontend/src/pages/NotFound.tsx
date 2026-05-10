import { Link } from 'react-router';

export default function NotFoundPage() {
	return (
		<div className="page-center">
			<h1>404</h1>
			<p>Page not found.</p>
			<Link to="/conversations" style={{ marginTop: '1rem' }}>
				Go home
			</Link>
		</div>
	);
}
