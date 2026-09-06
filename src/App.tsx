import { useEffect, useMemo, useRef, useState } from 'react'
import type { ChangeEvent, FormEvent, ReactNode } from 'react'
import './App.css'

type CategoryKey = 'love' | 'family' | 'friends' | 'birthday' | 'milestone'
type Theme = 'light' | 'dark'
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

const STORAGE_KEY = 'memory-days.events.v1'
const THEME_KEY = 'memory-days.theme.v1'
const SENT_REMINDER_KEY = 'memory-days.sent-reminders.v1'
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
const DEFAULT_EVENTS: MemoryEvent[] = [
  { id: 'demo-love', name: '在一起的日子', date: '2023-09-22', recurring: true, category: 'love', icon: '♡', notes: '把每一个普通的日子，过成值得纪念的日子。', reminderEnabled: true, reminderDays: [7, 1, 0], pinned: true },
  { id: 'demo-family', name: '第一次一起旅行', date: '2022-06-05', recurring: true, category: 'family', icon: '⌂', notes: '记得那一趟沿海公路和傍晚的风。', reminderEnabled: true, reminderDays: [1], pinned: false },
  { id: 'demo-birthday', name: '妈妈的生日', date: '2026-10-18', recurring: true, category: 'birthday', icon: '✺', notes: '提前准备一束花。', reminderEnabled: true, reminderDays: [7, 3, 0], pinned: false },
]

function startOfDay(date = new Date()) { return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12) }
function parseDate(value: string) { const [y, m, d] = value.split('-').map(Number); return new Date(y, m - 1, d, 12) }
function isLeapYear(year: number) { return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) }
function daysInMonth(year: number, month: number) { return new Date(year, month + 1, 0).getDate() }
function addMonths(date: Date, months: number) {
  const total = date.getFullYear() * 12 + date.getMonth() + months
  const year = Math.floor(total / 12)
  const month = total % 12
  return new Date(year, month, Math.min(date.getDate(), daysInMonth(year, month)), 12)
}
function addYears(date: Date, years: number) {
  const year = date.getFullYear() + years
  const day = date.getMonth() === 1 && date.getDate() === 29 && !isLeapYear(year) ? 28 : date.getDate()
  return new Date(year, date.getMonth(), Math.min(day, daysInMonth(year, date.getMonth())), 12)
}
function differenceInDays(later: Date, earlier: Date) { return Math.round((later.getTime() - earlier.getTime()) / MS_PER_DAY) }
function nextAnnualOccurrence(date: Date, today: Date) {
  const year = today.getFullYear()
  const day = date.getMonth() === 1 && date.getDate() === 29 && !isLeapYear(year) ? 28 : date.getDate()
  let candidate = new Date(year, date.getMonth(), day, 12)
  if (candidate < today) {
    const nextYear = year + 1
    const nextDay = date.getMonth() === 1 && date.getDate() === 29 && !isLeapYear(nextYear) ? 28 : date.getDate()
    candidate = new Date(nextYear, date.getMonth(), nextDay, 12)
  }
  return candidate
}
function getNextOccurrence(event: MemoryEvent, today: Date) { return event.recurring ? nextAnnualOccurrence(parseDate(event.date), today) : parseDate(event.date) }
function getCalendarDuration(from: Date, to: Date) {
  if (to < from) return { years: 0, months: 0, days: Math.max(0, differenceInDays(to, from)) }
  let years = to.getFullYear() - from.getFullYear()
  let cursor = addYears(from, years)
  if (cursor > to) { years -= 1; cursor = addYears(from, years) }
  let months = (to.getFullYear() - cursor.getFullYear()) * 12 + to.getMonth() - cursor.getMonth()
  let monthCursor = addMonths(cursor, months)
  if (monthCursor > to) { months -= 1; monthCursor = addMonths(cursor, months) }
  return { years, months, days: differenceInDays(to, monthCursor) }
}
function formatDate(date: Date, weekday = false) {
  return new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', ...(weekday ? { weekday: 'long' } : {}) }).format(date)
}
function formatShortDate(date: Date) { return new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric' }).format(date) }
function getCategory(category: CategoryKey) { return CATEGORY_OPTIONS.find((option) => option.key === category) ?? CATEGORY_OPTIONS[0] }
function getEventSummary(event: MemoryEvent, today: Date) {
  const originalDate = parseDate(event.date)
  const nextDate = getNextOccurrence(event, today)
  const daysUntil = differenceInDays(nextDate, today)
  if (event.recurring && originalDate <= today) {
    const duration = getCalendarDuration(originalDate, today)
    const parts = [duration.years ? `${duration.years}年` : '', duration.months ? `${duration.months}个月` : '', `${duration.days}天`].filter(Boolean)
    return { primary: parts.join(' '), secondary: daysUntil === 0 ? '今天就是纪念日' : `距离 ${formatShortDate(nextDate)} 还有 ${daysUntil} 天`, nextDate, daysUntil, isPast: false }
  }
  if (daysUntil === 0) return { primary: '就是今天', secondary: '值得认真庆祝一下', nextDate, daysUntil, isPast: false }
  if (daysUntil > 0) return { primary: `还有 ${daysUntil} 天`, secondary: formatDate(nextDate), nextDate, daysUntil, isPast: false }
  return { primary: `已过去 ${Math.abs(daysUntil)} 天`, secondary: formatDate(nextDate), nextDate, daysUntil, isPast: true }
}
function sortEvents(events: MemoryEvent[], today: Date) {
  return [...events].sort((a, b) => {
    const left = getEventSummary(a, today).daysUntil
    const right = getEventSummary(b, today).daysUntil
    const leftRank = left < 0 ? 100000 + Math.abs(left) : left
    const rightRank = right < 0 ? 100000 + Math.abs(right) : right
    return leftRank - rightRank
  })
}
function createId() { return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `event-${Date.now()}` }
function getDefaultDraft(): EventDraft {
  const date = new Date(); date.setDate(date.getDate() + 7)
  return { name: '', date: date.toISOString().slice(0, 10), recurring: true, category: 'love', icon: '♡', notes: '', reminderEnabled: true, reminderDays: [1, 0], pinned: false }
}
function isMemoryEvent(value: unknown): value is MemoryEvent {
  if (!value || typeof value !== 'object') return false
  const event = value as Partial<MemoryEvent>
  return typeof event.id === 'string' && typeof event.name === 'string' && typeof event.date === 'string' && typeof event.recurring === 'boolean' && typeof event.category === 'string' && typeof event.icon === 'string'
}
function loadEvents() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (!stored) return DEFAULT_EVENTS
    const parsed: unknown = JSON.parse(stored)
    return Array.isArray(parsed) ? parsed.filter(isMemoryEvent) : DEFAULT_EVENTS
  } catch { return DEFAULT_EVENTS }
}
function loadTheme(): Theme {
  const stored = localStorage.getItem(THEME_KEY)
  if (stored === 'light' || stored === 'dark') return stored
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}
function getNotificationState(): NotificationPermission | 'unsupported' { return 'Notification' in window ? Notification.permission : 'unsupported' }

function IconButton({ label, children, onClick }: { label: string; children: ReactNode; onClick: () => void }) {
  return <button className="icon-button" type="button" aria-label={label} title={label} onClick={onClick}>{children}</button>
}

function EventModal({ event, onClose, onSave, onDelete }: { event: MemoryEvent | null; onClose: () => void; onSave: (draft: EventDraft, id?: string) => void; onDelete: (event: MemoryEvent) => void }) {
  const [draft, setDraft] = useState<EventDraft>(() => event ? { ...event } : getDefaultDraft())
  const isEditing = Boolean(event)
  function updateDraft<K extends keyof EventDraft>(key: K, value: EventDraft[K]) { setDraft((current) => ({ ...current, [key]: value })) }
  function toggleReminderDay(day: number) {
    const next = draft.reminderDays.includes(day) ? draft.reminderDays.filter((item) => item !== day) : [...draft.reminderDays, day].sort((a, b) => b - a)
    updateDraft('reminderDays', next)
  }
  function submit(submitEvent: FormEvent<HTMLFormElement>) { submitEvent.preventDefault(); onSave(draft, event?.id) }
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="modal" role="dialog" aria-modal="true" aria-labelledby="event-modal-title" onMouseDown={(mouseEvent) => mouseEvent.stopPropagation()}>
        <div className="modal-heading"><div><span className="eyebrow">{isEditing ? '编辑记录' : '新建记录'}</span><h2 id="event-modal-title">{isEditing ? '把这一天记得更清楚' : '记录一个重要的日子'}</h2></div><button type="button" className="close-button" aria-label="关闭" onClick={onClose}>×</button></div>
        <form className="event-form" onSubmit={submit}>
          <label className="field full-width"><span>纪念日名称</span><input autoFocus required value={draft.name} onChange={(e) => updateDraft('name', e.target.value)} placeholder="例如：在一起的日子" /></label>
          <div className="form-grid">
            <label className="field"><span>日期</span><input type="date" required value={draft.date} onChange={(e) => updateDraft('date', e.target.value)} /></label>
            <label className="field"><span>日期类型</span><select value={draft.recurring ? 'recurring' : 'once'} onChange={(e) => updateDraft('recurring', e.target.value === 'recurring')}><option value="recurring">每年重复</option><option value="once">一次性事件</option></select></label>
          </div>
          <div className="field full-width"><span>分类</span><div className="category-picker">{CATEGORY_OPTIONS.map((option) => <button type="button" key={option.key} className={`category-option ${draft.category === option.key ? 'selected' : ''}`} onClick={() => { updateDraft('category', option.key); updateDraft('icon', option.icon) }}><span className={`category-icon ${option.tone}`}>{option.icon}</span><span>{option.label}</span></button>)}</div></div>
          <label className="field full-width"><span>备注 <small>选填</small></span><textarea value={draft.notes} onChange={(e) => updateDraft('notes', e.target.value)} placeholder="写下那天值得记住的一句话……" rows={3} /></label>
          <div className="form-section full-width">
            <div className="form-section-heading"><div><span className="field-label">提醒设置</span><small>在重要的日子到来前收到提醒</small></div><label className="switch-label"><input type="checkbox" checked={draft.reminderEnabled} onChange={(e) => updateDraft('reminderEnabled', e.target.checked)} /><span className="switch" /></label></div>
            {draft.reminderEnabled && <div className="reminder-picker">{REMINDER_OPTIONS.map((option) => <button type="button" key={option.value} className={`reminder-chip ${draft.reminderDays.includes(option.value) ? 'selected' : ''}`} onClick={() => toggleReminderDay(option.value)}>{option.label}</button>)}</div>}
          </div>
          <label className="pin-toggle full-width"><input type="checkbox" checked={draft.pinned} onChange={(e) => updateDraft('pinned', e.target.checked)} /><span className="checkbox-mark">✓</span><span><strong>设为重点纪念日</strong><small>它会出现在首页最上方</small></span></label>
          <div className="modal-actions full-width">{isEditing && event && <button className="delete-button" type="button" onClick={() => onDelete(event)}>删除</button>}<span className="modal-actions-spacer" /><button className="button secondary" type="button" onClick={onClose}>取消</button><button className="button primary" type="submit">{isEditing ? '保存修改' : '保存纪念日'}</button></div>
        </form>
      </section>
    </div>
  )
}

function App() {
  const [events, setEvents] = useState<MemoryEvent[]>(loadEvents)
  const [theme, setTheme] = useState<Theme>(loadTheme)
  const [modalEvent, setModalEvent] = useState<MemoryEvent | null | undefined>(undefined)
  const [notice, setNotice] = useState<string | null>(null)
  const [notificationState, setNotificationState] = useState<NotificationPermission | 'unsupported'>(getNotificationState)
  const importInputRef = useRef<HTMLInputElement>(null)
  const today = useMemo(() => startOfDay(), [])
  const sortedEvents = useMemo(() => sortEvents(events, today), [events, today])
  const highlightedEvent = useMemo(() => events.find((event) => event.pinned) ?? sortedEvents[0], [events, sortedEvents])
  const nextEvent = sortedEvents.find((event) => getEventSummary(event, today).daysUntil >= 0) ?? sortedEvents[0]
  const highlightSummary = highlightedEvent ? getEventSummary(highlightedEvent, today) : null
  const todayLabel = formatDate(today, true)

  useEffect(() => { localStorage.setItem(STORAGE_KEY, JSON.stringify(events)) }, [events])
  useEffect(() => { document.documentElement.dataset.theme = theme; localStorage.setItem(THEME_KEY, theme) }, [theme])
  useEffect(() => {
    if (notificationState !== 'granted') return
    const sent = JSON.parse(localStorage.getItem(SENT_REMINDER_KEY) ?? '{}') as Record<string, string>
    let changed = false
    events.forEach((event) => {
      if (!event.reminderEnabled || !event.reminderDays.length) return
      const summary = getEventSummary(event, today)
      if (!event.recurring && summary.daysUntil < 0) return
      const due = event.reminderDays.includes(summary.daysUntil)
      const key = `${event.id}:${summary.nextDate.toISOString().slice(0, 10)}:${summary.daysUntil}`
      if (!due || sent[key]) return
      new Notification(`${event.name} · ${summary.daysUntil === 0 ? '今天' : `${summary.daysUntil}天后`}`, { body: summary.daysUntil === 0 ? '今天就是值得记住的日子。' : `下一次纪念日是 ${formatShortDate(summary.nextDate)}。`, icon: '/icon.svg' })
      sent[key] = new Date().toISOString(); changed = true
    })
    if (changed) localStorage.setItem(SENT_REMINDER_KEY, JSON.stringify(sent))
  }, [events, notificationState, today])
  useEffect(() => { if (!notice) return; const timer = window.setTimeout(() => setNotice(null), 3600); return () => window.clearTimeout(timer) }, [notice])

  function saveEvent(draft: EventDraft, id?: string) {
    setEvents((current) => {
      const saved: MemoryEvent = { ...draft, id: id ?? createId() }
      const next = id ? current.map((event) => event.id === id ? saved : event) : [saved, ...current]
      return saved.pinned ? next.map((event) => ({ ...event, pinned: event.id === saved.id })) : next
    })
    setModalEvent(undefined); setNotice(id ? '纪念日已更新' : '新的纪念日已保存')
  }
  function deleteEvent(event: MemoryEvent) {
    if (!window.confirm(`确定要删除“${event.name}”吗？`)) return
    setEvents((current) => current.filter((item) => item.id !== event.id)); setModalEvent(undefined); setNotice('纪念日已删除')
  }
  function exportData() {
    const blob = new Blob([JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), events }, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = `我的纪念日-${new Date().toISOString().slice(0, 10)}.json`; anchor.click(); URL.revokeObjectURL(url); setNotice('备份文件已下载')
  }
  function importData(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; e.target.value = ''; if (!file) return
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

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label="纪念日首页"><span className="brand-mark"><span>✦</span></span><span><strong>纪念日</strong><small>把重要的日子，留在心上</small></span></a>
        <div className="topbar-actions"><div className="data-actions"><IconButton label="导入备份" onClick={() => importInputRef.current?.click()}>↥</IconButton><IconButton label="导出备份" onClick={exportData}>↧</IconButton><input ref={importInputRef} className="visually-hidden" type="file" accept="application/json" onChange={importData} /></div><span className="topbar-divider" /><IconButton label={theme === 'light' ? '切换深色模式' : '切换浅色模式'} onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}>{theme === 'light' ? '☾' : '☼'}</IconButton><button className="avatar" type="button" aria-label="个人空间">我</button></div>
      </header>

      <main className="main-content">
        <section className="intro-row"><div><p className="eyebrow">我的纪念日 · {todayLabel}</p><h1>有些日子，值得被认真记住。</h1><p className="intro-copy">记录那些让生活变得闪闪发光的时刻，提醒自己一直被爱与美好围绕。</p></div><button className="button primary add-button" type="button" onClick={() => setModalEvent(null)}><span className="button-plus">＋</span>新增纪念日</button></section>

        {highlightedEvent && highlightSummary ? <section className="hero-card"><div className="hero-card-topline"><span className="pill"><span className="sparkle">✦</span> 重点纪念日</span><span className="hero-date">{formatDate(highlightSummary.nextDate)}</span></div><div className="hero-card-content"><div className={`hero-icon ${getCategory(highlightedEvent.category).tone}`}>{highlightedEvent.icon}</div><div className="hero-copy"><span className="category-name">{getCategory(highlightedEvent.category).label}</span><h2>{highlightedEvent.name}</h2><p>{highlightedEvent.notes || '给今天留一点温柔，也给未来留一个期待。'}</p></div><div className="hero-countdown"><span>{highlightSummary.primary}</span><small>{highlightSummary.secondary}</small></div></div><div className="hero-card-footer"><span>{highlightedEvent.recurring ? '每年都值得庆祝' : '一次性重要时刻'}</span><button className="text-button" type="button" onClick={() => setModalEvent(highlightedEvent)}>编辑详情 <span>→</span></button></div></section> : <section className="empty-hero"><span className="empty-icon">✦</span><div><h2>先记下第一个重要的日子</h2><p>它会成为你首页的重点纪念日。</p></div><button className="button primary" type="button" onClick={() => setModalEvent(null)}>添加纪念日</button></section>}

        <section className="overview-grid" aria-label="纪念日概览"><div className="stat-card"><span className="stat-icon peach">◌</span><div><strong>{events.length}</strong><small>个纪念日</small></div></div><div className="stat-card"><span className="stat-icon lavender">⌁</span><div><strong>{events.filter((event) => event.recurring).length}</strong><small>个每年重复</small></div></div><div className="stat-card next-stat"><span className="stat-icon sage">♡</span><div><strong>{nextEvent ? (getEventSummary(nextEvent, today).daysUntil === 0 ? '今天' : `${getEventSummary(nextEvent, today).daysUntil} 天`) : '—'}</strong><small>{nextEvent ? `下一个 · ${nextEvent.name}` : '还没有记录'}</small></div></div></section>

        <section className="events-section"><div className="section-heading"><div><p className="eyebrow">全部记录</p><h2>那些值得记住的日子</h2></div><div className="section-tools"><button className={`notification-button ${notificationState === 'granted' ? 'active' : ''}`} type="button" onClick={enableNotifications}><span>{notificationState === 'granted' ? '●' : '◔'}</span>{notificationState === 'granted' ? '系统通知已开启' : '开启系统通知'}</button><span className="count-label">{events.length} 条记录</span></div></div>
          {sortedEvents.length ? <div className="event-grid">{sortedEvents.map((event) => { const category = getCategory(event.category); const summary = getEventSummary(event, today); return <article className={`event-card ${event.pinned ? 'is-pinned' : ''}`} key={event.id}><div className="event-card-header"><div className={`event-icon ${category.tone}`}>{event.icon}</div><div className="event-card-actions">{event.pinned && <span className="mini-pin">重点</span>}<button type="button" aria-label={`编辑${event.name}`} onClick={() => setModalEvent(event)}>···</button></div></div><div className="event-card-body"><div className="event-category">{category.label} <span>·</span> {event.recurring ? '每年' : '一次性'}</div><h3>{event.name}</h3><p className="event-date">{formatDate(parseDate(event.date))}</p>{event.notes && <p className="event-notes">“{event.notes}”</p>}</div><div className="event-card-footer"><div><strong className={summary.isPast ? 'muted-number' : ''}>{summary.primary}</strong><span>{summary.secondary}</span></div>{event.reminderEnabled && <span className="reminder-badge" title="已开启提醒">◔</span>}</div></article> })}<button className="add-card" type="button" onClick={() => setModalEvent(null)}><span>＋</span><strong>记录一个新日子</strong><small>让它也拥有被记住的机会</small></button></div> : <div className="empty-state"><span>◌</span><h3>这里还很安静</h3><p>添加一个纪念日，让它成为今天的小期待。</p><button className="button primary" type="button" onClick={() => setModalEvent(null)}>添加第一个纪念日</button></div>}
        </section>
      </main>
      <footer className="footer"><span>数据只保存在当前设备 · 建议定期导出备份</span><span>Made for the moments that matter <b>✦</b></span></footer>
      {modalEvent !== undefined && <EventModal key={modalEvent?.id ?? 'new'} event={modalEvent} onClose={() => setModalEvent(undefined)} onSave={saveEvent} onDelete={deleteEvent} />}
      {notice && <div className="toast" role="status"><span>✓</span>{notice}</div>}
    </div>
  )
}

export default App

