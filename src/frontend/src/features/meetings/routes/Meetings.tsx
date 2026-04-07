import { useState, useCallback, useLayoutEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { fetchApi } from '@/api/fetchApi'
import { ApiRoom } from '@/features/rooms/api/ApiRoom'
import { useUser, UserAware } from '@/features/auth'
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
import { fetchRecordings } from '@/features/recording/api/fetchRecordings'
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

const RECORDING_STATUS_LABEL: Record<string, string> = {
  [RecordingStatus.Saved]: 'Disponible',
  [RecordingStatus.NotificationSucceed]: 'Disponible',
  [RecordingStatus.Active]: 'En cours',
  [RecordingStatus.Initiated]: 'En cours',
  [RecordingStatus.Stopped]: 'Traitement...',
  [RecordingStatus.Aborted]: 'Annulé',
  [RecordingStatus.FailedToStart]: 'Echec',
  [RecordingStatus.FailedToStop]: 'Echec',
}

const HistoryTab = () => {
  const { data, isLoading } = useQuery({
    queryKey: ['recordings'],
    queryFn: fetchRecordings,
  })

  const recordings = data?.results ?? []

  if (isLoading) {
    return <div className="meetings-empty">Chargement...</div>
  }

  if (recordings.length === 0) {
    return (
      <div className="meetings-empty">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.3, marginBottom: '1rem' }}>
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
        <p>Aucun enregistrement disponible</p>
      </div>
    )
  }

  return (
    <>
      {recordings.map((rec) => {
        const isAvailable =
          rec.status === RecordingStatus.Saved ||
          rec.status === RecordingStatus.NotificationSucceed ||
          rec.status === RecordingStatus.FailedToStop
        const statusLabel = RECORDING_STATUS_LABEL[rec.status] ?? rec.status

        return (
          <div key={rec.id} className="meeting-card">
            <div className="meeting-info">
              <div className="meeting-title">{rec.room.name}</div>
              <div className="meeting-date">
                {new Date(rec.created_at).toLocaleDateString('fr-FR', {
                  weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
                })}
                {' — '}
                {new Date(rec.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
              </div>
              <div className="meeting-code">
                <span className="meeting-code-label">Statut :</span>
                <span className={`recording-status recording-status--${rec.status}`}>{statusLabel}</span>
              </div>
              {rec.is_expired && (
                <div className="recording-expired">Enregistrement expiré</div>
              )}
            </div>
            <div className="meeting-actions">
              {isAvailable && !rec.is_expired && (
                <a
                  className="meeting-btn primary"
                  href={mediaUrl(rec.key)}
                  download={`${rec.room.name}-${rec.created_at.slice(0, 10)}.mp4`}
                >
                  Télécharger
                </a>
              )}
              {rec.has_transcription && rec.transcription_key && (
                <a
                  className="meeting-btn"
                  href={mediaUrl(rec.transcription_key)}
                  download={`${rec.room.name}-${rec.created_at.slice(0, 10)}-transcription`}
                >
                  Transcription
                </a>
              )}
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
  useFontshare()

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

  const handleSave = useCallback((roomId: string) => {
    updateMutation.mutate({
      roomId,
      name: editTitle.trim() || undefined,
      date: editDate?.toString() || null,
      time: editTime ? `${String(editTime.hour).padStart(2, '0')}:${String(editTime.minute).padStart(2, '0')}` : null,
    })
  }, [editTitle, editDate, editTime, updateMutation])

  const handleCopy = useCallback((room: ApiRoom) => {
    navigator.clipboard.writeText(`${window.location.origin}/${room.slug}`)
    setCopiedId(room.id)
    setTimeout(() => setCopiedId(null), 2000)
  }, [])

  const sorted = [...rooms].sort((a, b) => {
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
          <button className="meetings-empty-cta" onClick={() => navigateTo('home')}>
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
                    <label className="meeting-edit-label">Titre</label>
                    <input
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
