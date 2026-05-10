import { useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router';
import { toast } from 'react-toastify';
import { Send, Loader } from 'lucide-react';
import * as api from '../lib/api';
import { ApiError } from '../lib/api';
import type { ConversationOutletContext } from './ConversationLayout';

export default function ConversationIndex() {
	const navigate = useNavigate();
	const { refreshList } = useOutletContext<ConversationOutletContext>();
	const [input, setInput] = useState('');
	const [sending, setSending] = useState(false);

	async function handleSend() {
		const content = input.trim();
		if (!content || sending) return;

		setSending(true);
		try {
			const conv = await api.createConversation();
			await api.sendMessage(conv.id, content);
			refreshList();
			navigate(`/conversations/${conv.id}`, { replace: true });
		} catch (err) {
			const msg = err instanceof ApiError ? err.message : 'Failed to start conversation';
			toast.error(msg);
			setSending(false);
		}
	}

	return (
		<div className="chat-layout">
			<div className="chat-welcome">
				{sending ? (
					<>
						<Loader size={32} className="spin" />
						<p className="chat-welcome-loading">Setting up your conversation...</p>
					</>
				) : (
					<>
						<h2>Build your audience</h2>
						<p>
							Describe who you want to reach — demographics, interests, behaviors,
							locations.
						</p>
						<div className="chat-welcome-input">
							<input
								type="text"
								value={input}
								onChange={(e) => setInput(e.target.value)}
								onKeyDown={(e) => {
									if (e.key === 'Enter' && !e.shiftKey) {
										e.preventDefault();
										handleSend();
									}
								}}
								placeholder="e.g. Health-conscious millennials in urban areas..."
								autoFocus
							/>
							<button onClick={handleSend} disabled={!input.trim()} title="Send">
								<Send size={18} />
							</button>
						</div>
					</>
				)}
			</div>
			<div className="signals-panel">
				<h3>Signals</h3>
				<p className="signals-empty">
					No signals yet. Describe your target audience to get started.
				</p>
			</div>
		</div>
	);
}
