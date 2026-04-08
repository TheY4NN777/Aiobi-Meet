import { useState, useCallback, useLayoutEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { fetchApi } from '@/api/fetchApi'
import type { ApiRoom } from '@/features/rooms/api/ApiRoom'
import { generateRoomId, useCreateRoom } from '@/features/rooms'
import { usePersistentUserChoices } from '@/features/rooms/livekit/hooks/usePersistentUserChoices'
import { PlanLaterModal } from '@/features/rooms/components/PlanLaterModal'
import { useUser, UserAware } from '@/features/auth'
import { useIsEnterprise } from '@/features/auth/hooks/useIsEnterprise'
import { Screen } from '@/layout/Screen'
import { navigateTo } from '@/navigation/navigateTo'
import {
  DateField,
  DateInput,
  DateSegment,
  Calendar,
  CalendarGrid,
  CalendarCell,
  Heading as CalHeading,
  Button as RACButton,
  TimeField,
  Label,
} from 'react-aria-components'
import { today, getLocalTimeZone, parseDate, parseTime } from '@internationalized/date'
import type { CalendarDate, Time } from '@internationalized/date'
import { mediaUrl } from '@/api/mediaUrl'
import { fetchRoomSessions } from '../api/fetchRoomSessions'
import type { SessionRecordingApi } from '../api/fetchRoomSessions'
import { RecordingStatus } from '@/features/recording'
import './Meetings.css'

const useFontshare = () => {
  useLayoutEffect(() => {
    const id = 'fontshare-meetings'
    if (document.getElementById(id)) return
    const link = document.createElement('link')
    link.id = id
    link.rel = 'stylesheet'
    link.href = 'https://api.fontshare.com/v2/css?f[]=clash-display@700,600,500,400&f[]=satoshi@700,500,400,300&display=swap'
    document.head.appendChild(link)
  }, [])
}

const formatDuration = (seconds: number): string => {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h > 0) return `${h}h ${m}min`
  return `${m}min`
}

const RecordingActions = ({ recordings, roomName }: { recordings: SessionRecordingApi[], roomName: string }) => {
  const availableStatuses = [RecordingStatus.Saved, RecordingStatus.NotificationSucceed, RecordingStatus.FailedToStop]
  return (
    <>
      {recordings.map((rec) => (
        <div key={rec.id} className="meeting-actions" style={{ marginTop: '0.5rem' }}>
          {availableStatuses.includes(rec.status as RecordingStatus) && !rec.is_expired && (
            <a
              className="meeting-btn primary"
              href={mediaUrl(rec.key)}
              download={`${roomName}-enregistrement.mp4`}
            >
              Télécharger
            </a>
          )}
          {rec.has_transcription && rec.transcription_key && !rec.is_expired && (
            <a
              className="meeting-btn"
              href={mediaUrl(rec.transcription_key)}
              download={`${roomName}-transcription`}
            >
              Transcription
            </a>
          )}
        </div>
      ))}
    </>
  )
}

const HistoryTab = () => {
  const queryClient = useQueryClient()
  const { data, isLoading } = useQuery({
    queryKey: ['room-sessions'],
    queryFn: fetchRoomSessions,
  })
  const isEnterprise = useIsEnterprise()
  const [expandedSessions, setExpandedSessions] = useState<Set<string>>(new Set())
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  const sessions = data?.results ?? []
  const allSelected = sessions.length > 0 && selectedIds.size === sessions.length

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSelectAll = () => {
    setSelectedIds(allSelected ? new Set() : new Set(sessions.map((s) => s.id)))
  }

  const archiveMutation = useMutation({
    mutationFn: (id: string) =>
      fetchApi(`/room-sessions/${id}/archive/`, { method: 'POST' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['room-sessions'] }),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      fetchApi(`/room-sessions/${id}/`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['room-sessions'] }),
  })

  const bulkArchiveMutation = useMutation({
    mutationFn: (ids: string[]) =>
      fetchApi('/room-sessions/bulk-archive/', { method: 'POST', body: JSON.stringify({ ids }) }),
    onSuccess: () => {
      setSelectedIds(new Set())
      queryClient.invalidateQueries({ queryKey: ['room-sessions'] })
    },
  })

  const clearMutation = useMutation({
    mutationFn: () => fetchApi('/room-sessions/clear/', { method: 'POST' }),
    onSuccess: () => {
      setSelectedIds(new Set())
      queryClient.invalidateQueries({ queryKey: ['room-sessions'] })
    },
  })

  const toggleParticipants = (id: string) => {
    setExpandedSessions((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  if (isLoading) {
    return <div className="meetings-empty">Chargement...</div>
  }

  if (sessions.length === 0) {
    return (
      <div className="meetings-empty">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.3, marginBottom: '1rem' }}>
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
        <p>Aucune réunion passée</p>
      </div>
    )
  }

  return (
    <>
      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', color: 'var(--text-muted)', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={allSelected}
            onChange={toggleSelectAll}
            style={{ accentColor: 'var(--accent)', cursor: 'pointer' }}
          />
          Tout sélectionner
        </label>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.5rem' }}>
          {selectedIds.size > 0 && (
            <button
              className="meeting-btn"
              onClick={() => bulkArchiveMutation.mutate(Array.from(selectedIds))}
              disabled={bulkArchiveMutation.isPending}
            >
              {bulkArchiveMutation.isPending ? '...' : `Archiver (${selectedIds.size})`}
            </button>
          )}
          <button
            className="meeting-btn danger"
            onClick={() => clearMutation.mutate()}
            disabled={clearMutation.isPending}
          >
            {clearMutation.isPending ? '...' : "Vider l'historique"}
          </button>
        </div>
      </div>

      {sessions.map((session) => {
        const isExpanded = expandedSessions.has(session.id)
        const isOngoing = !session.ended_at
        const isSelected = selectedIds.has(session.id)

        return (
          <div
            key={session.id}
            className="meeting-card"
            style={isSelected ? { borderColor: 'var(--accent-border)', background: 'var(--accent-light)' } : undefined}
          >
            <input
              type="checkbox"
              checked={isSelected}
              onChange={() => toggleSelect(session.id)}
              style={{ accentColor: 'var(--accent)', flexShrink: 0, cursor: 'pointer' }}
            />
            <div className="meeting-info">
              <div className="meeting-title">{session.room.name}</div>
              <div className="meeting-date">
                {new Date(session.started_at).toLocaleDateString('fr-FR', {
                  weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
                })}
                {' — '}
                {new Date(session.started_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
              </div>
              <div className="meeting-meta">
                {isOngoing ? (
                  <span className="recording-status recording-status--active">En cours</span>
                ) : session.duration !== null ? (
                  <span className="meeting-duration">{formatDuration(session.duration)}</span>
                ) : null}
                {session.participant_count > 0 && (
                  <button
                    className="meeting-participants-toggle"
                    onClick={() => toggleParticipants(session.id)}
                  >
                    {session.participant_count} participant{session.participant_count > 1 ? 's' : ''}
                    {' '}{isExpanded ? '▲' : '▼'}
                  </button>
                )}
              </div>
              {isExpanded && session.participants.length > 0 && (
                <ul className="meeting-participants-list">
                  {session.participants.map((p) => (
                    <li key={p.id}>{p.full_name || p.display_name || p.livekit_identity}</li>
                  ))}
                </ul>
              )}
            </div>
            <div className="meeting-actions" style={{ flexDirection: 'column', alignItems: 'flex-end', gap: '0.3rem' }}>
              {isEnterprise && session.recordings.length > 0 && (
                <RecordingActions recordings={session.recordings} roomName={session.room.name} />
              )}
              <button
                className="meeting-btn"
                onClick={() => archiveMutation.mutate(session.id)}
                disabled={archiveMutation.isPending}
              >
                Archiver
              </button>
              <button
                className="meeting-btn danger"
                onClick={() => deleteMutation.mutate(session.id)}
                disabled={deleteMutation.isPending}
              >
                Supprimer
              </button>
            </div>
          </div>
        )
      })}
    </>
  )
}

const MeetingsContent = () => {
  const { user } = useUser()
  const queryClient = useQueryClient()
  const { mutateAsync: createRoom } = useCreateRoom()
  const { userChoices: { username } } = usePersistentUserChoices()
  const [laterRoom, setLaterRoom] = useState<ApiRoom | null>(null)
  useFontshare()

  const handlePlanLater = useCallback(async () => {
    const slug = generateRoomId()
    const data = await createRoom({ slug, username })
    setLaterRoom(data)
    queryClient.invalidateQueries({ queryKey: ['rooms'] })
  }, [createRoom, username, queryClient])

  const [activeTab, setActiveTab] = useState<'upcoming' | 'history'>('upcoming')

  const { data, isLoading } = useQuery({
    queryKey: ['rooms'],
    queryFn: () => fetchApi<{ results: ApiRoom[] }>('rooms/'),
    enabled: !!user,
  })

  const rooms = data?.results ?? []

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editDate, setEditDate] = useState<CalendarDate | null>(null)
  const [editTime, setEditTime] = useState<Time | null>(null)
  const [showCalendar, setShowCalendar] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<ApiRoom | null>(null)

  const updateMutation = useMutation({
    mutationFn: ({ roomId, name, date, time }: { roomId: string; name?: string; date: string | null; time: string | null }) =>
      fetchApi(`rooms/${roomId}/`, {
        method: 'PATCH',
        body: JSON.stringify({
          ...(name !== undefined && { name }),
          scheduled_date: date || null,
          scheduled_time: time || null,
        }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rooms'] })
      setEditingId(null)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (roomId: string) =>
      fetchApi(`rooms/${roomId}/`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rooms'] })
      setDeleteConfirm(null)
    },
  })

  const handleEdit = useCallback((room: ApiRoom) => {
    setEditingId(room.id)
    setEditTitle(room.name || '')
    setEditDate(room.scheduled_date ? parseDate(room.scheduled_date) : null)
    setEditTime(room.scheduled_time ? parseTime(room.scheduled_time.slice(0, 5)) : null)
    setShowCalendar(false)
  }, [])

  const { mutate: updateMutate } = updateMutation
  const handleSave = useCallback((roomId: string) => {
    updateMutate({
      roomId,
      name: editTitle.trim() || undefined,
      date: editDate?.toString() || null,
      time: editTime ? `${String(editTime.hour).padStart(2, '0')}:${String(editTime.minute).padStart(2, '0')}` : null,
    })
  }, [editTitle, editDate, editTime, updateMutate])

  const handleCopy = useCallback((room: ApiRoom) => {
    navigator.clipboard.writeText(`${window.location.origin}/${room.slug}`)
    setCopiedId(room.id)
    setTimeout(() => setCopiedId(null), 2000)
  }, [])

  const todayStr = new Date().toISOString().slice(0, 10)
  const sorted = [...rooms]
    .filter((room) => !room.scheduled_date || room.scheduled_date >= todayStr)
    .sort((a, b) => {
      if (a.scheduled_date && b.scheduled_date) return a.scheduled_date > b.scheduled_date ? 1 : -1
      if (a.scheduled_date) return -1
      if (b.scheduled_date) return 1
      return 0
    })

  if (isLoading) {
    return <div className="meetings-page"><div className="meetings-empty">Chargement...</div></div>
  }

  return (
    <div className="meetings-page">
      <div className="meetings-header">
        <button className="meetings-back" onClick={() => navigateTo('home')}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
          Tableau de bord
        </button>
        <h1>Mes réunions</h1>
      </div>

      <div className="meetings-tabs">
        <button
          className={`meetings-tab${activeTab === 'upcoming' ? ' meetings-tab--active' : ''}`}
          onClick={() => setActiveTab('upcoming')}
        >
          À venir
        </button>
        <button
          className={`meetings-tab${activeTab === 'history' ? ' meetings-tab--active' : ''}`}
          onClick={() => setActiveTab('history')}
        >
          Historique
        </button>
      </div>

      {activeTab === 'history' ? (
        <HistoryTab />
      ) : sorted.length === 0 ? (
        <div className="meetings-empty">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.3, marginBottom: '1rem' }}>
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="3" y1="10" x2="21" y2="10" />
          </svg>
          <p>Aucune réunion pour le moment</p>
          <button className="meetings-empty-cta" onClick={handlePlanLater}>
            Planifier une réunion
          </button>
        </div>
      ) : (
        sorted.map((room) => (
          <div key={room.id} className="meeting-card">
            <div className="meeting-info">
              {room.name !== room.slug && (
                <div className="meeting-title">{room.name}</div>
              )}
              {room.scheduled_date ? (
                <div className="meeting-date">
                  {new Date(room.scheduled_date + 'T00:00:00').toLocaleDateString('fr-FR', {
                    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
                  })}
                  {room.scheduled_time && ` — ${room.scheduled_time.slice(0, 5)}`}
                </div>
              ) : (
                <div className="meeting-date meeting-date--muted">
                  Pas de date prevue
                </div>
              )}
              <div className="meeting-code">
                <span className="meeting-code-label">Code :</span>
                <span className="meeting-code-value">{room.slug}</span>
              </div>

              {editingId === room.id && (
                <div className="meeting-edit-row">
                  <div className="meeting-titlefield">
                    <label htmlFor="meeting-title-input" className="meeting-edit-label">Titre</label>
                    <input
                      id="meeting-title-input"
                      type="text"
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      placeholder="Titre de la reunion"
                      className="meeting-title-input"
                    />
                  </div>
                  <DateField
                    value={editDate}
                    onChange={setEditDate}
                    className="meeting-datefield"
                  >
                    <Label className="meeting-edit-label">Date</Label>
                    <div className="meeting-picker-group">
                      <DateInput className="meeting-picker-input">
                        {(segment) => <DateSegment segment={segment} className="meeting-picker-segment" />}
                      </DateInput>
                      <button type="button" className="meeting-picker-btn" onClick={() => setShowCalendar(!showCalendar)}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                      </button>
                    </div>
                  </DateField>

                  <TimeField
                    value={editTime}
                    onChange={setEditTime}
                    hourCycle={24}
                    granularity="minute"
                    className="meeting-timefield"
                  >
                    <Label className="meeting-edit-label">Heure</Label>
                    <DateInput className="meeting-picker-group">
                      {(segment) => <DateSegment segment={segment} className="meeting-picker-segment" />}
                    </DateInput>
                  </TimeField>

                  <div className="meeting-edit-actions">
                    <button
                      className="meeting-btn primary"
                      onClick={() => handleSave(room.id)}
                      disabled={updateMutation.isPending}
                    >
                      {updateMutation.isPending ? '...' : 'Enregistrer'}
                    </button>
                    <button className="meeting-btn" onClick={() => setEditingId(null)}>
                      Annuler
                    </button>
                  </div>
                </div>
              )}

              {/* Calendar modal */}
              {editingId === room.id && showCalendar && (
                // eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events
                <div className="meeting-cal-overlay" onClick={() => setShowCalendar(false)}>
                  {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events */}
                  <div className="meeting-cal-modal" onClick={(e) => e.stopPropagation()}>
                    <Calendar
                      value={editDate}
                      onChange={(date) => { setEditDate(date); setShowCalendar(false) }}
                      minValue={today(getLocalTimeZone())}
                      className="meeting-calendar"
                    >
                      <header className="meeting-calendar-header">
                        <RACButton slot="previous" className="meeting-calendar-nav">&larr;</RACButton>
                        <CalHeading className="meeting-calendar-heading" />
                        <RACButton slot="next" className="meeting-calendar-nav">&rarr;</RACButton>
                      </header>
                      <CalendarGrid className="meeting-calendar-grid">
                        {(date) => <CalendarCell date={date} className="meeting-calendar-cell" />}
                      </CalendarGrid>
                    </Calendar>
                  </div>
                </div>
              )}
            </div>

            <div className="meeting-actions">
              <button className="meeting-btn primary" onClick={() => navigateTo('room', room.slug)}>
                Rejoindre
              </button>
              <button className="meeting-btn" onClick={() => handleCopy(room)}>
                {copiedId === room.id ? 'Copie !' : 'Copier'}
              </button>
              {editingId !== room.id && (
                <button className="meeting-btn" onClick={() => handleEdit(room)}>
                  Modifier
                </button>
              )}
              <button className="meeting-btn danger" onClick={() => setDeleteConfirm(room)}>
                Supprimer
              </button>
            </div>
          </div>
        ))
      )}

      {laterRoom && (
        <PlanLaterModal room={laterRoom} onClose={() => setLaterRoom(null)} />
      )}

      {/* Delete confirm dialog */}
      {deleteConfirm && (
        // eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events
        <div className="meeting-confirm-overlay" onClick={() => setDeleteConfirm(null)}>
          {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events */}
          <div className="meeting-confirm-dialog" onClick={(e) => e.stopPropagation()}>
            <h3>Supprimer cette reunion ?</h3>
            <p>La reunion <strong>{deleteConfirm.slug}</strong> sera definitivement supprimee.</p>
            <div className="meeting-confirm-actions">
              <button className="meeting-btn" onClick={() => setDeleteConfirm(null)}>
                Annuler
              </button>
              <button
                className="meeting-btn danger-fill"
                onClick={() => deleteMutation.mutate(deleteConfirm.id)}
                disabled={deleteMutation.isPending}
              >
                {deleteMutation.isPending ? '...' : 'Supprimer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export const Meetings = () => {
  return (
    <UserAware>
      <Screen header={true} footer={false}>
        <MeetingsContent />
      </Screen>
    </UserAware>
  )
}
