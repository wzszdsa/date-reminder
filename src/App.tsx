import { useEffect, useMemo, useRef, useState } from 'react'
import type { ChangeEvent, FormEvent, ReactNode, UIEvent } from 'react'
import './App.css'

type CategoryKey = 'love' | 'family' | 'friends' | 'birthday' | 'milestone'
type Theme = 'light' | 'dark'
type PanelKey = 'home' | 'events' | 'manage'
type MemoryEvent = {
  id: string
  name: string
  date: string
  recurring: boolean
  category: CategoryKey
  icon: string
  notes: string
  reminderEnabled: boolean
  reminderDays: number[]
  pinned: boolean
}
type EventDraft = Omit<MemoryEvent, 'id'>
type CategoryOption = { key: CategoryKey; label: string; icon: string; tone: string }
type Duration = { years: number; months: number; days: number; hours: number; minutes: number; seconds: number }
type EventState = {
  kind: 'upcoming' | 'today' | 'elapsed'
  original: Date
  target: Date | null
  elapsed: Duration | null
  countdown: Duration
  targetLabel: string
  nextLabel: string
}

const STORAGE_KEY = 'memory-days.events.v1'
const THEME_KEY = 'memory-days.theme.v1'
const SENT_REMINDER_KEY = 'memory-days.sent-reminders.v1'
const MS_PER_SECOND = 1000
const MS_PER_DAY = 24 * 60 * 60 * 1000
const CATEGORY_OPTIONS: CategoryOption[] = [
  { key: 'love', label: '恋爱', icon: '♡', tone: 'rose' },
  { key: 'family', label: '家人', icon: '⌂', tone: 'sage' },
  { key: 'friends', label: '朋友', icon: '✦', tone: 'blue' },
  { key: 'birthday', label: '生日', icon: '✺', tone: 'gold' },
  { key: 'milestone', label: '里程碑', icon: '◌', tone: 'lavender' },
]
const REMINDER_OPTIONS = [
  { value: 7, label: '提前 7 天' },
  { value: 3, label: '提前 3 天' },
  { value: 1, label: '提前 1 天' },
  { value: 0, label: '当天提醒' },
]
const PANEL_LABELS: { key: PanelKey; label: string; hint: string }[] = [
  { key: 'home', label: '重点', hint: '重点纪念日' },
  { key: 'events', label: '全部', hint: '所有记录' },
  { key: 'manage', label: '管理', hint: '新增与设置' },
]
const DEFAULT_EVENTS: MemoryEvent[] = [
  { id: 'demo-love', name: '在一起的日子', date: '2023-09-22', recurring: true, category: 'love', icon: '♡', notes: '把每一个普通的日子，过成值得纪念的日子。', reminderEnabled: true, reminderDays: [7, 1, 0], pinned: true },
  { id: 'demo-family', name: '第一次一起旅行', date: '2022-06-05', recurring: true, category: 'family', icon: '⌂', notes: '记得那一趟沿海公路和傍晚的风。', reminderEnabled: true, reminderDays: [1], pinned: false },
  { id: 'demo-birthday', name: '妈妈的生日', date: '2026-10-18', recurring: true, category: 'birthday', icon: '✺', notes: '提前准备一束花。', reminderEnabled: true, reminderDays: [7, 3, 0], pinned: false },
]

function startOfDay(date: Date) { return new Date(date.getFullYear(), date.getMonth(), date.getDate()) }
function parseDate(value: string) { const [year, month, day] = value.split('-').map(Number); return new Date(year, month - 1, day) }
function sameDate(left: Date, right: Date) { return left.getFullYear() === right.getFullYear() && left.getMonth() === right.getMonth() && left.getDate() === right.getDate() }
function isLeapYear(year: number) { return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) }
function daysInMonth(year: number, month: number) { return new Date(year, month + 1, 0).getDate() }
function addYears(date: Date, years: number) {
  const year = date.getFullYear() + years
  const day = date.getMonth() === 1 && date.getDate() === 29 && !isLeapYear(year) ? 28 : date.getDate()
  return new Date(year, date.getMonth(), Math.min(day, daysInMonth(year, date.getMonth())), date.getHours(), date.getMinutes(), date.getSeconds(), date.getMilliseconds())
}
function addMonths(date: Date, months: number) {
  const total = date.getFullYear() * 12 + date.getMonth() + months
  const year = Math.floor(total / 12)
  const month = total % 12
  return new Date(year, month, Math.min(date.getDate(), daysInMonth(year, month)), date.getHours(), date.getMinutes(), date.getSeconds(), date.getMilliseconds())
}
function annualOccurrence(date: Date, year: number) {
  const day = date.getMonth() === 1 && date.getDate() === 29 && !isLeapYear(year) ? 28 : date.getDate()
  return new Date(year, date.getMonth(), day)
}
function zeroDuration(): Duration { return { years: 0, months: 0, days: 0, hours: 0, minutes: 0, seconds: 0 } }
function getPreciseDuration(from: Date, to: Date): Duration {
  if (to <= from) return zeroDuration()
  let years = to.getFullYear() - from.getFullYear()
  let cursor = addYears(from, years)
  if (cursor > to) { years -= 1; cursor = addYears(from, years) }
  let months = (to.getFullYear() - cursor.getFullYear()) * 12 + to.getMonth() - cursor.getMonth()
  let monthCursor = addMonths(cursor, months)
  if (monthCursor > to) { months -= 1; monthCursor = addMonths(cursor, months) }
  let remaining = to.getTime() - monthCursor.getTime()
  const days = Math.floor(remaining / MS_PER_DAY); remaining -= days * MS_PER_DAY
  const hours = Math.floor(remaining / (60 * 60 * MS_PER_SECOND)); remaining -= hours * 60 * 60 * MS_PER_SECOND
  const minutes = Math.floor(remaining / (60 * MS_PER_SECOND)); remaining -= minutes * 60 * MS_PER_SECOND
  const seconds = Math.floor(remaining / MS_PER_SECOND)
  return { years, months, days, hours, minutes, seconds }
}
function formatDate(date: Date, weekday = false) { return new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', ...(weekday ? { weekday: 'long' } : {}) }).format(date) }
function formatShortDate(date: Date) { return new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric' }).format(date) }
function getCategory(category: CategoryKey) { return CATEGORY_OPTIONS.find((option) => option.key === category) ?? CATEGORY_OPTIONS[0] }
function durationTotalSeconds(duration: Duration) { return duration.years * 365 * 86400 + duration.months * 30 * 86400 + duration.days * 86400 + duration.hours * 3600 + duration.minutes * 60 + duration.seconds }
function getEventState(event: MemoryEvent, now: Date): EventState {
  const original = parseDate(event.date)
  const today = startOfDay(now)
  if (event.recurring) {
    const thisYear = annualOccurrence(original, now.getFullYear())
    const isToday = sameDate(thisYear, today)
    const hasArrived = thisYear < today
    const target = isToday ? thisYear : hasArrived ? annualOccurrence(original, now.getFullYear() + 1) : thisYear
    return {
      kind: isToday ? 'today' : hasArrived ? 'elapsed' : 'upcoming',
      original,
      target,
      elapsed: original <= now ? getPreciseDuration(original, now) : null,
      countdown: isToday ? zeroDuration() : getPreciseDuration(now, target),
      targetLabel: isToday ? '就是今天' : `距离 ${formatShortDate(target)} 还有`,
      nextLabel: `下一次 · ${formatDate(target)}`,
    }
  }
  const isToday = sameDate(original, today)
  if (isToday) return { kind: 'today', original, target: original, elapsed: getPreciseDuration(original, now), countdown: zeroDuration(), targetLabel: '就是今天', nextLabel: formatDate(original) }
  if (original > now) return { kind: 'upcoming', original, target: original, elapsed: null, countdown: getPreciseDuration(now, original), targetLabel: '距离这一天还有', nextLabel: formatDate(original) }
  return { kind: 'elapsed', original, target: null, elapsed: getPreciseDuration(original, now), countdown: zeroDuration(), targetLabel: '已经过去', nextLabel: formatDate(original) }
}
function sortEvents(events: MemoryEvent[], now: Date) {
  return [...events].sort((left, right) => {
    const a = getEventState(left, now); const b = getEventState(right, now)
    const aRank = a.kind === 'elapsed' ? 1000000000 : durationTotalSeconds(a.countdown)
    const bRank = b.kind === 'elapsed' ? 1000000000 : durationTotalSeconds(b.countdown)
    return aRank - bRank
  })
}
function createId() { return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `event-${Date.now()}` }
function getDefaultDraft(): EventDraft { const date = new Date(); date.setDate(date.getDate() + 7); return { name: '', date: date.toISOString().slice(0, 10), recurring: true, category: 'love', icon: '♡', notes: '', reminderEnabled: true, reminderDays: [1, 0], pinned: false } }
function isMemoryEvent(value: unknown): value is MemoryEvent {
  if (!value || typeof value !== 'object') return false
  const event = value as Partial<MemoryEvent>
  return typeof event.id === 'string' && typeof event.name === 'string' && typeof event.date === 'string' && typeof event.recurring === 'boolean' && typeof event.category === 'string' && typeof event.icon === 'string'
}
function loadEvents() { try { const stored = localStorage.getItem(STORAGE_KEY); if (!stored) return DEFAULT_EVENTS; const parsed: unknown = JSON.parse(stored); return Array.isArray(parsed) ? parsed.filter(isMemoryEvent) : DEFAULT_EVENTS } catch { return DEFAULT_EVENTS } }
function loadTheme(): Theme { const stored = localStorage.getItem(THEME_KEY); if (stored === 'light' || stored === 'dark') return stored; return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light' }
function getNotificationState(): NotificationPermission | 'unsupported' { return 'Notification' in window ? Notification.permission : 'unsupported' }

function DurationView({ duration, compact = false }: { duration: Duration; compact?: boolean }) {
  const units: [keyof Duration, string][] = [['years', '年'], ['months', '月'], ['days', '天'], ['hours', '时'], ['minutes', '分'], ['seconds', '秒']]
  return <div className={`duration-grid ${compact ? 'compact' : ''}`}>{units.map(([key, label]) => <div className="duration-unit" key={key}><strong>{duration[key]}</strong><span>{label}</span></div>)}</div>
}
function IconButton({ label, children, onClick }: { label: string; children: ReactNode; onClick: () => void }) { return <button className="icon-button" type="button" aria-label={label} title={label} onClick={onClick}>{children}</button> }

function MemoryCard({ event, now, onEdit, onPin }: { event: MemoryEvent; now: Date; onEdit: (event: MemoryEvent) => void; onPin: (event: MemoryEvent) => void }) {
  const category = getCategory(event.category)
  const state = getEventState(event, now)
  const primary = state.kind === 'elapsed' ? state.elapsed ?? zeroDuration() : state.countdown
  return <article className={`memory-card ${event.pinned ? 'is-pinned' : ''}`}>
    <div className="memory-card-head"><div className={`event-icon ${category.tone}`}>{event.icon}</div><div className="memory-card-actions">{event.pinned && <span className="mini-pin">重点</span>}<button type="button" aria-label={`编辑${event.name}`} onClick={() => onEdit(event)}>···</button></div></div>
    <div className="memory-card-body"><div className="event-category">{category.label} <span>·</span> {event.recurring ? '每年' : '一次性'}</div><h3>{event.name}</h3><p className="event-date">{formatDate(parseDate(event.date))}</p>{event.notes && <p className="event-notes">“{event.notes}”</p>}</div>
    <div className={`memory-metric ${state.kind}`}><div className="metric-title">{state.targetLabel}</div><DurationView duration={primary} compact />{state.kind === 'elapsed' && event.recurring && state.target && <div className="next-countdown"><span>距离下一次</span><strong>{state.nextLabel.replace('下一次 · ', '')}</strong><DurationView duration={state.countdown} compact /></div>}{state.kind === 'today' && state.elapsed && <div className="today-elapsed">从那天到现在 · {state.elapsed.years}年 {state.elapsed.months}月 {state.elapsed.days}天</div>}</div>
    <div className="memory-card-foot"><span>{event.reminderEnabled ? `提醒 ${event.reminderDays.length ? event.reminderDays.map((day) => day === 0 ? '当天' : `提前${day}天`).join('、') : '已开启'}` : '未开启提醒'}</span><button type="button" className="pin-button" onClick={() => onPin(event)}>{event.pinned ? '取消置顶' : '设为重点'}</button></div>
  </article>
}

function EditorPanel({ event, onSave, onDelete, onCancel }: { event: MemoryEvent | null; onSave: (draft: EventDraft, id?: string) => void; onDelete: (event: MemoryEvent) => void; onCancel: () => void }) {
  const [draft, setDraft] = useState<EventDraft>(() => event ? { ...event } : getDefaultDraft())
  const isEditing = Boolean(event)
  function updateDraft<K extends keyof EventDraft>(key: K, value: EventDraft[K]) { setDraft((current) => ({ ...current, [key]: value })) }
  function toggleReminderDay(day: number) { updateDraft('reminderDays', draft.reminderDays.includes(day) ? draft.reminderDays.filter((item) => item !== day) : [...draft.reminderDays, day].sort((a, b) => b - a)) }
  function submit(submitEvent: FormEvent<HTMLFormElement>) { submitEvent.preventDefault(); if (draft.name.trim()) onSave({ ...draft, name: draft.name.trim() }, event?.id) }
  return <section className="manage-panel panel" aria-labelledby="manage-title"><div className="panel-heading"><div><p className="eyebrow">管理记录</p><h2 id="manage-title">{isEditing ? '编辑这个重要的日子' : '记录一个新的日子'}</h2><p>保存后会立即出现在全部记录中。</p></div>{isEditing && event && <button className="quiet-button danger" type="button" onClick={() => onDelete(event)}>删除</button>}</div>
    <form className="event-form" onSubmit={submit}><label className="field full-width"><span>纪念日名称</span><input autoFocus required value={draft.name} onChange={(e) => updateDraft('name', e.target.value)} placeholder="例如：在一起的日子" /></label>
      <div className="form-grid"><label className="field"><span>日期</span><input type="date" required value={draft.date} onChange={(e) => updateDraft('date', e.target.value)} /></label><label className="field"><span>日期类型</span><select value={draft.recurring ? 'recurring' : 'once'} onChange={(e) => updateDraft('recurring', e.target.value === 'recurring')}><option value="recurring">每年重复</option><option value="once">一次性事件</option></select></label></div>
      <div className="field full-width"><span>分类</span><div className="category-picker">{CATEGORY_OPTIONS.map((option) => <button type="button" key={option.key} className={`category-option ${draft.category === option.key ? 'selected' : ''}`} onClick={() => { updateDraft('category', option.key); updateDraft('icon', option.icon) }}><span className={`category-icon ${option.tone}`}>{option.icon}</span><span>{option.label}</span></button>)}</div></div>
      <label className="field full-width"><span>备注 <small>选填</small></span><textarea value={draft.notes} onChange={(e) => updateDraft('notes', e.target.value)} placeholder="写下那天值得记住的一句话……" rows={3} /></label>
      <div className="form-section full-width"><div className="form-section-heading"><div><span className="field-label">提醒设置</span><small>在重要的日子到来前收到提醒</small></div><label className="switch-label"><input type="checkbox" checked={draft.reminderEnabled} onChange={(e) => updateDraft('reminderEnabled', e.target.checked)} /><span className="switch" /></label></div>{draft.reminderEnabled && <div className="reminder-picker">{REMINDER_OPTIONS.map((option) => <button type="button" key={option.value} className={`reminder-chip ${draft.reminderDays.includes(option.value) ? 'selected' : ''}`} onClick={() => toggleReminderDay(option.value)}>{option.label}</button>)}</div>}</div>
      <label className="pin-toggle full-width"><input type="checkbox" checked={draft.pinned} onChange={(e) => updateDraft('pinned', e.target.checked)} /><span className="checkbox-mark">✓</span><span><strong>设为重点纪念日</strong><small>它会出现在重点面板最上方</small></span></label>
      <div className="modal-actions full-width"><button className="button secondary" type="button" onClick={onCancel}>取消</button><button className="button primary" type="submit">{isEditing ? '保存修改' : '保存纪念日'}</button></div>
    </form>
  </section>
}

function App() {
  const [events, setEvents] = useState<MemoryEvent[]>(loadEvents)
  const [theme, setTheme] = useState<Theme>(loadTheme)
  const [now, setNow] = useState(() => new Date())
  const [activePanel, setActivePanel] = useState<PanelKey>('home')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [notificationState, setNotificationState] = useState<NotificationPermission | 'unsupported'>(getNotificationState)
  const [updateAvailable, setUpdateAvailable] = useState(false)
  const importInputRef = useRef<HTMLInputElement>(null)
  const swipeRef = useRef<HTMLDivElement>(null)
  const panelRefs = useRef<Record<PanelKey, HTMLElement | null>>({ home: null, events: null, manage: null })

  const sortedEvents = useMemo(() => sortEvents(events, now), [events, now])
  const highlightedEvent = useMemo(() => events.find((event) => event.pinned) ?? sortedEvents[0], [events, sortedEvents])
  const highlightedState = highlightedEvent ? getEventState(highlightedEvent, now) : null
  const editingEvent = editingId ? events.find((event) => event.id === editingId) ?? null : null
  const todayLabel = formatDate(now, true)
  const clockLabel = new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(now)

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), MS_PER_SECOND)
    return () => window.clearInterval(timer)
  }, [])
  useEffect(() => { localStorage.setItem(STORAGE_KEY, JSON.stringify(events)) }, [events])
  useEffect(() => { document.documentElement.dataset.theme = theme; localStorage.setItem(THEME_KEY, theme) }, [theme])
  useEffect(() => {
    if (notificationState !== 'granted') return
    let sent: Record<string, string> = {}
    try { sent = JSON.parse(localStorage.getItem(SENT_REMINDER_KEY) ?? '{}') as Record<string, string> } catch { sent = {} }
    let changed = false
    events.forEach((event) => {
      if (!event.reminderEnabled || !event.reminderDays?.length) return
      const state = getEventState(event, now)
      if (!state.target) return
      const reminderDays = Math.max(0, Math.ceil((startOfDay(state.target).getTime() - startOfDay(now).getTime()) / MS_PER_DAY))
      if (!event.reminderDays.includes(reminderDays)) return
      const key = `${event.id}:${state.target.toISOString().slice(0, 10)}:${reminderDays}`
      if (sent[key]) return
      new Notification(`${event.name} · ${reminderDays === 0 ? '今天' : `${reminderDays}天后`}`, { body: reminderDays === 0 ? '今天就是值得记住的日子。' : `下一次纪念日是 ${formatShortDate(state.target)}。`, icon: '/icon.svg' })
      sent[key] = new Date().toISOString(); changed = true
    })
    if (changed) localStorage.setItem(SENT_REMINDER_KEY, JSON.stringify(sent))
  }, [events, notificationState, now])
  useEffect(() => { if (!notice) return; const timer = window.setTimeout(() => setNotice(null), 3600); return () => window.clearTimeout(timer) }, [notice])
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    let disposed = false
    const checkForUpdate = async () => {
      const registration = await navigator.serviceWorker.getRegistration()
      if (!registration || disposed) return
      await registration.update()
      if (registration.waiting && !disposed) setUpdateAvailable(true)
    }
    void checkForUpdate()
    const timer = window.setInterval(() => void checkForUpdate(), 60 * 1000)
    return () => { disposed = true; window.clearInterval(timer) }
  }, [])

  function scrollToPanel(panel: PanelKey) {
    const index = PANEL_LABELS.findIndex((item) => item.key === panel)
    swipeRef.current?.scrollTo({ left: index * swipeRef.current.clientWidth, behavior: 'smooth' })
    setActivePanel(panel)
  }
  function handlePanelScroll(event: UIEvent<HTMLDivElement>) {
    const index = Math.round(event.currentTarget.scrollLeft / event.currentTarget.clientWidth)
    setActivePanel(PANEL_LABELS[index]?.key ?? 'home')
  }
  function openNew() { setEditingId(null); scrollToPanel('manage') }
  function openEdit(event: MemoryEvent) { setEditingId(event.id); scrollToPanel('manage') }
  function saveEvent(draft: EventDraft, id?: string) {
    setEvents((current) => {
      const saved: MemoryEvent = { ...draft, name: draft.name.trim(), id: id ?? createId() }
      const next = id ? current.map((event) => event.id === id ? saved : event) : [saved, ...current]
      return saved.pinned ? next.map((event) => ({ ...event, pinned: event.id === saved.id })) : next
    })
    setEditingId(null); setNotice(id ? '纪念日已更新' : '新的纪念日已保存'); scrollToPanel('events')
  }
  function deleteEvent(event: MemoryEvent) {
    if (!window.confirm(`确定要删除“${event.name}”吗？`)) return
    setEvents((current) => current.filter((item) => item.id !== event.id)); setEditingId(null); setNotice('纪念日已删除'); scrollToPanel('events')
  }
  function togglePin(event: MemoryEvent) { setEvents((current) => current.map((item) => ({ ...item, pinned: item.id === event.id ? !event.pinned : false }))) }
  function exportData() {
    const blob = new Blob([JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), events }, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = `我的纪念日-${new Date().toISOString().slice(0, 10)}.json`; anchor.click(); URL.revokeObjectURL(url); setNotice('备份文件已下载')
  }
  function importData(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; event.target.value = ''; if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const parsed: unknown = JSON.parse(String(reader.result))
        const candidate = Array.isArray(parsed) ? parsed : parsed && typeof parsed === 'object' && 'events' in parsed ? (parsed as { events: unknown }).events : null
        if (!Array.isArray(candidate) || !candidate.length || !candidate.every(isMemoryEvent)) throw new Error('invalid')
        setEvents(candidate); setNotice(`已导入 ${candidate.length} 个纪念日`)
      } catch { setNotice('导入失败，请选择由本 App 导出的 JSON 文件') }
    }
    reader.readAsText(file)
  }
  async function enableNotifications() {
    if (!('Notification' in window)) { setNotificationState('unsupported'); setNotice('当前浏览器不支持系统通知，请使用 App 内提醒'); return }
    const permission = await Notification.requestPermission(); setNotificationState(permission); setNotice(permission === 'granted' ? '系统通知已开启' : '未开启系统通知，App 内提醒仍然可用')
  }
  function applyUpdate() {
    navigator.serviceWorker.controller?.postMessage({ type: 'SKIP_WAITING' }); window.location.reload()
  }

  return <div className="app-shell">
    <header className="topbar"><a className="brand" href="/" aria-label="纪念日首页"><span className="brand-mark"><span>✦</span></span><span><strong>纪念日</strong><small>把重要的日子，留在心上</small></span></a><div className="topbar-actions"><div className="data-actions"><IconButton label="导入备份" onClick={() => importInputRef.current?.click()}>↥</IconButton><IconButton label="导出备份" onClick={exportData}>↧</IconButton><input ref={importInputRef} className="visually-hidden" type="file" accept="application/json" onChange={importData} /></div><span className="topbar-divider" /><IconButton label={theme === 'light' ? '切换深色模式' : '切换浅色模式'} onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}>{theme === 'light' ? '☾' : '☼'}</IconButton><button className="avatar" type="button" aria-label="个人空间">我</button></div></header>
    <div className="mobile-status"><span>{PANEL_LABELS.find((item) => item.key === activePanel)?.hint}</span><span>{clockLabel}</span></div>
    {updateAvailable && <button className="update-banner" type="button" onClick={applyUpdate}>发现新版本 · 点击立即更新 <span>↗</span></button>}
    <nav className="panel-nav" aria-label="页面导航">{PANEL_LABELS.map((panel) => <button key={panel.key} type="button" className={activePanel === panel.key ? 'active' : ''} onClick={() => scrollToPanel(panel.key)}><span>{panel.label}</span><small>{panel.hint}</small></button>)}</nav>
    <main className="swipe-viewport" ref={swipeRef} onScroll={handlePanelScroll}>
      <section className="panel home-panel" ref={(element) => { panelRefs.current.home = element }} aria-labelledby="home-title"><div className="panel-inner"><div className="panel-kicker"><span>我的纪念日</span><span>{todayLabel}</span></div><div className="home-intro"><div><h1 id="home-title">有些日子，值得被认真记住。</h1><p>让每一次回望都有回应，也让未来的期待变得具体。</p></div><button className="button primary" type="button" onClick={openNew}><span className="button-plus">＋</span>新增纪念日</button></div>
        {highlightedEvent && highlightedState ? <div className="hero-card"><div className="hero-card-topline"><span className="pill"><span>✦</span> 重点纪念日</span><span className="hero-date">{highlightedState.nextLabel}</span></div><div className="hero-card-content"><div className={`hero-icon ${getCategory(highlightedEvent.category).tone}`}>{highlightedEvent.icon}</div><div className="hero-copy"><span className="category-name">{getCategory(highlightedEvent.category).label}</span><h2>{highlightedEvent.name}</h2><p>{highlightedEvent.notes || '给今天留一点温柔，也给未来留一个期待。'}</p></div></div><div className="hero-metrics">{highlightedState.elapsed && <div className="hero-metric"><span className="metric-title">已经过去</span><DurationView duration={highlightedState.elapsed} /></div>}<div className="hero-metric countdown"><span className="metric-title">{highlightedState.targetLabel}</span><DurationView duration={highlightedState.countdown} /></div></div><div className="hero-card-footer"><span>{highlightedEvent.recurring ? '每年都值得庆祝' : highlightedState.kind === 'today' ? '今天值得庆祝' : '一次性重要时刻'}</span><button className="text-button" type="button" onClick={() => openEdit(highlightedEvent)}>编辑详情 <span>→</span></button></div></div> : <div className="empty-hero"><span className="empty-icon">✦</span><div><h2>先记下第一个重要的日子</h2><p>它会成为你的重点纪念日。</p></div><button className="button primary" type="button" onClick={openNew}>添加纪念日</button></div>}
        <div className="home-bottom"><div><span className="section-label">今日时间</span><strong>{clockLabel}</strong><small>每一秒都值得被好好度过</small></div><div className="swipe-hint"><span>左右滑动</span><i>←</i><i>→</i></div></div></div></section>

      <section className="panel events-panel" ref={(element) => { panelRefs.current.events = element }} aria-labelledby="events-title"><div className="panel-inner"><div className="panel-heading"><div><p className="eyebrow">全部记录</p><h2 id="events-title">那些值得记住的日子</h2><p>每张卡片都显示精确到秒的时间距离。</p></div><div className="section-tools"><button className={`notification-button ${notificationState === 'granted' ? 'active' : ''}`} type="button" onClick={enableNotifications}><span>{notificationState === 'granted' ? '●' : '◔'}</span>{notificationState === 'granted' ? '系统通知已开启' : '开启系统通知'}</button><span className="count-label">{events.length} 条记录</span></div></div>{sortedEvents.length ? <div className="event-grid">{sortedEvents.map((event) => <MemoryCard key={event.id} event={event} now={now} onEdit={openEdit} onPin={togglePin} />)}<button className="add-card" type="button" onClick={openNew}><span>＋</span><strong>记录一个新日子</strong><small>让它也拥有被记住的机会</small></button></div> : <div className="empty-state"><span>◌</span><h3>这里还很安静</h3><p>添加一个纪念日，让它成为今天的小期待。</p><button className="button primary" type="button" onClick={openNew}>添加第一个纪念日</button></div>}</div></section>

      <section className="panel manage-panel-wrap" ref={(element) => { panelRefs.current.manage = element }} aria-labelledby="manage-panel-title"><div className="panel-inner"><EditorPanel key={editingId ?? 'new'} event={editingEvent} onSave={saveEvent} onDelete={deleteEvent} onCancel={() => scrollToPanel('events')} /><div className="manage-tools"><div><span className="section-label">数据安全</span><h3>数据只保存在当前设备</h3><p>建议定期导出 JSON 备份；更换设备时可以从这里导入。</p></div><div className="manage-tool-buttons"><button className="button secondary" type="button" onClick={() => importInputRef.current?.click()}>导入备份</button><button className="button secondary" type="button" onClick={exportData}>导出备份</button></div></div></div></section>
    </main>
    <footer className="footer"><span>本地优先 · PWA · Android App</span><span>Made for the moments that matter <b>✦</b></span></footer>
    {notice && <div className="toast" role="status"><span>✓</span>{notice}</div>}
  </div>
}

export default App

