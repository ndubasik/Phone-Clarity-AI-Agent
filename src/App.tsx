import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Activity, ArrowDownToLine, ArrowRight, ArrowUpRight, AudioLines, BookOpen, Check, CheckCheck, ChevronDown, CircleHelp, Clock3, Code2, FileSpreadsheet, Headphones, MapPin, MessageCircle, Mic, MicOff, Phone, PhoneForwarded, PhoneOff, Radio, Search, Send, Settings2, ShieldCheck, Sparkles, Volume2, X, Zap } from 'lucide-react';
import { api } from './api';
import { VoiceCall, initialCallState } from './realtime';
import type { AgentId, CallState, Config, Knowledge, Source, ToolEvent, Transcript } from './types';

type Page = 'playground' | 'knowledge' | 'agents';
type KnowledgeKind = 'prices' | 'turnaround' | 'kiosk' | 'store';
const dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const prettyTool = (name: string) => ({ get_store_details: 'Store details', search_prices: 'Price lookup', get_turnaround: 'Turnaround lookup', search_kiosk: 'Kiosk help', get_staff_availability: 'Staff availability', transfer_call: 'Transfer call', end_call: 'End call' }[name] || name);
const timeLabel = (time: number) => new Date(time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const activeStatuses = new Set(['connecting', 'listening', 'thinking', 'speaking', 'transferring']);

function SourceTag({ source }: { source: Source }) { return <span className="source-tag"><FileSpreadsheet size={11} />{source.sheet} · row {source.row}</span>; }
function VoiceMark({ small = false }: { small?: boolean }) { return <div className={`voice-mark ${small ? 'small' : ''}`} aria-hidden="true"><span /><span /><span /><span /></div>; }

export default function App() {
  const [config, setConfig] = useState<Config | null>(null);
  const [loadError, setLoadError] = useState('');
  const [page, setPage] = useState<Page>('playground');
  const [storeId, setStoreId] = useState('solon');
  const [callState, setCallState] = useState<CallState>(initialCallState);
  const [transcript, setTranscript] = useState<Transcript[]>([]);
  const [tools, setTools] = useState<ToolEvent[]>([]);
  const [panel, setPanel] = useState<'transcript' | 'tools'>('transcript');
  const [text, setText] = useState('');
  const [elapsed, setElapsed] = useState(0);
  const [help, setHelp] = useState(false);
  const [knowledgeKind, setKnowledgeKind] = useState<KnowledgeKind>('prices');
  const [query, setQuery] = useState('');
  const call = useRef<VoiceCall | null>(null);
  const transcriptEnd = useRef<HTMLDivElement>(null);
  const helpDialog = useRef<HTMLElement>(null);
  const active = activeStatuses.has(callState.status);
  const connected = ['listening', 'thinking', 'speaking'].includes(callState.status);
  const store = config?.stores.find(store => store.id === storeId);
  const agent = config?.agents[callState.agent];

  const load = () => { setLoadError(''); void api<Config>('/api/config').then(setConfig).catch(error => setLoadError(error.message)); };
  useEffect(load, []);
  useEffect(() => {
    const voice = new VoiceCall({ state: setCallState, transcript: setTranscript, tools: setTools, store: setStoreId });
    call.current = voice;
    return () => voice.dispose();
  }, []);
  useEffect(() => {
    if (!active || !callState.startedAt) return;
    const tick = () => setElapsed(Math.floor((Date.now() - callState.startedAt!) / 1000));
    tick(); const timer = setInterval(tick, 1000); return () => clearInterval(timer);
  }, [active, callState.startedAt]);
  useEffect(() => { transcriptEnd.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }, [transcript, panel]);
  useEffect(() => {
    if (!help) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setHelp(false);
      if (event.key === 'Tab') {
        const focusable = helpDialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input, select, [tabindex="0"]');
        if (!focusable?.length) return;
        const first = focusable[0], last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => { document.body.style.overflow = previousOverflow; document.removeEventListener('keydown', onKeyDown); if (previousFocus?.isConnected) previousFocus.focus(); };
  }, [help]);

  const explore = (kind: KnowledgeKind, value = '') => { setKnowledgeKind(kind); setQuery(value); setPage('knowledge'); };
  const ask = (question: string, kind: KnowledgeKind, search = '') => { if (connected) { if (!call.current?.sendText(question)) setText(question); } else explore(kind, search); };
  const start = () => { setElapsed(0); void call.current?.start(storeId); };
  const exportTranscript = () => {
    const content = transcript.map(item => `[${timeLabel(item.time)}] ${item.role === 'event' ? 'Call' : item.role === 'user' ? 'You' : item.agent === 'maya' ? 'Maya' : 'Gus'}: ${item.text}`).join('\n\n');
    const url = URL.createObjectURL(new Blob([content], { type: 'text/plain' }));
    const link = document.createElement('a'); link.href = url; link.download = 'clarity-conversation.txt'; link.click(); URL.revokeObjectURL(url);
  };
  if (!config) return <div className="loading-screen"><VoiceMark /><h1>Clarity</h1><p>{loadError || 'Opening your voice workspace…'}</p>{loadError && <button className="primary-button" onClick={load}>Try again</button>}</div>;

  return <div className="app-shell">
    <aside className="sidebar">
      <a className="brand" href="#" onClick={e => { e.preventDefault(); setPage('playground'); }}><VoiceMark /><div>clarity<span>VOICE WORKSPACE</span></div></a>
      <div className="workspace-label">YOUR WORKSPACE</div>
      <nav aria-label="Main navigation">
        <button className={page === 'playground' ? 'nav-item selected' : 'nav-item'} onClick={() => setPage('playground')}><AudioLines size={19} />Voice playground<span className="nav-dot" /></button>
        <button className={page === 'knowledge' ? 'nav-item selected' : 'nav-item'} onClick={() => setPage('knowledge')}><BookOpen size={19} />Knowledge base</button>
        <button className={page === 'agents' ? 'nav-item selected' : 'nav-item'} onClick={() => setPage('agents')}><Settings2 size={19} />Agent setup</button>
      </nav>
      <div className="sidebar-divider" />
      <div className="workspace-label agent-label">YOUR AGENTS <span>2</span></div>
      <button className="sidebar-agent" onClick={() => setPage('agents')}><div className="avatar maya">M<span /></div><div><strong>Maya</strong><small>Primary concierge</small></div><span className="agent-line" /></button>
      <button className="sidebar-agent" onClick={() => setPage('agents')}><div className="avatar gus">G<span /></div><div><strong>Gus</strong><small>Transfer agent</small></div><ArrowUpRight size={14} /></button>
      <div className="sidebar-bottom">
        <div className="source-card"><div><span className="file-icon"><FileSpreadsheet size={19} /></span><span className="tiny-pill"><span />Connected</span></div><strong>A little local knowledge.</strong><p>Your store guide is the source<br />behind every answer.</p><button onClick={() => setPage('knowledge')}>Explore the store guide <ArrowRight size={14} /></button></div>
        <button className="help-button" onClick={() => setHelp(true)}><CircleHelp size={17} />How this works<ArrowUpRight size={14} /></button>
        <div className="workspace-owner"><div className="owner-avatar">RC</div><div><strong>Rite & Don Royal</strong><small>Store voice concierge</small></div></div>
      </div>
    </aside>
    <div className="main-shell">
      <header className="topbar"><div className="breadcrumb">Workspace <span>/</span> <strong>{page === 'playground' ? 'Voice playground' : page === 'knowledge' ? 'Knowledge base' : 'Agent setup'}</strong></div><div className="topbar-right"><span className="demo-badge">DEMO WORKSPACE</span><button className="icon-button" aria-label="How this works" onClick={() => setHelp(true)}><CircleHelp size={18} /></button><div className="owner-avatar mini">ND</div></div></header>
      <main>
        <div className="page-heading"><div><div className="eyebrow">{page === 'playground' ? 'GOOD CONVERSATIONS START HERE' : page === 'knowledge' ? 'GROUNDED IN YOUR STORE GUIDE' : 'TWO PERSONALITIES. ONE SOURCE OF TRUTH.'}</div><h1>{page === 'playground' ? 'A voice for your business.' : page === 'knowledge' ? 'The knowledge behind the voice.' : 'Meet your voice team.'}</h1><p>{page === 'playground' ? 'Ask a question, try a handoff, and hear the difference.' : page === 'knowledge' ? 'Real store information. Looked up when it matters.' : 'A warm welcome, a grumpy handoff, and a little personality.'}</p></div><div className="model-badge"><span className={config.voiceConfigured ? 'status-dot' : 'status-dot amber'} />OpenAI Realtime<ChevronDown size={12} /></div></div>
        {page === 'playground' && <>
          <div className="playground-grid">
            <section className={`call-card ${callState.agent === 'gus' && active ? 'gus-call' : ''}`} aria-label="Voice call">
              <div className="call-topline"><span className="section-label"><Radio size={14} /> LIVE CONVERSATION</span><span className={`status-pill ${active ? 'live' : ''}`}><span />{active ? 'Session active' : callState.status === 'ended' ? 'Session ended' : 'Ready when you are'}</span></div>
              <div className="call-stage">
                <div className={`orb-scene ${callState.status}`} style={{ '--mic-level': callState.level } as CSSProperties}><div className="orb-ring ring-one" /><div className="orb-ring ring-two" /><div className="orb-ring ring-three" /><div className="orb"><div className="orb-gloss" /><AudioLines size={55} strokeWidth={1.5} /></div><div className="orb-badge"><Sparkles size={13} /> {active ? agent?.name : 'Maya'}</div></div>
                <h2>{callState.status === 'connecting' ? 'Making the connection…' : callState.status === 'transferring' ? 'One moment. Meet Gus.' : active ? callState.agent === 'gus' ? 'Gus is on the line.' : 'You’re in good hands.' : callState.status === 'ended' ? 'Until next time.' : 'Let’s clear things up.'}</h2>
                <p>{active ? callState.status === 'speaking' ? `${agent?.name} is speaking. You can interrupt naturally.` : callState.status === 'thinking' ? 'Finding a little clarity for you…' : callState.status === 'transferring' ? 'A new voice. The same conversation.' : callState.muted ? 'Your microphone is muted.' : 'Go ahead. Your agent is listening.' : callState.status === 'ended' ? 'Your conversation is here whenever you need it.' : 'Meet Maya, your AI store concierge.\nJust speak naturally. She’ll take it from there.'}</p>
                <div className="waveform" aria-hidden="true">{Array.from({ length: 25 }, (_, i) => <span key={i} style={{ height: `${4 + (active ? Math.abs(Math.sin(i * 1.7)) * (callState.status === 'speaking' ? 20 : callState.level * 40) : Math.abs(Math.sin(i * 0.7)) * 8)}px`, animationDelay: `${i * 0.07}s` }} className={callState.status === 'speaking' ? 'speaking-bar' : ''} />)}</div>
                {active ? <div className="active-controls"><button className={`control-button ${callState.muted ? 'muted' : ''}`} aria-label={callState.muted ? 'Unmute microphone' : 'Mute microphone'} onClick={() => call.current?.toggleMute()} disabled={!connected}>{callState.muted ? <MicOff size={20} /> : <Mic size={20} />}</button><button className="end-button" onClick={() => call.current?.end()}><PhoneOff size={18} />{connected ? 'End call' : 'Cancel'}</button><button className="control-button" aria-label="Transfer to Gus" disabled={!connected || callState.agent === 'gus'} onClick={() => void call.current?.transfer()}><PhoneForwarded size={20} /></button></div> : <button className="start-button" disabled={!config.voiceConfigured} onClick={start}><Phone size={18} fill="currentColor" />{callState.status === 'ended' || callState.status === 'error' ? 'Start a new call' : 'Start a conversation'}<ArrowRight size={17} /></button>}
                <span className="call-fineprint">{active ? <><span className="status-dot" />{String(Math.floor(elapsed / 60)).padStart(2, '0')}:{String(elapsed % 60).padStart(2, '0')}<span className="fineprint-separator">·</span>{agent?.voice} voice</> : <><Mic size={12} />{config.voiceConfigured ? 'Microphone access required · AI-generated voice' : 'Voice needs an API key · Store guide is available'}</>}</span>
              </div>
              {callState.error && <div className="call-error" role="alert"><span>{callState.error}</span>{callState.error.includes('playback') && <button onClick={() => void call.current?.enableAudio()}>Enable audio</button>}</div>}
              <div className="store-picker"><div className="location-icon"><MapPin size={18} /></div><div><label htmlFor="call-store">YOUR STORE</label><div className="select-wrap"><select id="call-store" value={storeId} onChange={e => setStoreId(e.target.value)} disabled={active}>{config.stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select><ChevronDown size={15} /></div></div><span className="store-region">{storeId === 'fox-chapel' ? 'Pennsylvania' : 'Ohio'}</span></div>
              <div className="try-section"><span>NOT SURE WHERE TO START?</span><div className="question-chips"><button onClick={() => ask('What are your opening hours?', 'store')}>“When are you open?” <ArrowUpRight size={12} /></button><button onClick={() => ask('How much is dry cleaning a shirt?', 'prices', 'shirt')}>“How much for a shirt?” <ArrowUpRight size={12} /></button><button onClick={() => ask('How do I use the kiosk?', 'kiosk', 'how it works')}>“How does the kiosk work?” <ArrowUpRight size={12} /></button></div></div>
            </section>
            <section className="conversation-card" aria-label="Conversation details"><div className="conversation-heading"><div className="panel-tabs"><button className={panel === 'transcript' ? 'active' : ''} onClick={() => setPanel('transcript')}>Transcript</button><button className={panel === 'tools' ? 'active' : ''} onClick={() => setPanel('tools')}>Tool activity {tools.length > 0 && <span>{tools.length}</span>}</button></div><button className="icon-button" aria-label="Download transcript" disabled={!transcript.length} onClick={exportTranscript}><ArrowDownToLine size={17} /></button></div>
              <div className="transcript-area" aria-live="polite" aria-relevant="additions text">
                {panel === 'transcript' ? transcript.length ? <div className="transcript-items">{transcript.map(item => item.role === 'event' ? <div className="conversation-event" key={item.id}><span />{item.text}</div> : <div key={item.id} className={`message ${item.role}`}><div className="message-meta"><span className={`mini-avatar ${item.role === 'user' ? 'user' : item.agent}`}>{item.role === 'user' ? 'Y' : item.agent === 'maya' ? 'M' : 'G'}</span><strong>{item.role === 'user' ? 'You' : item.agent === 'maya' ? 'Maya' : 'Gus'}</strong><time>{timeLabel(item.time)}</time></div><p>{item.text}</p></div>)}<div ref={transcriptEnd} /></div> : <div className="empty-transcript"><div className="empty-chat-art"><MessageCircle size={29} strokeWidth={1.2} /><span><AudioLines size={17} /></span></div><h3>A conversation worth following.</h3><p>Your words and your agent’s answers<br />will appear here as you talk.</p><span className="empty-line" /><div><span />Live transcript</div></div> : tools.length ? <div className="tool-events">{tools.map(tool => <details key={tool.id} className="tool-event"><summary><span className={tool.error ? 'tool-icon error' : 'tool-icon'}>{tool.error ? <X size={14} /> : tool.result ? <Check size={14} /> : <Activity size={14} />}</span><div><strong>{prettyTool(tool.name)}</strong><small>{timeLabel(tool.time)}</small></div><ChevronDown size={13} /></summary><pre>{JSON.stringify({ arguments: tool.arguments, result: tool.result, error: tool.error }, null, 2)}</pre></details>)}</div> : <div className="empty-transcript"><div className="empty-chat-art"><Zap size={28} strokeWidth={1.3} /></div><h3>A little work behind the words.</h3><p>Store lookups and call actions<br />will appear here in real time.</p></div>}
              </div>
              <form className="text-input" onSubmit={e => { e.preventDefault(); if (call.current?.sendText(text)) setText(''); }}><input aria-label="Type a message" placeholder={connected ? 'Or type your question…' : 'Start a call to send a message…'} value={text} onChange={e => setText(e.target.value)} maxLength={1000} disabled={!connected} /><button type="submit" aria-label="Send message" disabled={!connected || !text.trim() || callState.status === 'thinking'}><Send size={16} /></button></form><div className="transcript-note"><ShieldCheck size={12} />Transcript stays in this browser session.</div>
            </section>
          </div>
          {!config.voiceConfigured && <div className="setup-banner"><span className="setup-icon"><Headphones size={19} /></span><div><strong>Your voice team is almost on the line.</strong><p>Add a server API key to enable live calls. The knowledge base is ready to explore.</p></div><button onClick={() => setPage('agents')}>Finish setup <ArrowRight size={15} /></button></div>}
          <div className="section-intro"><h3>A small team. A lot of possibility.</h3><span>BUILT FOR THE WHOLE CONVERSATION</span></div>
          <div className="feature-grid"><button onClick={() => explore('prices')} className="feature-card"><span className="feature-icon lilac"><MessageCircle size={21} /></span><h3>Answers, with a source.</h3><p>Prices, hours, turnaround, and kiosk help.<br />Straight from your store guide.</p><span className="feature-link">Explore the knowledge <ArrowUpRight size={14} /></span></button><button onClick={() => setPage('agents')} className="feature-card"><span className="feature-icon peach"><PhoneForwarded size={21} /></span><h3>A handoff with character.</h3><p>Meet Gus. A different voice, a drier wit.<br />Your conversation comes along.</p><span className="feature-link">Meet the other agent <ArrowUpRight size={14} /></span></button><button onClick={() => setHelp(true)} className="feature-card"><span className="feature-icon mint"><PhoneOff size={21} /></span><h3>Knows when to say goodbye.</h3><p>Just say you’re all set. Your agent can<br />wrap things up and end the call.</p><span className="feature-link">See how it works <ArrowUpRight size={14} /></span></button></div>
        </>}
        {page === 'knowledge' && <KnowledgePanel config={config} storeId={storeId} setStoreId={setStoreId} active={active} kind={knowledgeKind} setKind={setKnowledgeKind} query={query} setQuery={setQuery} />}
        {page === 'agents' && <AgentsPanel config={config} storeId={storeId} refresh={load} />}
        <footer><span><VoiceMark small />Made for a clearer conversation.</span><span>Rite Cleaners <i /> Don Royal Cleaners</span></footer>
      </main>
    </div>
    {active && page !== 'playground' && <button className="floating-call" onClick={() => setPage('playground')}><AudioLines size={19} />{agent?.name} is on the line <ArrowRight size={16} /></button>}
    {help && <div className="modal-backdrop" onClick={() => setHelp(false)}><section ref={helpDialog} className="help-modal" role="dialog" aria-modal="true" aria-labelledby="help-title" onClick={e => e.stopPropagation()}><button className="modal-close icon-button" aria-label="Close help" autoFocus onClick={() => setHelp(false)}><X size={21} /></button><span className="feature-icon lilac"><AudioLines size={24} /></span><h2 id="help-title">One conversation. A little clarity.</h2><p>Choose your store, start a call, and allow microphone access. Maya answers using the uploaded store guide.</p><div className="help-step"><span>01</span><div><strong>Ask naturally</strong><p>Try hours, garment prices, ready days, or kiosk help. You can interrupt, mute, or type during a call.</p></div></div><div className="help-step"><span>02</span><div><strong>“Transfer me to Gus.”</strong><p>The demo starts a new Realtime session with Cedar’s voice and a grumpy personality, carrying over your recent conversation. This is an AI handoff, not a store employee.</p></div></div><div className="help-step"><span>03</span><div><strong>“That’s all. Goodbye.”</strong><p>The agent can disconnect after its farewell. You can always use End call yourself.</p></div></div><div className="help-note">Audio is processed by OpenAI. This app does not store recordings. The transcript is held in memory until you reload or start a new call; download it if you want a copy.</div><button className="primary-button" onClick={() => setHelp(false)}>Got it <Check size={16} /></button></section></div>}
  </div>;
}

function KnowledgePanel({ config, storeId, setStoreId, active, kind, setKind, query, setQuery }: { config: Config; storeId: string; setStoreId: (id: string) => void; active: boolean; kind: KnowledgeKind; setKind: (kind: KnowledgeKind) => void; query: string; setQuery: (query: string) => void }) {
  const [data, setData] = useState<Knowledge | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [day, setDay] = useState('Monday');
  const [time, setTime] = useState('');
  const [category, setCategory] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError('');
    const timer = setTimeout(() => {
      const params = new URLSearchParams({ store: storeId, kind, q: query, day });
      if (time) params.set('time', time);
      if (category && kind === 'prices') params.set('category', category);
      void api<Knowledge>(`/api/knowledge?${params}`, { signal: controller.signal }).then(setData).catch(error => { if (error.name !== 'AbortError') setError(error.message); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    }, 200);
    return () => { controller.abort(); clearTimeout(timer); };
  }, [storeId, kind, query, day, time, category]);
  const selectedStore = config.stores.find(s => s.id === storeId)!;
  const tabs: { id: KnowledgeKind; label: string }[] = [{ id: 'prices', label: 'Price list' }, { id: 'turnaround', label: 'Turnaround' }, { id: 'kiosk', label: 'Kiosk guide' }, { id: 'store', label: 'Store details' }];
  return <>
    <div className="knowledge-summary"><div className="knowledge-file"><span className="file-icon"><FileSpreadsheet size={23} /></span><div><strong>{config.metadata.file}</strong><p>4 sheets · 7 stores · Imported from your workbook</p></div><span className="verified-badge"><CheckCheck size={15} />Source connected</span></div><div className="knowledge-stats"><div><strong>{config.counts.prices.toLocaleString()}</strong><span>price entries</span></div><div><strong>{config.counts.turnaround}</strong><span>schedule entries</span></div><div><strong>{config.counts.kiosk}</strong><span>kiosk answers</span></div></div></div>
    <section className="knowledge-panel"><div className="knowledge-toolbar"><div className="knowledge-tabs" role="tablist" aria-label="Guide sheets">{tabs.map(tab => <button role="tab" aria-selected={kind === tab.id} className={kind === tab.id ? 'active' : ''} key={tab.id} onClick={() => { setKind(tab.id); setQuery(''); }}>{tab.label}</button>)}</div><label className="knowledge-store"><MapPin size={15} /><select aria-label="Knowledge store" value={storeId} disabled={active} onChange={e => setStoreId(e.target.value)}>{config.stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label></div>
      {kind === 'prices' || kind === 'kiosk' ? <div className="search-toolbar"><div className="search-input"><Search size={17} /><input aria-label="Search store guide" value={query} maxLength={160} onChange={e => setQuery(e.target.value)} placeholder={kind === 'prices' ? 'Search a garment, service, or item…' : 'Search pickup, payment, drop-off…'} />{query && <button className="icon-button" aria-label="Clear search" onClick={() => setQuery('')}><X size={15} /></button>}</div>{kind === 'prices' && <select className="category-select" aria-label="Price category" value={category} onChange={e => setCategory(e.target.value)}><option value="">All categories</option>{config.categories.map(c => <option key={c}>{c}</option>)}</select>}</div> : kind === 'turnaround' ? <div className="schedule-filters"><label>Drop-off day<select aria-label="Drop-off day" value={day} onChange={e => setDay(e.target.value)}>{dayNames.map(d => <option key={d}>{d}</option>)}</select></label><label>Drop-off time (Eastern)<input aria-label="Drop-off time (Eastern)" type="time" value={time} onChange={e => setTime(e.target.value)} /></label><button className="text-button" onClick={() => setTime('')}>Time unknown</button></div> : null}
      <div className="knowledge-result" aria-busy={loading}>{error ? <div className="result-notice error" role="alert">{error}</div> : loading ? <div className="data-loading">Looking through the store guide…</div> : data && <>
        {kind === 'prices' && <><div className="result-count">{data.total || 0} matching entries <span>· {selectedStore.name}</span></div>{data.matches?.length ? <div className="table-scroll"><table><thead><tr><th>Item / service</th><th>Category</th><th>Price</th><th>Source</th></tr></thead><tbody>{data.matches.map(row => <tr key={row.source.row}><td><strong>{row.item}</strong>{row.description && <small>{row.description}</small>}</td><td><span className="category-tag">{row.category}</span></td><td><span className={row.quoteable ? 'price' : 'confirm-price'}>{row.quoteable ? typeof row.price === 'number' ? `$${row.price.toFixed(2)}` : row.price : 'Ask store staff'}</span>{row.unit?.includes('upcharge') && <small>added to base price</small>}{row.scopeConflict && <small>Scope needs confirmation</small>}</td><td><SourceTag source={row.source} /></td></tr>)}</tbody></table></div> : <div className="no-results"><Search size={25} /><h3>No matching price in this store guide.</h3><p>Try a shorter item name or a different category. Unlisted prices need store confirmation.</p></div>}{(data.total || 0) > (data.matches?.length || 0) && <p className="result-notice">Showing the {data.matches?.length} closest entries. Narrow your search to find a specific item.</p>}{data.caveat && <p className="result-notice">{data.caveat}</p>}</>}
        {kind === 'turnaround' && <>{data.reason ? <p className="result-notice">{data.reason}</p> : <><div className="result-count"><Clock3 size={15} />Standard schedule <span>· Cutoff {data.cutoff}</span></div><div className="schedule-options">{data.options?.map((option, i) => <div className="schedule-option" key={option.source.row}><span className="option-number">{String(i + 1).padStart(2, '0')}</span><div><h3>{option.readyDay} <span>after {option.readyAfter}</span></h3><p>{option.wording}</p><SourceTag source={option.source} /></div></div>)}</div>{data.fasterServiceRequiresStaff && <p className="result-notice">A faster turnaround may be possible, but requires confirmation from store staff.</p>}<p className="result-notice">{data.holidayCaveat}</p></>}</>}
        {kind === 'kiosk' && <>{data.answer ? <p className="result-notice">{data.answer}</p> : data.matches?.length ? <div className="faq-list">{data.matches.map(row => <details key={row.source.row}><summary><span>{row.question}</span><ChevronDown size={17} /></summary><p>{row.answer || 'No confirmed answer. Please contact store staff.'}</p><div><span className="category-tag">{row.topic}</span><SourceTag source={row.source} /></div></details>)}</div> : <div className="no-results"><h3>No answer found for that topic.</h3><p>Try a shorter phrase. Maya will flag unanswered questions instead of guessing.</p></div>}</>}
        {kind === 'store' && <div className="store-details"><div className="store-details-heading"><span className="feature-icon lilac"><MapPin size={24} /></span><div><h2>{selectedStore.name}</h2><p>{selectedStore.address}</p><a href={`tel:${selectedStore.phone}`}>{selectedStore.phone}</a></div></div><dl><div><dt>Public access</dt><dd>{selectedStore.publicHours}</dd></div><div><dt>Staffed hours</dt><dd>{selectedStore.staffedHours}</dd></div><div><dt>Tailor on-site</dt><dd>{selectedStore.tailorHours}</dd></div><div><dt>Kiosk access</dt><dd>{selectedStore.kiosk}</dd></div></dl><SourceTag source={selectedStore.source} /></div>}
      </>}</div>
    </section><div className="knowledge-footnote"><ShieldCheck size={15} />Unconfirmed prices and conflicting workbook entries are held for staff confirmation. Every result links back to its source row.</div>
  </>;
}

function AgentsPanel({ config, storeId, refresh }: { config: Config; storeId: string; refresh: () => void }) {
  const [selected, setSelected] = useState<AgentId>('maya');
  const [prompt, setPrompt] = useState('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  useEffect(() => { const controller = new AbortController(); setPrompt(''); setError(''); void api<{ instructions: string }>(`/api/agents/${selected}/prompt?store=${storeId}`, { signal: controller.signal }).then(data => setPrompt(data.instructions)).catch(error => { if (error.name !== 'AbortError') setError(error.message); }); return () => controller.abort(); }, [selected, storeId]);
  return <>
    <div className="agent-cards">{Object.values(config.agents).map(agent => <button key={agent.id} onClick={() => setSelected(agent.id)} className={`agent-detail-card ${agent.id} ${selected === agent.id ? 'selected' : ''}`}><div className="agent-card-top"><div className={`avatar large ${agent.id}`}>{agent.id === 'maya' ? 'M' : 'G'}</div><span className="agent-type">{agent.id === 'maya' ? 'PRIMARY AGENT' : 'DEMO TRANSFER AGENT'}</span>{selected === agent.id && <span className="agent-check"><Check size={14} /></span>}</div><h2>{agent.name}<span>{agent.role}</span></h2><p>{agent.personality}</p><div className="voice-tag"><Volume2 size={15} />{agent.voice.charAt(0).toUpperCase() + agent.voice.slice(1)} voice<span>OpenAI Realtime</span></div></button>)}</div>
    <div className="agent-config-grid"><section className="config-card"><div className="config-card-title"><Settings2 size={18} /><h3>Voice connection</h3><span className={config.voiceConfigured ? 'connection-pill connected' : 'connection-pill'}>{config.voiceConfigured ? 'Key configured' : 'Key needed'}</span></div><p>The API key stays on your server. The browser connects directly to the voice service over WebRTC.</p><dl className="config-values"><div><dt>Provider</dt><dd>OpenAI Realtime</dd></div><div><dt>Model</dt><dd><code>{config.model}</code></dd></div><div><dt>Server variable</dt><dd><code>REALTIME_API_KEY</code></dd></div><div><dt>Connection</dt><dd>WebRTC · no media bridge</dd></div></dl><div className="setup-instruction">{config.voiceConfigured ? 'A key is configured. Start a call to verify model access, audio, and your microphone.' : 'Add REALTIME_API_KEY securely in environment settings, then restart the server. For local development, use .env as shown in the README.'}</div><button className="secondary-button" onClick={refresh}>Check connection settings <ArrowRight size={14} /></button></section><section className="config-card"><div className="config-card-title"><Zap size={18} /><h3>Tools at their fingertips</h3><span className="tool-count">7</span></div><p>Detailed information is fetched when needed. General guidance stays in the agent’s initial prompt.</p><div className="tools-list">{config.tools.map(tool => <div key={tool.name} title={tool.description}><Check size={13} /><span>{prettyTool(tool.name)}</span><code>{tool.name}</code></div>)}</div></section></div>
    <section className="config-card prompt-card"><div className="config-card-title"><Code2 size={18} /><h3>{config.agents[selected].name}’s instructions</h3><button className="text-button" disabled={!prompt} onClick={() => { void navigator.clipboard.writeText(prompt).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); }).catch(() => setError('Clipboard is unavailable. You can select and copy the instructions below.')); }}>{copied ? 'Copied' : 'Copy prompt'}{copied ? <Check size={14} /> : <Code2 size={14} />}</button></div><p>The selected store, personality, company overview, and rules. Detailed price, schedule, and kiosk rows stay in tools.</p>{error && <p role="alert" className="result-notice error">{error}</p>}<details><summary>View the full system prompt <ChevronDown size={16} /></summary><pre>{prompt || 'Loading instructions…'}</pre></details></section>
    <div className="knowledge-footnote"><PhoneForwarded size={15} />Gus is an AI demo transfer. Real phone routing, order systems, staff alerts, and callback delivery are not connected.</div>
  </>;
}
