import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { AuthProvider } from './contexts/AuthContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import App from './App';
import './index.css';

createRoot(document.getElementById('root')!).render(
	<StrictMode>
		<ErrorBoundary>
			<AuthProvider>
				<App />
				<ToastContainer position="bottom-right" autoClose={3000} hideProgressBar />
			</AuthProvider>
		</ErrorBoundary>
	</StrictMode>,
);
