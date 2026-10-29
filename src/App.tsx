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
  Play,
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
import {
  createDefaultSentinelRuntime,
  defaultCommandCapability,
  type AgentManifest,
  type AuditEvent,
  type ExecutionRequest,
} from './core/runtime'

type NavKey = 'home' | 'agents' | 'flows' | 'memory' | 'devices' | 'activity' | 'settings'
type AgentStatus = 'online' | 'working' | 'idle'

type Agent = {
  id: string
  name: string
  role: string
  status: AgentStatus
  accent: string
  tasks: number
}

const nav = [
  ['home', 'Command Center', Home],
  ['agents', 'Agents', Bot],
  ['flows', 'Automations', Workflow],
  ['memory', 'Memory', Brain],
  ['devices', 'Devices', Cpu],
  ['activity', 'Activity', Activity],
  ['settings', 'Settings', Settings],
] as const

const initialAgents: Agent[] = [
  { id: 'orchestrator', name: 'Orchestrator', role: 'Plans, delegates, supervises', status: 'online', accent: 'violet', tasks: 4 },
  { id: 'civitas', name: 'Civitas', role: 'Multi-agent coordination layer', status: 'working', accent: 'cyan', tasks: 8 },
  { id: 'dev', name: 'Developer', role: 'Repositories, tests, deployments', status: 'working', accent: 'green', tasks: 3 },
  { id: 'research', name: 'Research', role: 'Web, documents, extraction', status: 'online', accent: 'blue', tasks: 1 },
  { id: 'memory', name: 'Memory', role: 'Context, recall, project state', status: 'online', accent: 'orange', tasks: 0 },
  { id: 'policy', name: 'Sentinel Guard', role: 'Permissions and approval gates', status: 'online', accent: 'rose', tasks: 2 },
]

const activity = [
  ['Civitas', 'Delegated Sentinel UI implementation to Developer Agent', '12 sec ago'],
  ['Developer', 'Validated repository structure and build configuration', '38 sec ago'],
  ['Sentinel Guard', 'Approved scoped GitHub write access', '1 min ago'],
  ['Research', 'Indexed architecture context for Sentinel Core', '4 min ago'],
]

function StatusDot({ status }: { status: AgentStatus }) {
  return <span className={`status-dot ${status}`} />
}

function EmptyPanel({ title, copy, icon: Icon }: { title: string; copy: string; icon: typeof Bot }) {
  return (
    <div className="empty-panel glass">
      <Icon size={34} />
      <h2>{title}</h2>
      <p>{copy}</p>
      <button className="primary"><Plus size={16} /> Add capability</button>
    </div>
  )
}

export default function App() {
  const [active, setActive] = useState<NavKey>('home')
  const [mobileNav, setMobileNav] = useState(false)
  const [command, setCommand] = useState('')
  const [agents, setAgents] = useState(initialAgents)
  const [events, setEvents] = useState(activity)
  const [isRunning, setIsRunning] = useState(false)
  const [approvalId, setApprovalId] = useState('')
  const [approvalRequestId, setApprovalRequestId] = useState('')
  const [approvalGoal, setApprovalGoal] = useState('')
  const [approvalStatus, setApprovalStatus] = useState<string | null>(null)
  const [syncError, setSyncError] = useState<string | null>(null)
  const [jobs, setJobs] = useState<Array<Record<string, unknown>>>([])
  const [memoryRecords, setMemoryRecords] = useState<Array<Record<string, unknown>>>([])
  const [devices, setDevices] = useState<Array<Record<string, unknown>>>([])
  const [automations, setAutomations] = useState<Array<Record<string, unknown>>>([])
  const [jobSearch, setJobSearch] = useState('')
  const runtime = useMemo(() => createDefaultSentinelRuntime(), [])

  const working = useMemo(() => agents.filter((a) => a.status === 'working').length, [agents])
  const filteredJobs = useMemo(() => {
    const query = jobSearch.trim().toLowerCase()
    if (!query) return jobs
    return jobs.filter((job) => JSON.stringify(job).toLowerCase().includes(query))
  }, [jobs, jobSearch])

  useEffect(() => {
    let cancelled = false
    async function syncControlPlane() {
      try {
        const adapter = runtime.civitas
        const [remoteAgents, remoteEvents, remoteJobs, remoteMemory, remoteDevices, remoteAutomations] = await Promise.all([
          adapter.listAgents?.(),
          adapter.listAuditEvents?.(),
          adapter.listJobs?.(),
          adapter.listMemory?.(),
          adapter.listDevices?.(),
          adapter.listAutomations?.(),
        ])
        if (cancelled) return
        if (remoteAgents) {
          const nextAgents: Agent[] = remoteAgents.map((agent: AgentManifest, index: number) => ({
            id: agent.id,
            name: agent.name,
            role: agent.role,
            status: agent.state === 'executing' || agent.state === 'planning' ? 'working' : agent.state === 'offline' ? 'idle' : 'online',
            accent: ['violet', 'cyan', 'green', 'blue', 'orange', 'rose'][index % 6],
            tasks: 0,
          }))
          setAgents(nextAgents)
        }
        if (remoteEvents) {
          setEvents(remoteEvents.map((event: AuditEvent) => [event.actor, event.message, event.at]))
        }
        if (remoteJobs) setJobs(remoteJobs)
        if (remoteMemory) setMemoryRecords(remoteMemory)
        if (remoteDevices) setDevices(remoteDevices)
        if (remoteAutomations) setAutomations(remoteAutomations)
        setSyncError(null)
      } catch (error) {
        if (!cancelled) setSyncError(error instanceof Error ? error.message : 'Control plane sync failed')
      }
    }
    void syncControlPlane()
    return () => { cancelled = true }
  }, [runtime])

  async function requestWriteApproval() {
    const text = command.trim()
    if (!text || isRunning) return
    try {
      const request: ExecutionRequest = {
        requestId: globalThis.crypto?.randomUUID?.() ?? `req-${Date.now()}`,
        principal: 'owner',
        agentId: 'developer',
        capabilityId: 'repo.write',
        input: { goal: text },
      }
      const approval = await runtime.requestApproval(request)
      setApprovalId(approval.approvalId)
      setApprovalRequestId(approval.requestId)
      setApprovalGoal(text)
      setApprovalStatus(approval.status)
      setEvents((prev) => [['Sentinel Guard', `Approval requested: ${approval.approvalId}`, 'now'], ...prev].slice(0, 8))
    } catch (error) {
      setApprovalStatus(error instanceof Error ? error.message : 'Approval request failed')
    }
  }

  async function approveWriteApproval() {
    if (!approvalId) return
    try {
      const approval = await runtime.approveApproval(approvalId)
      setApprovalStatus(approval.status)
    } catch (error) {
      setApprovalStatus(error instanceof Error ? error.message : 'Approval failed')
    }
  }

  async function rejectWriteApproval() {
    if (!approvalId) return
    try {
      const approval = await runtime.rejectApproval(approvalId)
      setApprovalStatus(approval.status)
    } catch (error) {
      setApprovalStatus(error instanceof Error ? error.message : 'Rejection failed')
    }
  }

  async function resumeApprovedWork() {
    if (!approvalId || !approvalRequestId || !approvalGoal) return
    try {
      const receipt = await runtime.execute({
        requestId: approvalRequestId,
        approvalId,
        principal: 'owner',
        agentId: 'developer',
        capabilityId: 'repo.write',
        input: { goal: approvalGoal },
      }, true)
      const detail = receipt.status === 'completed' ? 'completed' : receipt.error ?? receipt.policy.reason
      setEvents((prev) => [['Developer', `${receipt.status} · ${detail}`, 'now'], ...prev].slice(0, 8))
      setApprovalStatus(receipt.status)
    } catch (error) {
      setApprovalStatus(error instanceof Error ? error.message : 'Approved work failed')
    }
  }

  async function cancelJob(jobId: string) {
    try {
      const job = await runtime.cancelJob(jobId)
      setJobs((previous) => previous.map((item) => item.jobId === jobId ? job : item))
      setEvents((prev) => [['Operator', `Cancelled job ${jobId}`, 'now'], ...prev].slice(0, 8))
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : 'Job cancellation failed')
    }
  }

  async function runCommand() {
    const text = command.trim()
    if (!text || isRunning) return
    setIsRunning(true)
    const requestId = globalThis.crypto?.randomUUID?.() ?? `req-${Date.now()}`
    setEvents((prev) => [['Orchestrator', `Submitted command: “${text}”`, 'now'], ...prev].slice(0, 8))
    setAgents((prev) => prev.map((a) => a.id === 'orchestrator' ? { ...a, status: 'working', tasks: a.tasks + 1 } : a))

    try {
      const request: ExecutionRequest = {
        requestId,
        principal: 'owner',
        agentId: 'orchestrator',
        capabilityId: defaultCommandCapability(),
        input: { goal: text },
      }
      const receipt = await runtime.execute(request)
      const result = receipt.result && typeof receipt.result === 'object'
        ? receipt.result as { status?: string; mode?: string }
        : {}
      const mode = result.mode === 'local-development' ? ' (local development adapter)' : ''
      const detail = receipt.status === 'completed'
        ? result.status ?? 'completed'
        : receipt.error ?? receipt.policy.reason
      setEvents((prev) => [['Orchestrator', `${receipt.status} · ${detail}${mode}`, 'now'], ...prev].slice(0, 8))
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Execution failed'
      setEvents((prev) => [['Sentinel Guard', `Execution failed: ${message}`, 'now'], ...prev].slice(0, 8))
    } finally {
      setIsRunning(false)
      setAgents((prev) => prev.map((a) => a.id === 'orchestrator' ? { ...a, status: 'online' } : a))
      setCommand('')
    }
  }

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileNav ? 'open' : ''}`}>
        <div className="brand-row">
          <div className="brand-mark"><ShieldCheck size={19} /></div>
          <div><strong>SENTINEL</strong><span>OS / ALPHA</span></div>
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
            <small>6 agents connected · 12 capabilities</small>
          </div>
          <div className="profile-row"><div className="avatar">S</div><div><strong>Local Authority</strong><span>Owner / Admin</span></div><ChevronRight size={16} /></div>
        </div>
      </aside>

      <main>
        <header className="topbar">
          <button className="icon-btn menu-btn" onClick={() => setMobileNav(true)}><Menu size={20} /></button>
          <div className="crumb"><CircleDot size={15} /><span>Sentinel Core</span><b>/</b><strong>{nav.find(([k]) => k === active)?.[1]}</strong></div>
          <div className="top-actions">
            <button className="ghost"><Search size={17} /><span>Search</span><kbd>⌘ K</kbd></button>
            <button className="icon-btn"><MessageSquareText size={18} /></button>
            <div className="live-pill"><span /> LIVE</div>
          </div>
        </header>

        <div className="page">
          {active === 'home' && (
            <>
              <section className="hero-row">
                <div>
                  <div className="eyebrow"><Sparkles size={14} /> AGENTIC CONTROL PLANE</div>{syncError && <small className="sync-error">Live control plane: {syncError}</small>}
                  <h1>Your digital world,<br/><span>under one command.</span></h1>
                  <p>Sentinel coordinates agents, devices, memory, automations, and approvals from one secure operating layer.</p>
                </div>
                <div className="orbit-card glass">
                  <div className="orbit orbit-1"/><div className="orbit orbit-2"/><div className="core-node"><ShieldCheck size={28}/></div>
                  <div className="satellite s1"><Bot size={15}/></div><div className="satellite s2"><Brain size={15}/></div><div className="satellite s3"><Cpu size={15}/></div>
                </div>
              </section>

              <section className="command-card glass">
                <div className="command-head"><div><Command size={18}/><strong>Command Sentinel</strong></div><span>Orchestrator ready</span></div>
                <div className="command-input">
                  <textarea value={command} onChange={(e) => setCommand(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); runCommand() } }} placeholder="Tell Sentinel what you want accomplished…" />
                  <button onClick={runCommand} disabled={isRunning}><Zap size={17}/> {isRunning ? 'Running…' : 'Execute'}</button>
                </div>
                <div className="approval-tools">
                  <button className="ghost" onClick={requestWriteApproval} disabled={isRunning || !command.trim()}>Request write approval</button>
                  {approvalId && <span>Approval {approvalId.slice(0, 16)} · {approvalStatus}</span>}
                  {approvalId && approvalStatus === 'pending' && <><button className="ghost" onClick={approveWriteApproval}>Approve</button><button className="ghost" onClick={rejectWriteApproval}>Reject</button></>}
                  {approvalId && approvalStatus === 'approved' && <button className="ghost" onClick={resumeApprovedWork}>Resume approved work</button>}
                </div>
                <div className="suggestions">
                  <button onClick={() => setCommand('Scan my active projects and prioritize the next three actions')}>Prioritize projects</button>
                  <button onClick={() => setCommand('Show every agent currently working and what each owns')}>Agent status</button>
                  <button onClick={() => setCommand('Review recent activity for anything requiring my approval')}>Approval review</button>
                </div>
              </section>

              <section className="metric-grid">
                <div className="metric glass"><span>AGENTS</span><strong>{agents.length}</strong><small>{working} actively working</small><Bot size={22}/></div>
                <div className="metric glass"><span>CAPABILITIES</span><strong>12</strong><small>Across 5 domains</small><Layers3 size={22}/></div>
                <div className="metric glass"><span>AUTOMATIONS</span><strong>7</strong><small>5 healthy · 2 paused</small><Workflow size={22}/></div>
                <div className="metric glass"><span>MEMORY</span><strong>84%</strong><small>Context relevance</small><Database size={22}/></div>
              </section>

              <section className="content-grid">
                <div className="panel glass">
                  <div className="panel-title"><div><Bot size={18}/><strong>Agent network</strong></div><button onClick={() => setActive('agents')}>View all <ChevronRight size={15}/></button></div>
                  <div className="agent-list">
                    {agents.slice(0,4).map((agent) => <div className="agent-row" key={agent.id}><div className={`agent-icon ${agent.accent}`}><Bot size={17}/></div><div><strong>{agent.name}</strong><span>{agent.role}</span></div><div className="agent-state"><StatusDot status={agent.status}/>{agent.status}<small>{agent.tasks} tasks</small></div></div>)}
                  </div>
                </div>
                <div className="panel glass">
                  <div className="panel-title"><div><Activity size={18}/><strong>Live activity</strong></div><button onClick={() => setActive('activity')}>History <ChevronRight size={15}/></button></div>
                  <div className="timeline">
                    {events.slice(0,4).map(([who, what, when], i) => <div className="event" key={`${who}-${i}`}><span className="event-dot"/><div><strong>{who}</strong><p>{what}</p><small>{when}</small></div></div>)}
                  </div>
                </div>
              </section>
            </>
          )}

          {active === 'agents' && (
            <section>
              <div className="section-head"><div><div className="eyebrow"><Network size={14}/> CIVITAS NETWORK</div><h1>Agent workforce</h1><p>Inspect every autonomous worker, its current responsibility, and execution state.</p></div><button className="primary"><Plus size={16}/> Register agent</button></div>
              <div className="agent-grid">{agents.map((agent) => <article className="agent-card glass" key={agent.id}><div className="agent-card-top"><div className={`agent-icon large ${agent.accent}`}><Bot size={22}/></div><div className="state-chip"><StatusDot status={agent.status}/>{agent.status}</div></div><h3>{agent.name}</h3><p>{agent.role}</p><div className="agent-card-meta"><span><TerminalSquare size={14}/>{agent.tasks} tasks</span><span><ShieldCheck size={14}/> scoped</span></div><button className="agent-open">Open agent <ChevronRight size={15}/></button></article>)}</div>
            </section>
          )}

          {active === 'activity' && (
            <section>
              <div className="section-head"><div><div className="eyebrow"><Activity size={14}/> AUDIT STREAM</div><h1>System activity</h1><p>Every material action performed by Sentinel and its agents.</p></div></div>
              <div className="panel glass full">
                <div className="command-input"><input value={jobSearch} onChange={(event) => setJobSearch(event.target.value)} placeholder="Search live jobs and receipts…" /></div>
                {filteredJobs.length > 0 && <div className="timeline expanded">{filteredJobs.map((job) => {
                  const jobId = typeof job.jobId === 'string' ? job.jobId : 'unknown-job'
                  const status = typeof job.status === 'string' ? job.status : 'unknown'
                  const error = typeof job.error === 'string' ? job.error : ''
                  return <div className="event" key={jobId}><span className="event-dot"/><div><strong>{jobId}</strong><p>{status}{error ? ` · ${error}` : ''}</p><small>{typeof job.requestId === 'string' ? job.requestId : 'no request id'}</small>{(status === 'queued' || status === 'running') && <button className="ghost" onClick={() => void cancelJob(jobId)}>Cancel</button>}</div></div>
                })}</div>}
                <div className="timeline expanded">{events.map(([who, what, when], i) => <div className="event" key={`${who}-${i}`}><span className="event-dot"/><div><strong>{who}</strong><p>{what}</p><small>{when}</small></div></div>)}</div>
              </div>
            </section>
          )}

          {active === 'flows' && (
            <section>
              <div className="section-head"><div><div className="eyebrow"><Workflow size={14}/> AUTOMATIONS</div><h1>Automation Studio</h1><p>Live persisted automations from Civitas.</p></div></div>
              <div className="panel glass full">{automations.length === 0 ? <p>No automation store is configured.</p> : automations.map((automation, index) => <div className="agent-row" key={String(automation.id ?? index)}><div><strong>{String(automation.name ?? automation.id ?? 'Automation')}</strong><span>{String(automation.status ?? 'configured')}</span></div></div>)}</div>
            </section>
          )}
          {active === 'memory' && (
            <section>
              <div className="section-head"><div><div className="eyebrow"><Brain size={14}/> MEMORY</div><h1>Sentinel Memory</h1><p>Durable tenant-scoped context from Civitas.</p></div></div>
              <div className="panel glass full">{memoryRecords.length === 0 ? <p>No persisted memory records.</p> : memoryRecords.map((record, index) => <div className="event" key={String(record.id ?? index)}><span className="event-dot"/><div><strong>{String(record.memoryType ?? 'memory')}</strong><p>{String(record.content ?? record.value ?? 'record')}</p><small>{String(record.state ?? 'active')}</small></div></div>)}</div>
            </section>
          )}
          {active === 'devices' && (
            <section>
              <div className="section-head"><div><div className="eyebrow"><Cpu size={14}/> DEVICE FABRIC</div><h1>Paired devices</h1><p>Live tenant-scoped device credentials and states.</p></div></div>
              <div className="panel glass full">{devices.length === 0 ? <p>No paired devices.</p> : devices.map((device, index) => <div className="agent-row" key={String(device.deviceId ?? index)}><div><strong>{String(device.name ?? device.deviceId ?? 'Device')}</strong><span>{String(device.status ?? 'paired')} · {String(device.scopes ?? '')}</span></div></div>)}</div>
            </section>
          )}
          {active === 'settings' && <EmptyPanel title="System Configuration" copy="Configure authority boundaries, providers, agent defaults, integrations, and execution policy." icon={Settings} />}
        </div>
      </main>
    </div>
  )
}
