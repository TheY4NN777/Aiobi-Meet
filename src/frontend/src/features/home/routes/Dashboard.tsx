import { useCallback, useEffect, useLayoutEffect, useState } from 'react'
import { Screen } from '@/layout/Screen'
import { useUser, UserAware } from '@/features/auth'
import { generateRoomId, useCreateRoom } from '@/features/rooms'
import { navigateTo } from '@/navigation/navigateTo'
import { usePersistentUserChoices } from '@/features/rooms/livekit/hooks/usePersistentUserChoices'
import { ApiRoom } from '@/features/rooms/api/ApiRoom'
import { useInviteToRoom } from '@/features/rooms/api/inviteToRoom'
import './Dashboard.css'

// Load Fontshare fonts
const useFontshare = () => {
  useLayoutEffect(() => {
    const id = 'fontshare-dashboard'
    if (document.getElementById(id)) return
    const link = document.createElement('link')
    link.id = id
    link.rel = 'stylesheet'
    link.href = 'https://api.fontshare.com/v2/css?f[]=clash-display@700,600,500,400&f[]=satoshi@700,500,400,300&display=swap'
    document.head.appendChild(link)
  }, [])
}

const DashboardContent = () => {
  const { user } = useUser()
  const { mutateAsync: createRoom } = useCreateRoom()
  const {
    userChoices: { username },
  } = usePersistentUserChoices()

  useFontshare()

  const [joinCode, setJoinCode] = useState('')
  const [laterRoom, setLaterRoom] = useState<ApiRoom | null>(null)
  const [copied, setCopied] = useState(false)

  // Email invite state for "plan later" dialog
  const [inviteEmails, setInviteEmails] = useState<string[]>([])
  const [inviteInput, setInviteInput] = useState('')
  const [inviteDate, setInviteDate] = useState('')
  const [inviteTime, setInviteTime] = useState('')
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
      setInviteError('Erreur lors de l\'envoi des invitations')
    },
  })

  const addInviteEmail = useCallback((value: string) => {
    const trimmed = value.trim().toLowerCase()
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return
    if (inviteEmails.includes(trimmed)) { setInviteInput(''); return }
    setInviteEmails((prev) => [...prev, trimmed])
    setInviteInput('')
    setInviteError('')
  }, [inviteEmails])

  const handleSendInvites = useCallback(() => {
    if (!laterRoom?.id || inviteEmails.length === 0) return
    inviteMutation.mutate({
      roomId: laterRoom.id,
      emails: inviteEmails,
      scheduledDate: inviteDate || null,
      scheduledTime: inviteTime || null,
    })
  }, [laterRoom?.id, inviteEmails, inviteDate, inviteTime, inviteMutation])

  const resetInviteState = useCallback(() => {
    setLaterRoom(null)
    setInviteEmails([])
    setInviteInput('')
    setInviteDate('')
    setInviteTime('')
    setInviteSent(false)
    setInviteError('')
  }, [])

  const handleCreateInstant = useCallback(async () => {
    const slug = generateRoomId()
    const data = await createRoom({ slug, username })
    navigateTo('room', data.slug, {
      state: { create: true, initialRoomData: data },
    })
  }, [createRoom, username])

  const handleCreateLater = useCallback(async () => {
    const slug = generateRoomId()
    const data = await createRoom({ slug, username })
    setLaterRoom(data)
  }, [createRoom, username])

  const handleJoinRoom = useCallback(() => {
    let code = joinCode.trim()
    // Extract room code from full URL (e.g. https://meet.aiobi.world/abc-defg-hij)
    try {
      const url = new URL(code)
      code = url.pathname.replace(/^\//, '')
    } catch {
      // Not a URL, use as-is
    }
    if (code) {
      navigateTo('room', code)
    }
  }, [joinCode])

  const handleCopyLink = useCallback(() => {
    if (!laterRoom) return
    const url = `${window.location.origin}/${laterRoom.slug}`
    navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [laterRoom])

  const displayName = user?.short_name || user?.full_name || username || ''

  const headlines = [
    'Prêt pour votre prochaine réunion ?',
    'Votre équipe vous attend.',
    'Un appel, et tout avance.',
    'À qui parlez-vous aujourd\'hui ?',
    'Connectez-vous à vos collaborateurs.',
    'Votre salle de réunion est prête.',
    'Lancez la discussion.',
    'Qui rejoint la table aujourd\'hui ?',
    'Tout commence par un appel.',
    'Vos collaborateurs sont à un clic.',
    'C\'est le moment de se retrouver.',
    'Vos idées n\'attendent que vous.',
    'La réunion peut commencer.',
    'On y va ?',
    'Rassemblez votre équipe en un instant.',
    'Parlez, partagez, avancez.',
    'Qui sera autour de la table ?',
    'Prêt à faire avancer les choses ?',
    'Votre prochain échange commence ici.',
    'Simplifiez, connectez, créez.',
    'Le bon moment pour se parler.',
    'Vos projets avancent quand vos équipes se parlent.',
    'Une réunion peut tout changer.',
    'Faites le premier pas, lancez l\'appel.',
    'Ensemble, même à distance.',
  ]

  const [headlineIndex, setHeadlineIndex] = useState(() => Math.floor(Math.random() * headlines.length))
  const [headlineFade, setHeadlineFade] = useState(true)

  useEffect(() => {
    const interval = setInterval(() => {
      setHeadlineFade(false)
      setTimeout(() => {
        setHeadlineIndex((prev) => (prev + 1) % headlines.length)
        setHeadlineFade(true)
      }, 400)
    }, 30000)
    return () => clearInterval(interval)
  }, [headlines.length])

  return (
    <div className="app-dashboard">
      {/* Hero */}
      <div className="dash-hero">
        <div className="dash-greeting">
          {displayName ? `Bonjour, ${displayName}` : 'Bienvenue'}
        </div>
        <h1 className={`dash-headline ${headlineFade ? 'visible' : ''}`}>
          {headlines[headlineIndex]}
        </h1>
        <p className="dash-subtitle">
          Lancez une réunion instantanée, planifiez pour plus tard ou rejoignez un appel en cours.
        </p>
      </div>

      {/* Action Cards */}
      <div className="dash-actions">
        <div
          className="dash-action-card primary"
          onClick={handleCreateInstant}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === 'Enter' && handleCreateInstant()}
        >
          <div className="dash-action-icon">
            <svg viewBox="0 0 24 24">
              <polygon points="23 7 16 12 23 17 23 7" />
              <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
            </svg>
          </div>
          <h3>Réunion instantanée</h3>
          <p>Démarrez un appel vidéo maintenant</p>
        </div>
        <div
          className="dash-action-card"
          onClick={handleCreateLater}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === 'Enter' && handleCreateLater()}
        >
          <div className="dash-action-icon">
            <svg viewBox="0 0 24 24">
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
            </svg>
          </div>
          <h3>Planifier pour plus tard</h3>
          <p>Créez un lien à partager</p>
        </div>
      </div>

      {/* Join Bar */}
      <div className="dash-join">
        <input
          type="text"
          placeholder="Entrez un code de réunion pour rejoindre"
          value={joinCode}
          onChange={(e) => setJoinCode(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleJoinRoom()}
        />
        <button className="dash-join-btn" onClick={handleJoinRoom}>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
            <polyline points="10 17 15 12 10 7" />
            <line x1="15" y1="12" x2="3" y2="12" />
          </svg>
          Rejoindre
        </button>
      </div>

      {/* Later Meeting Dialog */}
      {laterRoom && (
        // eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events
        <div className="dash-later-overlay" onClick={resetInviteState}>
          {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events */}
          <div className="dash-later-card" onClick={(e) => e.stopPropagation()}>
            <h3>Votre réunion est prête</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '1rem' }}>
              Partagez ce lien avec les participants :
            </p>
            <div className="dash-later-url">
              {window.location.origin}/{laterRoom.slug}
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
              <button className="dash-later-copy" onClick={handleCopyLink}>
                {copied ? 'Copié !' : 'Copier le lien'}
              </button>
            </div>

            {/* Invite by email section */}
            <div style={{ borderTop: '1px solid #eee', paddingTop: '1rem' }}>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.75rem', textAlign: 'center' }}>
                ou invitez par email
              </p>

              {/* Email chips + input */}
              <div className="dash-invite-emails">
                {inviteEmails.map((email) => (
                  <span key={email} className="dash-invite-chip">
                    {email}
                    <button type="button" onClick={() => setInviteEmails((prev) => prev.filter((e) => e !== email))}>&times;</button>
                  </span>
                ))}
                <input
                  type="email"
                  value={inviteInput}
                  onChange={(e) => { setInviteInput(e.target.value); setInviteError('') }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addInviteEmail(inviteInput) }
                    if (e.key === 'Backspace' && !inviteInput && inviteEmails.length > 0) setInviteEmails((prev) => prev.slice(0, -1))
                  }}
                  onBlur={() => { if (inviteInput.trim()) addInviteEmail(inviteInput) }}
                  placeholder={inviteEmails.length === 0 ? 'Saisir un email puis Entrée' : ''}
                  className="dash-invite-input"
                />
              </div>

              {/* Date / Time */}
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
                <div style={{ flex: 1 }}>
                  <label className="dash-invite-label" htmlFor="invite-date">Date <span style={{ fontStyle: 'italic' }}>(optionnel)</span></label>
                  <input id="invite-date" type="date" value={inviteDate} onChange={(e) => setInviteDate(e.target.value)} className="dash-invite-field" />
                </div>
                <div style={{ flex: 0.6 }}>
                  <label className="dash-invite-label" htmlFor="invite-time">Heure</label>
                  <input id="invite-time" type="time" value={inviteTime} onChange={(e) => setInviteTime(e.target.value)} className="dash-invite-field" />
                </div>
              </div>

              {/* Send button */}
              <button
                className={`dash-invite-send ${inviteSent ? 'success' : ''}`}
                disabled={inviteEmails.length === 0 || inviteMutation.isPending}
                onClick={handleSendInvites}
              >
                {inviteSent ? '✓ Invitations envoyées !' : inviteMutation.isPending ? '...' : 'Envoyer les invitations'}
              </button>

              {inviteError && <p style={{ color: '#D93025', fontSize: '0.8rem', marginTop: '0.25rem' }}>{inviteError}</p>}
            </div>

            <button className="dash-later-close" onClick={resetInviteState} style={{ marginTop: '0.5rem' }}>
              Fermer
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export const Dashboard = () => {
  return (
    <UserAware>
      <Screen header={true} footer={true}>
        <DashboardContent />
      </Screen>
    </UserAware>
  )
}
