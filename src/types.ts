import type { Store, Source } from '../server/knowledge';
export type { Store, Source };
export type AgentId = 'maya' | 'gus';
export type CallStatus = 'idle' | 'connecting' | 'listening' | 'thinking' | 'speaking' | 'transferring' | 'ended' | 'error';
export type Agent = { id: AgentId; name: string; voice: string; role: string; personality: string };
export type Config = { voiceConfigured: boolean; model: string; agents: Record<AgentId, Agent>; stores: Store[]; metadata: { file: string; sha256: string; sheets: string[] }; counts: { prices: number; turnaround: number; kiosk: number }; tools: { name: string; description: string }[]; categories: string[] };
export type Transcript = { id: string; role: 'user' | 'assistant' | 'event'; agent: AgentId; text: string; time: number };
export type ToolEvent = { id: string; name: string; arguments: Record<string, unknown>; result?: unknown; error?: string; time: number };
export type CallState = { status: CallStatus; agent: AgentId; muted: boolean; startedAt: number | null; error: string | null; level: number };
export type Knowledge = {
  status: string; store?: Store | string; total?: number; query?: string; caveat?: string | null; instruction?: string; reason?: string; answer?: string; source?: Source; cutoff?: string; holidayCaveat?: string; fasterServiceRequiresStaff?: boolean;
  matches?: { item?: string; category?: string; price?: number | string | null; quoteable?: boolean; unit?: string; description?: string; action?: string; scopeConflict?: boolean; question?: string; answer?: string | null; topic?: string; source: Source }[];
  options?: { readyDay: string; readyAfter: string; days: number; start: string; end: string; wording: string; source: Source }[];
};
