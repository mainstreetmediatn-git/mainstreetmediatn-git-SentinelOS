import { useEffect, useMemo, useState } from 'react'
import {
  Activity,
  Bot,
  Brain,
  ChevronRight,
  CircleDot,
  Command,
  Cpu,
  Database,
  Home,
  Layers3,
  Menu,
  MessageSquareText,
  Network,
  Plus,
  Radio,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  TerminalSquare,
  Workflow,
  X,
  Zap,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { createSentinelCore, type SentinelCoreApi, type SentinelState } from './core/api'
import type { AgentManifest, AgentState, ExecutionReceipt } from './core/runtime'
import type { PairingChallenge } from './core/auth'

type NavKey = 'home' | 'agents' | 'flows' | 'memory' | 'devices' | 'activity' | 'settings'
type UiStatus = 'online' | 'working' | 'idle' | 'blocked'

const nav: Array<[NavKey, string, LucideIcon]> = [
  ['home', 'Command Center', Home],
  ['agents', 'Agents', Bot],
  ['flows', 'Automations', Workflow],
  ['memory', 'Memory', Brain],
  ['devices', 'Devices', Cpu],
  ['activity', 'Activity', Activity],
  ['settings', 'Settings', Settings],
]

function makeRequestId() {
  const uuid = globalThis.crypto?.randomUUID?.()
  return uuid ? 'req-' + uuid : 'req-' + Date.now().toString(36)
}

function uiStatus(state: AgentState): UiStatus {
  if (state === 'executing' || state === 'planning') return 'working'
  if (state === 'blocked' || state === 'needs_approval' || state === 'failed') return 'blocked'
  if (state === 'offline' || state === 'paused') return 'idle'
  return 'online'
}

function agentAccent(id: string) {
  const accents: Record<string, string> = {
    orchestrator: 'violet',
    civitas: 'cyan',
    developer: 'green',
    research: 'blue',
    memory: 'orange',
    policy: 'rose',
  }
  return accents[id] ?? 'violet'
}

function relativeTime(value: string) {
  const seconds = Math.max(0, Math.round((Date.now() - Date.parse(value)) / 1000))
  if (seconds < 10) return 'now'
  if (seconds < 60) return seconds + ' sec ago'
  if (seconds < 3600) return Math.round(seconds / 60) + ' min ago'
  return Math.round(seconds / 3600) + ' hr ago'
}

function StatusDot({ status }: { status: UiStatus }) {
  return <span className={'status-dot ' + status} />
}

function EmptyPanel({ title, copy, icon: Icon }: { title: string; copy: string; icon: LucideIcon }) {
  return (
    <div className="empty-panel glass">
      <Icon size={34} />
      <h2>{title}</h2>
      <p>{copy}</p>
      <button className="primary"><Plus size={16} /> Add capability</button>
    </div>
  )
}

function ApprovalPanel({ state, core }: { state: SentinelState; core: SentinelCoreApi }) {
  const approvals = state.approvals.filter((approval) => approval.status === 'pending')
  if (!approvals.length) return null

  return (
    <section className="panel glass approvals-panel">
      <div className="panel-title"><div><ShieldCheck size={18} /><strong>Approval queue</strong></div><span className="queue-count">{approvals.length} pending</span></div>
      {approvals.map((approval) => (
        <div className="approval-row" key={approval.id}>
          <div>
            <strong>{approval.capabilityId}</strong>
            <span>{approval.agentId} · {approval.risk} risk</span>
          </div>
          <div className="approval-actions">
            <button className="approval-reject" onClick={() => core.reject(approval.id)}>Reject</button>
            <button className="approval-approve" onClick={() => core.approve(approval.id)}>Approve</button>
          </div>
        </div>
      ))}
    </section>
  )
}

function DevicesPanel({ core, state }: { core: SentinelCoreApi; state: SentinelState }) {
  const [challenge, setChallenge] = useState<PairingChallenge | null>(null)
  const [code, setCode] = useState('')
  const [label, setLabel] = useState('New Sentinel device')
  const [error, setError] = useState('')

  function createChallenge() {
    setError('')
    setChallenge(core.createPairingChallenge(label, ['device.execute', 'device.status']))
    setCode('')
  }

  function pairDevice() {
    if (!challenge) return
    try {
      core.pairDevice(challenge, code)
      setChallenge(null)
      setCode('')
      setError('')
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Pairing failed.')
    }
  }

  return (
    <section>
      <div className="section-head">
        <div><div className="eyebrow"><Cpu size={14} /> DEVICE FABRIC</div><h1>Connected devices</h1><p>Pair local runtimes with explicit capabilities and revocable authority tokens.</p></div>
      </div>
      <div className="device-layout">
        <div className="panel glass pair-card">
          <div className="panel-title"><div><Radio size={18} /><strong>Pair a device</strong></div><span>10 min challenge</span></div>
          <label>Device label<input value={label} onChange={(event) => setLabel(event.target.value)} /></label>
          <button className="primary" onClick={createChallenge}><Plus size={16} /> Create pairing challenge</button>
          {challenge && (
            <div className="pairing-challenge">
              <span>Enter this code on the device</span>
              <strong>{challenge.code}</strong>
              <small>Challenge {challenge.id.slice(0, 16)}…</small>
              <div className="pair-code-row"><input value={code} onChange={(event) => setCode(event.target.value)} placeholder="6-digit code" inputMode="numeric" /><button className="approval-approve" onClick={pairDevice}>Pair</button></div>
            </div>
          )}
          {error && <p className="inline-error">{error}</p>}
        </div>
        <div className="panel glass">
          <div className="panel-title"><div><Database size={18} /><strong>Paired inventory</strong></div><span>{state.devices.length} devices</span></div>
          {!state.devices.length && <p className="muted-copy">No devices are paired yet.</p>}
          {state.devices.map((device) => (
            <div className="device-row" key={device.id}>
              <div className="device-icon"><Cpu size={16} /></div>
              <div><strong>{device.label}</strong><span>{device.capabilities.join(' · ')}</span></div>
              <div className="device-state"><StatusDot status={device.status === 'paired' ? 'online' : 'idle'} />{device.status}<button onClick={() => core.revokeDevice(device.id)}>Revoke</button></div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function SettingsPanel({ core, state }: { core: SentinelCoreApi; state: SentinelState }) {
  return (
    <section>
      <div className="section-head"><div><div className="eyebrow"><Settings size={14} /> AUTHORITY</div><h1>System configuration</h1><p>Authentication, policy, and local authority state for this Sentinel instance.</p></div></div>
      <div className="settings-grid">
        <div className="panel glass setting-card">
          <div className="panel-title"><div><ShieldCheck size={18} /><strong>Authentication</strong></div><span className={state.session ? 'healthy-label' : 'warning-label'}>{state.session ? 'authenticated' : 'signed out'}</span></div>
          {state.session ? <><h3>{state.session.user.name}</h3><p>{state.session.user.role} · session expires {new Date(state.session.expiresAt).toLocaleTimeString()}</p><button className="ghost wide-button" onClick={() => core.signOut()}>Sign out</button></> : <button className="primary" onClick={() => core.signIn()}>Sign in as local authority</button>}
        </div>
        <div className="panel glass setting-card">
          <div className="panel-title"><div><ShieldCheck size={18} /><strong>Policy engine</strong></div><span className="healthy-label">enforced</span></div>
          <h3>{state.approvals.filter((approval) => approval.status === 'pending').length} pending approvals</h3>
          <p>High and critical risk capabilities require an explicit approval record before Civitas execution.</p>
          <button className="ghost wide-button" onClick={() => { window.location.hash = 'activity' }}>Review audit stream</button>
        </div>
      </div>
    </section>
  )
}

export default function App() {
  const core = useMemo(() => createSentinelCore({ civitasEndpoint: import.meta.env.VITE_CIVITAS_URL }), [])
  const [state, setState] = useState<SentinelState>(() => core.getState())
  const [active, setActive] = useState<NavKey>('home')
  const [mobileNav, setMobileNav] = useState(false)
  const [command, setCommand] = useState('')
  const [lastReceipt, setLastReceipt] = useState<ExecutionReceipt | null>(null)
  const [commandError, setCommandError] = useState('')

  useEffect(() => core.subscribe(setState), [core])

  const agents = state.agents
  const working = useMemo(() => agents.filter((agent) => uiStatus(agent.state) === 'working').length, [agents])
  const pendingApprovals = state.approvals.filter((approval) => approval.status === 'pending')

  async function runCommand() {
    const text = command.trim()
    if (!text || !state.session) return
    setCommandError('')
    try {
      const receipt = await core.execute({
        requestId: makeRequestId(),
        agentId: 'orchestrator',
        capabilityId: 'task.plan',
        input: { goal: text },
        constraints: { timeoutMs: 30000 },
      })
      setLastReceipt(receipt)
      setCommand('')
    } catch (error) {
      setCommandError(error instanceof Error ? error.message : 'Command failed.')
    }
  }

  function renderAgent(agent: AgentManifest) {
    const status = uiStatus(agent.state)
    return (
      <div className="agent-row" key={agent.id}>
        <div className={'agent-icon ' + agentAccent(agent.id)}><Bot size={17} /></div>
        <div><strong>{agent.name}</strong><span>{agent.role}</span></div>
        <div className="agent-state"><StatusDot status={status} />{status}<small>{agent.capabilities.length} capabilities</small></div>
      </div>
    )
  }

  return (
    <div className="app-shell">
      <aside className={'sidebar ' + (mobileNav ? 'open' : '')}>
        <div className="brand-row">
          <div className="brand-mark"><ShieldCheck size={19} /></div>
          <div><strong>SENTINEL</strong><span>OS / CORE</span></div>
          <button className="icon-btn mobile-close" onClick={() => setMobileNav(false)}><X size={18} /></button>
        </div>
        <nav>
          {nav.map(([key, label, Icon]) => (
            <button key={key} className={active === key ? 'nav-item active' : 'nav-item'} onClick={() => { setActive(key); setMobileNav(false) }}>
              <Icon size={18} /><span>{label}</span>{key === 'agents' && <em>{working}</em>}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="system-health">
            <div className="health-line"><span><Radio size={14} /> Core status</span><b>Healthy</b></div>
            <div className="health-meter"><i /></div>
            <small>{agents.length} agents connected · {state.capabilities.length} capabilities</small>
          </div>
          <div className="profile-row"><div className="avatar">S</div><div><strong>{state.session?.user.name ?? 'Signed out'}</strong><span>{state.session?.user.role ?? 'Authentication required'}</span></div><ChevronRight size={16} /></div>
        </div>
      </aside>

      <main>
        <header className="topbar">
          <button className="icon-btn menu-btn" onClick={() => setMobileNav(true)}><Menu size={20} /></button>
          <div className="crumb"><CircleDot size={15} /><span>Sentinel Core</span><b>/</b><strong>{nav.find(([key]) => key === active)?.[1]}</strong></div>
          <div className="top-actions">
            <button className="ghost"><Search size={17} /><span>Search</span><kbd>⌘ K</kbd></button>
            <button className="icon-btn"><MessageSquareText size={18} /></button>
            <div className={state.session ? 'live-pill' : 'live-pill offline-pill'}><span /> {state.session ? 'LIVE' : 'AUTH REQUIRED'}</div>
          </div>
        </header>

        <div className="page">
          {active === 'home' && (
            <>
              <section className="hero-row">
                <div>
                  <div className="eyebrow"><Sparkles size={14} /> AGENTIC CONTROL PLANE</div>
                  <h1>Your digital world,<br /><span>under one command.</span></h1>
                  <p>Sentinel coordinates agents, devices, memory, automations, and approvals from one secure operating layer.</p>
                </div>
                <div className="orbit-card glass"><div className="orbit orbit-1" /><div className="orbit orbit-2" /><div className="core-node"><ShieldCheck size={28} /></div><div className="satellite s1"><Bot size={15} /></div><div className="satellite s2"><Brain size={15} /></div><div className="satellite s3"><Cpu size={15} /></div></div>
              </section>

              <section className="command-card glass">
                <div className="command-head"><div><Command size={18} /><strong>Command Sentinel</strong></div><span>{state.session ? 'Orchestrator ready' : 'Sign in to execute'}</span></div>
                <div className="command-input">
                  <textarea value={command} disabled={!state.session} onChange={(event) => setCommand(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void runCommand() } }} placeholder="Tell Sentinel what you want accomplished…" />
                  <button disabled={!state.session} onClick={() => void runCommand()}><Zap size={17} /> Execute</button>
                </div>
                <div className="suggestions">
                  <button onClick={() => setCommand('Scan my active projects and prioritize the next three actions')}>Prioritize projects</button>
                  <button onClick={() => setCommand('Show every agent currently working and what each owns')}>Agent status</button>
                  <button onClick={() => setCommand('Review recent activity for anything requiring my approval')}>Approval review</button>
                </div>
                {lastReceipt && <div className={'receipt-banner ' + lastReceipt.status}><strong>Receipt {lastReceipt.status}</strong><span>{lastReceipt.receiptId} · {lastReceipt.policy.reason}</span></div>}
                {commandError && <p className="inline-error">{commandError}</p>}
              </section>

              <section className="metric-grid">
                <div className="metric glass"><span>AGENTS</span><strong>{agents.length}</strong><small>{working} actively working</small><Bot size={22} /></div>
                <div className="metric glass"><span>CAPABILITIES</span><strong>{state.capabilities.length}</strong><small>Protocol registered</small><Layers3 size={22} /></div>
                <div className="metric glass"><span>APPROVALS</span><strong>{pendingApprovals.length}</strong><small>Awaiting authority</small><ShieldCheck size={22} /></div>
                <div className="metric glass"><span>DEVICES</span><strong>{state.devices.length}</strong><small>Paired runtimes</small><Cpu size={22} /></div>
              </section>

              <ApprovalPanel state={state} core={core} />

              <section className="content-grid">
                <div className="panel glass">
                  <div className="panel-title"><div><Bot size={18} /><strong>Agent network</strong></div><button onClick={() => setActive('agents')}>View all <ChevronRight size={15} /></button></div>
                  <div className="agent-list">{agents.slice(0, 4).map(renderAgent)}</div>
                </div>
                <div className="panel glass">
                  <div className="panel-title"><div><Activity size={18} /><strong>Durable activity</strong></div><button onClick={() => setActive('activity')}>History <ChevronRight size={15} /></button></div>
                  <div className="timeline">
                    {state.events.slice(0, 4).map((event) => <div className="event" key={event.id}><span className="event-dot" /><div><strong>{event.actor}</strong><p>{event.message}</p><small>{relativeTime(event.at)}</small></div></div>)}
                    {!state.events.length && <p className="muted-copy">No audit events yet.</p>}
                  </div>
                </div>
              </section>
            </>
          )}

          {active === 'agents' && (
            <section>
              <div className="section-head"><div><div className="eyebrow"><Network size={14} /> CIVITAS NETWORK</div><h1>Agent workforce</h1><p>Typed manifests, declared capabilities, heartbeat state, and policy-scoped execution.</p></div><button className="primary" onClick={() => setActive('settings')}><Plus size={16} /> Register agent</button></div>
              <div className="agent-grid">{agents.map((agent) => <article className="agent-card glass" key={agent.id}><div className="agent-card-top"><div className={'agent-icon large ' + agentAccent(agent.id)}><Bot size={22} /></div><div className="state-chip"><StatusDot status={uiStatus(agent.state)} />{uiStatus(agent.state)}</div></div><h3>{agent.name}</h3><p>{agent.role}</p><div className="agent-card-meta"><span><TerminalSquare size={14} />{agent.capabilities.length} capabilities</span><span><ShieldCheck size={14} />{agent.protocolVersion}</span></div><button className="agent-open" onClick={() => setActive('activity')}>View receipts <ChevronRight size={15} /></button></article>)}</div>
            </section>
          )}

          {active === 'activity' && (
            <section>
              <div className="section-head"><div><div className="eyebrow"><Activity size={14} /> AUDIT STREAM</div><h1>System activity</h1><p>Durable events, policy decisions, approvals, authentication, and execution receipts.</p></div></div>
              <div className="panel glass full"><div className="timeline expanded">{state.events.map((event) => <div className="event" key={event.id}><span className="event-dot" /><div><strong>{event.actor} · {event.type}</strong><p>{event.message}</p><small>{new Date(event.at).toLocaleString()}</small></div></div>)}{!state.events.length && <p className="muted-copy">No audit events yet.</p>}</div></div>
            </section>
          )}

          {active === 'devices' && <DevicesPanel core={core} state={state} />}
          {active === 'settings' && <SettingsPanel core={core} state={state} />}
          {active === 'flows' && <EmptyPanel title="Automation Studio" copy="Build event-driven and scheduled workflows that connect Sentinel capabilities without hard-wiring agents together." icon={Workflow} />}
          {active === 'memory' && <EmptyPanel title="Sentinel Memory" copy="Search project context, episodic history, knowledge, and durable system state from one retrieval layer." icon={Brain} />}
        </div>
      </main>
    </div>
  )
}
