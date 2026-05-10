import type { Signal } from '../lib/types';

const TYPE_LABELS: Record<Signal['type'], string> = {
	LOCATION: 'Location',
	TRANSACTION: 'Transaction',
	CONSUMER_GRAPH: 'Demographics',
};

export function SignalCard({ signal }: { signal: Signal }) {
	return (
		<div className="signal-card">
			<div className="signal-card-header">
				<span className="signal-label">{signal.label}</span>
				<span className="signal-badge">{TYPE_LABELS[signal.type]}</span>
			</div>
			<div className="signal-confidence">
				{Math.round(signal.confidence * 100)}% confidence
			</div>
		</div>
	);
}
