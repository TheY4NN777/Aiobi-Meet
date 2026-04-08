import { useState, useCallback } from 'react'
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
import { today, getLocalTimeZone } from '@internationalized/date'
import type { CalendarDate, Time } from '@internationalized/date'
import { fetchApi } from '@/api/fetchApi'
import { useInviteToRoom } from '@/features/rooms/api/inviteToRoom'
import type { ApiRoom } from '@/features/rooms/api/ApiRoom'
import './PlanLaterModal.css'

type PlanLaterModalProps = {
  room: ApiRoom
  onClose: () => void
}

export const PlanLaterModal = ({ room, onClose }: PlanLaterModalProps) => {
  const [roomTitle, setRoomTitle] = useState('')
  const [copied, setCopied] = useState(false)
  const [showCalendar, setShowCalendar] = useState(false)
  const [inviteEmails, setInviteEmails] = useState<string[]>([])
  const [inviteInput, setInviteInput] = useState('')
  const [inviteDate, setInviteDate] = useState<CalendarDate | null>(null)
  const [inviteTime, setInviteTime] = useState<Time | null>(null)
  const [inviteSent, setInviteSent] = useState(false)
  const [inviteError, setInviteError] = useState('')

  const inviteMutation = useInviteToRoom({
    onSuccess: () => {
      setInviteSent(true)
      setInviteEmails([])
      setInviteInput('')
      setTimeout(() => setInviteSent(false), 3000)
    },
    onError: () => {
      setInviteError("Erreur lors de l'envoi des invitations")
    },
  })

  const addInviteEmail = useCallback(
    (value: string) => {
      const trimmed = value.trim().toLowerCase()
      if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return
      if (inviteEmails.includes(trimmed)) {
        setInviteInput('')
        return
      }
      setInviteEmails((prev) => [...prev, trimmed])
      setInviteInput('')
      setInviteError('')
    },
    [inviteEmails],
  )

  const handleSendInvites = useCallback(async () => {
    if (!room.id || inviteEmails.length === 0) return
    const patchBody: Record<string, unknown> = {}
    if (roomTitle.trim()) patchBody.name = roomTitle.trim()
    if (inviteDate) patchBody.scheduled_date = inviteDate.toString()
    if (inviteTime)
      patchBody.scheduled_time = `${String(inviteTime.hour).padStart(2, '0')}:${String(inviteTime.minute).padStart(2, '0')}`
    if (Object.keys(patchBody).length > 0) {
      await fetchApi(`rooms/${room.id}/`, { method: 'PATCH', body: JSON.stringify(patchBody) })
    }
    inviteMutation.mutate({
      roomId: room.id,
      emails: inviteEmails,
      scheduledDate: inviteDate?.toString() || null,
      scheduledTime: inviteTime
        ? `${String(inviteTime.hour).padStart(2, '0')}:${String(inviteTime.minute).padStart(2, '0')}`
        : null,
    })
  }, [room.id, roomTitle, inviteEmails, inviteDate, inviteTime, inviteMutation])

  const handleClose = useCallback(async () => {
    const patchBody: Record<string, unknown> = {}
    if (roomTitle.trim()) patchBody.name = roomTitle.trim()
    if (inviteDate) patchBody.scheduled_date = inviteDate.toString()
    if (inviteTime)
      patchBody.scheduled_time = `${String(inviteTime.hour).padStart(2, '0')}:${String(inviteTime.minute).padStart(2, '0')}`
    if (Object.keys(patchBody).length > 0) {
      await fetchApi(`rooms/${room.id}/`, { method: 'PATCH', body: JSON.stringify(patchBody) }).catch(() => {})
    }
    onClose()
  }, [room.id, roomTitle, inviteDate, inviteTime, onClose])

  const handleCopyLink = useCallback(() => {
    navigator.clipboard.writeText(`${window.location.origin}/${room.slug}`)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [room.slug])

  return (
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events
    <div className="dash-later-overlay" onClick={handleClose}>
      {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events */}
      <div className="dash-later-card" onClick={(e) => e.stopPropagation()}>
        <button className="dash-later-x" onClick={handleClose} aria-label="Fermer">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        <h3>Votre réunion est prête</h3>

        <input
          type="text"
          value={roomTitle}
          onChange={(e) => setRoomTitle(e.target.value)}
          placeholder="Titre de la réunion (optionnel)"
          className="dash-room-title-input"
        />

        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '0.75rem' }}>
          Partagez ce lien avec les participants :
        </p>
        <div className="dash-later-url">
          {window.location.origin}/{room.slug}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginBottom: '1rem' }}>
          <button className="dash-later-copy" onClick={handleCopyLink}>
            {copied ? 'Copié !' : 'Copier le lien'}
          </button>
        </div>

        <div style={{ borderTop: '1px solid #eee', paddingTop: '1rem' }}>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.75rem', textAlign: 'center' }}>
            ou invitez par email
          </p>

          <div className="dash-invite-emails">
            {inviteEmails.map((email) => (
              <span key={email} className="dash-invite-chip">
                {email}
                <button type="button" onClick={() => setInviteEmails((prev) => prev.filter((e) => e !== email))}>
                  &times;
                </button>
              </span>
            ))}
            <input
              type="email"
              value={inviteInput}
              onChange={(e) => { setInviteInput(e.target.value); setInviteError('') }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addInviteEmail(inviteInput) }
                if (e.key === 'Backspace' && !inviteInput && inviteEmails.length > 0)
                  setInviteEmails((prev) => prev.slice(0, -1))
              }}
              onBlur={() => { if (inviteInput.trim()) addInviteEmail(inviteInput) }}
              placeholder={inviteEmails.length === 0 ? 'Saisir un email puis Entrée' : ''}
              className="dash-invite-input"
            />
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
            <DateField value={inviteDate} onChange={setInviteDate} className="dash-datepicker">
              <Label className="dash-invite-label">
                Date <span style={{ fontStyle: 'italic' }}>(optionnel)</span>
              </Label>
              <div className="dash-picker-group">
                <DateInput className="dash-picker-input">
                  {(segment) => <DateSegment segment={segment} className="dash-picker-segment" />}
                </DateInput>
                <button type="button" className="dash-picker-btn" onClick={() => setShowCalendar(true)}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                    <line x1="16" y1="2" x2="16" y2="6" />
                    <line x1="8" y1="2" x2="8" y2="6" />
                    <line x1="3" y1="10" x2="21" y2="10" />
                  </svg>
                </button>
              </div>
            </DateField>

            <TimeField value={inviteTime} onChange={setInviteTime} hourCycle={24} granularity="minute" className="dash-timefield">
              <Label className="dash-invite-label">Heure</Label>
              <DateInput className="dash-picker-group">
                {(segment) => <DateSegment segment={segment} className="dash-picker-segment" />}
              </DateInput>
            </TimeField>
          </div>

          {showCalendar && (
            // eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events
            <div className="dash-cal-overlay" onClick={() => setShowCalendar(false)}>
              {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events */}
              <div className="dash-cal-modal" onClick={(e) => e.stopPropagation()}>
                <Calendar
                  value={inviteDate}
                  onChange={(date) => { setInviteDate(date); setShowCalendar(false) }}
                  minValue={today(getLocalTimeZone())}
                  className="dash-calendar"
                >
                  <header className="dash-calendar-header">
                    <RACButton slot="previous" className="dash-calendar-nav">&larr;</RACButton>
                    <CalHeading className="dash-calendar-heading" />
                    <RACButton slot="next" className="dash-calendar-nav">&rarr;</RACButton>
                  </header>
                  <CalendarGrid className="dash-calendar-grid">
                    {(date) => <CalendarCell date={date} className="dash-calendar-cell" />}
                  </CalendarGrid>
                </Calendar>
              </div>
            </div>
          )}

          <button
            className={`dash-invite-send${inviteSent ? ' success' : ''}`}
            disabled={inviteEmails.length === 0 || inviteMutation.isPending}
            onClick={handleSendInvites}
          >
            {inviteSent ? '✓ Invitations envoyées !' : inviteMutation.isPending ? '...' : 'Envoyer les invitations'}
          </button>

          {inviteError && <p style={{ color: '#D93025', fontSize: '0.8rem', marginTop: '0.25rem' }}>{inviteError}</p>}
        </div>
      </div>
    </div>
  )
}
