import { useCallback, useEffect, useLayoutEffect, useState } from 'react'
import { Screen } from '@/layout/Screen'
import { useUser, UserAware } from '@/features/auth'
import { generateRoomId, useCreateRoom } from '@/features/rooms'
import { navigateTo } from '@/navigation/navigateTo'
import { usePersistentUserChoices } from '@/features/rooms/livekit/hooks/usePersistentUserChoices'
import type { ApiRoom } from '@/features/rooms/api/ApiRoom'
import { PlanLaterModal } from '@/features/rooms/components/PlanLaterModal'
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
          Lancez une réunion, planifiez pour plus tard ou gérez vos réunions planifiées.
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
        <div
          className="dash-action-card"
          onClick={() => navigateTo('meetings')}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === 'Enter' && navigateTo('meetings')}
        >
          <div className="dash-action-icon">
            <svg viewBox="0 0 24 24">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
          </div>
          <h3>Mes réunions</h3>
          <p>Gérez vos réunions planifiées</p>
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

      {laterRoom && (
        <PlanLaterModal room={laterRoom} onClose={() => setLaterRoom(null)} />
      )}
    </div>
  )
}

export const Dashboard = () => {
  return (
    <UserAware>
      <Screen header={true} footer={false}>
        <DashboardContent />
      </Screen>
    </UserAware>
  )
}
