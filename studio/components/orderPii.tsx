// Custom Sanity Studio field components that render the new PII panels on
// the order detail view. Each component fetches its own data from the
// backend's /admin/* routes (which read from DynamoDB) rather than from
// the Sanity document — that's the whole point of the split-store.
//
// In Phase 0 these panels render *alongside* the existing native PII
// fields on the Sanity doc, intentionally duplicated so the operator can
// validate dual-write parity by eye. In Phase 1 the native fields are
// removed from the schema and only these panels remain.
//
// Token + API URL are baked into the Studio JS bundle at build time via
// SANITY_STUDIO_* env vars. The token is therefore visible to anyone who
// inspects the bundle — the backend bearer-token gate is the real
// security control. See docs/orders-pii-split.md § Admin auth.

import { useCallback, useEffect, useState, type ChangeEvent } from 'react';
import { useFormValue } from 'sanity';
import { Box, Card, Flex, Inline, Label, Spinner, Stack, Text, TextArea, TextInput } from '@sanity/ui';

type OrderPii = {
	orderRef: string;
	customerName: string;
	customerEmail: string;
	customerPhone: string | null;
	shippingAddress: string;
	items: string;
	customerNotes: string | null;
	trackingNumber: string | null;
	trackingUrl: string | null;
	shippingCarrier: string | null;
	internalNotes: string | null;
	createdAt: string;
};

const API_URL = resolveApiUrl(process.env.SANITY_STUDIO_API_URL);
const TOKEN = process.env.SANITY_STUDIO_ADMIN_TOKEN ?? '';

// Resolve + validate SANITY_STUDIO_API_URL at module load (i.e. when
// the Studio JS bundle boots in the browser). Three failure modes
// surface here as loud throws rather than silent misbehaviour:
//
//   1. Production build with the env var missing → throw, because a
//      bundle that fell back to localhost would either 404 forever
//      or, worse, target whatever dev backend happens to share that
//      host. Set vars.PUBLIC_API_URL in the production GHA
//      environment so deploy-studio.yml bakes the real URL in.
//   2. Any build with a non-http(s) protocol → throw, so a typo'd or
//      malicious env value can't redirect the Studio's authenticated
//      admin requests to an attacker-controlled endpoint.
//   3. Production build with a localhost / 127.0.0.1 / 0.0.0.0 host →
//      throw, defending against a misconfigured env that points the
//      prod bundle at the operator's laptop.
//
// In a development build (NODE_ENV !== 'production') a missing env
// falls back to http://localhost:3001 for ergonomic local dev.
function resolveApiUrl(rawValue: string | undefined): string {
	const isProductionBuild = process.env.NODE_ENV === 'production';
	const trimmed = (rawValue ?? '').trim();

	if (!trimmed) {
		if (isProductionBuild) {
			throw new Error(
				'SANITY_STUDIO_API_URL is required for production Studio builds. ' +
					'Set vars.PUBLIC_API_URL in the production GitHub Actions environment.'
			);
		}
		return 'http://localhost:3001';
	}

	const url = new URL(trimmed);
	if (url.protocol !== 'http:' && url.protocol !== 'https:') {
		throw new Error(`SANITY_STUDIO_API_URL must use http: or https:, got ${url.protocol}`);
	}

	const isLoopback =
		url.hostname === 'localhost' ||
		url.hostname === '127.0.0.1' ||
		url.hostname === '0.0.0.0';
	if (isProductionBuild && isLoopback) {
		throw new Error(
			`SANITY_STUDIO_API_URL resolves to ${url.hostname} in a production build — that's the local backend, not the deployed API. Set vars.PUBLIC_API_URL to the production API origin.`
		);
	}

	return trimmed.replace(/\/$/, '');
}

function authHeaders(extra: Record<string, string> = {}): Record<string, string> {
	return { Authorization: `Bearer ${TOKEN}`, ...extra };
}

async function fetchPii(orderRef: string): Promise<OrderPii | null> {
	const res = await fetch(`${API_URL}/admin/orders/${encodeURIComponent(orderRef)}`, {
		headers: authHeaders()
	});
	if (res.status === 404) return null;
	if (!res.ok) throw new Error(`GET /admin/orders/${orderRef} returned ${res.status}`);
	return (await res.json()) as OrderPii;
}

async function patchTracking(orderRef: string, body: Record<string, string | null>): Promise<void> {
	const res = await fetch(`${API_URL}/admin/orders/${encodeURIComponent(orderRef)}/tracking`, {
		method: 'PATCH',
		headers: authHeaders({ 'Content-Type': 'application/json' }),
		body: JSON.stringify(body)
	});
	if (!res.ok) throw new Error(`PATCH tracking returned ${res.status}`);
}

async function patchInternalNotes(orderRef: string, internalNotes: string | null): Promise<void> {
	const res = await fetch(`${API_URL}/admin/orders/${encodeURIComponent(orderRef)}/internal-notes`, {
		method: 'PATCH',
		headers: authHeaders({ 'Content-Type': 'application/json' }),
		body: JSON.stringify({ internalNotes })
	});
	if (!res.ok) throw new Error(`PATCH internal-notes returned ${res.status}`);
}

type PiiState = {
	pii: OrderPii | null;
	loading: boolean;
	error: string | null;
	refresh: () => void;
};

function usePii(): PiiState {
	const orderRef = useFormValue(['orderRef']) as string | undefined;
	const [pii, setPii] = useState<OrderPii | null>(null);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const refresh = useCallback(() => {
		if (!orderRef) {
			setPii(null);
			return;
		}
		setLoading(true);
		setError(null);
		fetchPii(orderRef)
			.then(setPii)
			.catch((e) => setError((e as Error).message))
			.finally(() => setLoading(false));
	}, [orderRef]);

	useEffect(() => {
		refresh();
	}, [refresh]);

	return { pii, loading, error, refresh };
}

function PanelShell({
	title,
	state,
	children
}: {
	title: string;
	state: PiiState;
	children: (pii: OrderPii) => React.ReactNode;
}) {
	if (state.loading && !state.pii) {
		return (
			<Card padding={3} radius={2} shadow={1}>
				<Flex align="center" gap={2}>
					<Spinner muted />
					<Text muted size={1}>
						Loading {title.toLowerCase()}…
					</Text>
				</Flex>
			</Card>
		);
	}
	if (state.error) {
		return (
			<Card padding={3} radius={2} shadow={1} tone="critical">
				<Stack space={2}>
					<Text weight="medium">Could not load {title.toLowerCase()}</Text>
					<Text size={1} muted>
						{state.error}
					</Text>
				</Stack>
			</Card>
		);
	}
	if (!state.pii) {
		return (
			<Card padding={3} radius={2} shadow={1} tone="caution">
				<Text size={1}>
					No DynamoDB row for this order yet. New orders create one via dual-write;
					existing orders are seeded by the one-time backfill script.
				</Text>
			</Card>
		);
	}
	return (
		<Card padding={3} radius={2} shadow={1}>
			<Stack space={4}>
				<Text weight="medium">{title}</Text>
				{children(state.pii)}
			</Stack>
		</Card>
	);
}

function DetailRow({ label, value, multiline }: { label: string; value: string | null; multiline?: boolean }) {
	return (
		<Stack space={1}>
			<Label size={1} muted>
				{label}
			</Label>
			<Text style={{ whiteSpace: multiline ? 'pre-wrap' : 'normal' }}>{value ?? '—'}</Text>
		</Stack>
	);
}

export function CustomerDetailsPanel() {
	const state = usePii();
	return (
		<PanelShell title="Customer details (from DynamoDB)" state={state}>
			{(pii) => (
				<Stack space={3}>
					<DetailRow label="Name" value={pii.customerName} />
					<DetailRow label="Email" value={pii.customerEmail} />
					<DetailRow label="Phone" value={pii.customerPhone} />
					<DetailRow label="Shipping address" value={pii.shippingAddress} multiline />
					<DetailRow label="Items" value={pii.items} multiline />
					<DetailRow label="Customer notes" value={pii.customerNotes} multiline />
				</Stack>
			)}
		</PanelShell>
	);
}

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

function SaveIndicator({ state, error }: { state: SaveState; error: string | null }) {
	if (state === 'saving') {
		return (
			<Inline space={2}>
				<Spinner muted />
				<Text size={1} muted>
					Saving…
				</Text>
			</Inline>
		);
	}
	if (state === 'saved') {
		return (
			<Text size={1} muted>
				Saved
			</Text>
		);
	}
	if (state === 'error') {
		return (
			<Text size={1} style={{ color: 'var(--card-badge-critical-fg-color)' }}>
				{error ?? 'Save failed'}
			</Text>
		);
	}
	return null;
}

function EditableField({
	label,
	initial,
	multiline,
	onSave
}: {
	label: string;
	initial: string;
	multiline?: boolean;
	onSave: (value: string | null) => Promise<void>;
}) {
	const [value, setValue] = useState(initial);
	const [state, setState] = useState<SaveState>('idle');
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		setValue(initial);
		setState('idle');
		setError(null);
	}, [initial]);

	const handleBlur = async () => {
		const next = value.trim();
		const baseline = initial.trim();
		if (next === baseline) return;
		setState('saving');
		setError(null);
		try {
			await onSave(next === '' ? null : next);
			setState('saved');
		} catch (e) {
			setError((e as Error).message);
			setState('error');
		}
	};

	const handleChange = (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
		setValue(e.currentTarget.value);
	};

	return (
		<Stack space={2}>
			<Flex align="center" justify="space-between">
				<Label size={1} muted>
					{label}
				</Label>
				<SaveIndicator state={state} error={error} />
			</Flex>
			{multiline ? (
				<TextArea value={value} onChange={handleChange} onBlur={handleBlur} rows={3} />
			) : (
				<TextInput value={value} onChange={handleChange} onBlur={handleBlur} />
			)}
		</Stack>
	);
}

export function TrackingFields() {
	const state = usePii();
	return (
		<PanelShell title="Tracking (DynamoDB)" state={state}>
			{(pii) => (
				<Stack space={3}>
					<EditableField
						label="Shipping carrier"
						initial={pii.shippingCarrier ?? ''}
						onSave={(value) => patchTracking(pii.orderRef, { shippingCarrier: value })}
					/>
					<EditableField
						label="Tracking number"
						initial={pii.trackingNumber ?? ''}
						onSave={(value) => patchTracking(pii.orderRef, { trackingNumber: value })}
					/>
					<EditableField
						label="Tracking URL"
						initial={pii.trackingUrl ?? ''}
						onSave={(value) => patchTracking(pii.orderRef, { trackingUrl: value })}
					/>
					<Box>
						<Text size={1} muted>
							Saved automatically when you leave a field.
						</Text>
					</Box>
				</Stack>
			)}
		</PanelShell>
	);
}

export function InternalNotesField() {
	const state = usePii();
	return (
		<PanelShell title="Internal notes (DynamoDB)" state={state}>
			{(pii) => (
				<Stack space={3}>
					<EditableField
						label="Never shown to customer"
						initial={pii.internalNotes ?? ''}
						multiline
						onSave={(value) => patchInternalNotes(pii.orderRef, value)}
					/>
				</Stack>
			)}
		</PanelShell>
	);
}
