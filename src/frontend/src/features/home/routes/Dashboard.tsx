import { useCallback, useLayoutEffect, useState } from 'react'
import { Screen } from '@/layout/Screen'
import { useUser, UserAware } from '@/features/auth'
import { generateRoomId, useCreateRoom, isRoomValid } from '@/features/rooms'
import { navigateTo } from '@/navigation/navigateTo'
import { usePersistentUserChoices } from '@/features/rooms/livekit/hooks/usePersistentUserChoices'
import { ApiRoom } from '@/features/rooms/api/ApiRoom'
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
    const code = joinCode.trim()
    if (code && isRoomValid(code)) {
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

  const displayName = user?.full_name || user?.short_name || username || ''

  return (
    <div className="app-dashboard">
      {/* Hero */}
      <div className="dash-hero">
        <div className="dash-greeting">
          {displayName ? `Bonjour, ${displayName}` : 'Bienvenue'}
        </div>
        <h1>
          Prêt à <span className="accent">communiquer</span> ?
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
        <div className="dash-later-overlay" onClick={() => setLaterRoom(null)}>
          <div className="dash-later-card" onClick={(e) => e.stopPropagation()}>
            <h3>Votre réunion est prête</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '1rem' }}>
              Partagez ce lien avec les participants :
            </p>
            <div className="dash-later-url">
              {window.location.origin}/{laterRoom.slug}
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button className="dash-later-copy" onClick={handleCopyLink}>
                {copied ? 'Copié !' : 'Copier le lien'}
              </button>
              <button className="dash-later-close" onClick={() => setLaterRoom(null)}>
                Fermer
              </button>
            </div>
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
