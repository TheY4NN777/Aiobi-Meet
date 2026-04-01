import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Screen } from '@/layout/Screen'
import { useUser, UserAware, authUrl } from '@/features/auth'
import { generateRoomId, useCreateRoom } from '@/features/rooms'
import { navigateTo } from '@/navigation/navigateTo'
import { usePersistentUserChoices } from '@/features/rooms/livekit/hooks/usePersistentUserChoices'
import { isRoomValid } from '@/features/rooms'
import './Landing.css'

const AIOBI_FLAT = 13750
const PER_USER = { zoom: 13200, google: 8600, teams: 3600 }

function formatPrice(n: number) {
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' FCFA'
}

// Load Fontshare fonts for the landing page
const useFontshare = () => {
  useLayoutEffect(() => {
    const id = 'fontshare-landing'
    if (document.getElementById(id)) return
    const link = document.createElement('link')
    link.id = id
    link.rel = 'stylesheet'
    link.href = 'https://api.fontshare.com/v2/css?f[]=clash-display@700,600,500,400&f[]=satoshi@700,500,400,300&display=swap'
    document.head.appendChild(link)
  }, [])
}

const LandingContent = () => {
  const { isLoggedIn } = useUser()
  const { mutateAsync: createRoom } = useCreateRoom()
  const {
    userChoices: { username },
  } = usePersistentUserChoices()

  useFontshare()

  // State
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [navScrolled, setNavScrolled] = useState(false)
  const [backToTopVisible, setBackToTopVisible] = useState(false)
  const [openFaq, setOpenFaq] = useState<number | null>(null)
  const [teamSize, setTeamSize] = useState(10)
  const [joinCode, setJoinCode] = useState('')

  // Refs for scroll reveal
  const revealRefs = useRef<(HTMLElement | null)[]>([])

  // Scroll handler
  useEffect(() => {
    const onScroll = () => {
      setNavScrolled(window.scrollY > 50)
      setBackToTopVisible(window.scrollY > 600)
    }
    window.addEventListener('scroll', onScroll)
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // Scroll reveal with IntersectionObserver
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('revealed')
            observer.unobserve(entry.target)
          }
        })
      },
      { threshold: 0.1, rootMargin: '0px 0px -40px 0px' }
    )
    revealRefs.current.forEach((el) => el && observer.observe(el))
    return () => observer.disconnect()
  }, [])

  const addRevealRef = useCallback((el: HTMLElement | null) => {
    if (el && !revealRefs.current.includes(el)) {
      revealRefs.current.push(el)
    }
  }, [])

  // Actions
  const handleCreateInstant = async () => {
    if (!isLoggedIn) {
      window.location.href = authUrl()
      return
    }
    const slug = generateRoomId()
    const data = await createRoom({ slug, username })
    navigateTo('room', data.slug, {
      state: { create: true, initialRoomData: data },
    })
  }

  const handleJoinRoom = () => {
    const code = joinCode.trim()
    if (code && isRoomValid(code)) {
      navigateTo('room', code)
    }
  }

  // Simulator calculations
  const zoomPrice = PER_USER.zoom * teamSize
  const googlePrice = PER_USER.google * teamSize
  const teamsPrice = PER_USER.teams * teamSize
  const maxPrice = zoomPrice
  const savings = zoomPrice - AIOBI_FLAT
  const savingsPct = Math.round((savings / zoomPrice) * 100)
  const sliderPct = ((teamSize - 1) / (200 - 1)) * 100

  return (
    <div className="landing-page">
      {/* ===== NAVBAR ===== */}
      <nav className={`lp-navbar ${navScrolled ? 'scrolled' : ''}`}>
        <div className="lp-container">
          <a href="#" className="nav-logo">
            <img src="/assets/logo.svg" alt="Aïobi Meet" />
          </a>
          <ul className="nav-links">
            <li><a href="#features">Fonctionnalités</a></li>
            <li><a href="#sovereignty">Souveraineté</a></li>
            <li><a href="#pricing">Tarifs</a></li>
            <li><a href="#about">À propos</a></li>
            <li><a href="#faq">FAQ</a></li>
          </ul>
          <div className="nav-actions">
            <a href="#action-bar" className="btn btn-ghost">Rejoindre</a>
            {isLoggedIn ? (
              <button className="btn btn-primary" onClick={handleCreateInstant}>
                Créer une réunion
              </button>
            ) : (
              <a href={authUrl()} className="btn btn-primary">Se connecter</a>
            )}
          </div>
          <button
            className="hamburger"
            aria-label="Menu"
            onClick={() => setMobileMenuOpen(true)}
          >
            <span></span>
            <span></span>
            <span></span>
          </button>
        </div>
      </nav>

      {/* Mobile Menu */}
      <div className={`mobile-menu ${mobileMenuOpen ? 'open' : ''}`}>
        <button className="mobile-close" onClick={() => setMobileMenuOpen(false)}>&times;</button>
        <a href="#features" onClick={() => setMobileMenuOpen(false)}>Fonctionnalités</a>
        <a href="#sovereignty" onClick={() => setMobileMenuOpen(false)}>Souveraineté</a>
        <a href="#pricing" onClick={() => setMobileMenuOpen(false)}>Tarifs</a>
        <a href="#about" onClick={() => setMobileMenuOpen(false)}>À propos</a>
        <a href="#faq" onClick={() => setMobileMenuOpen(false)}>FAQ</a>
        {isLoggedIn ? (
          <button className="btn btn-primary btn-lg" onClick={handleCreateInstant}>
            Créer une réunion
          </button>
        ) : (
          <a href={authUrl()} className="btn btn-primary btn-lg">Se connecter</a>
        )}
      </div>

      {/* ===== HERO ===== */}
      <section className="hero">
        <div className="hero-bg"></div>
        <div className="hero-content">
          <span className="section-label reveal" ref={addRevealRef}>Vidéoconférence souveraine</span>
          <h1 className="reveal reveal-delay-1" ref={addRevealRef}>
            Communiquez librement,<br />en toute <span className="accent">souveraineté</span>
          </h1>
          <p className="hero-subtitle reveal reveal-delay-2" ref={addRevealRef}>
            Aïobi Meet est la première solution de vidéoconférence conçue en Afrique. Simple, sécurisée, sans compromis sur vos données.
          </p>
          <div className="hero-ctas reveal reveal-delay-3" ref={addRevealRef}>
            <button className="btn btn-primary btn-lg" onClick={handleCreateInstant}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="23 7 16 12 23 17 23 7" /><rect x="1" y="5" width="15" height="14" rx="2" ry="2" /></svg>
              Lancer une réunion
            </button>
            <a href="#pricing" className="btn btn-ghost btn-lg">Découvrir l&apos;offre entreprise</a>
          </div>
          <p className="hero-note reveal reveal-delay-4" ref={addRevealRef}>
            Gratuit, sans installation, depuis votre navigateur
          </p>
        </div>

        {/* App Mockup */}
        <div className="hero-mockup reveal" ref={addRevealRef}>
          <div className="mockup-window">
            <div className="mockup-titlebar">
              <div className="mockup-dots">
                <span></span><span></span><span></span>
              </div>
              <div className="mockup-title">Aïobi Meet — Réunion d&apos;équipe</div>
              <div style={{ width: '52px' }}></div>
            </div>
            <div className="mockup-body">
              <div className="mockup-grid">
                {[
                  { initials: 'AK', name: 'Aminata K.' },
                  { initials: 'MB', name: 'Moussa B.' },
                  { initials: 'SD', name: 'Sophie D.' },
                  { initials: 'JN', name: 'Jean N.' },
                  { initials: 'FL', name: 'Fatou L.' },
                ].map((user) => (
                  <div className="mockup-user" key={user.initials}>
                    <div className="mockup-avatar">{user.initials}</div>
                    <span className="mockup-user-name">{user.name}</span>
                  </div>
                ))}
                <div className="mockup-user">
                  <div className="mockup-avatar" style={{ background: 'rgba(162,81,252,0.3)' }}>+12</div>
                  <span className="mockup-user-name">12 autres participants</span>
                </div>
              </div>
              <div className="mockup-toolbar">
                <div className="toolbar-btn"><svg viewBox="0 0 24 24"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" /><path d="M19 10v2a7 7 0 0 1-14 0v-2" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="1.5" /><line x1="12" y1="19" x2="12" y2="23" stroke="rgba(255,255,255,0.7)" strokeWidth="1.5" /></svg></div>
                <div className="toolbar-btn"><svg viewBox="0 0 24 24"><path d="M23 7l-7 5 7 5V7z" /><rect x="1" y="5" width="15" height="14" rx="2" ry="2" /></svg></div>
                <div className="toolbar-btn"><svg viewBox="0 0 24 24"><rect x="2" y="3" width="20" height="14" rx="2" ry="2" /><line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" /></svg></div>
                <div className="toolbar-btn"><svg viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg></div>
                <div className="toolbar-btn end-call"><svg viewBox="0 0 24 24"><path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 2.59 3.4z" transform="rotate(135 12 12)" /></svg></div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ===== ACTION BAR ===== */}
      <div className="action-bar" id="action-bar">
        <div className="lp-container">
          <button className="btn btn-primary btn-lg" onClick={handleCreateInstant}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="20" height="20"><polygon points="23 7 16 12 23 17 23 7" /><rect x="1" y="5" width="15" height="14" rx="2" ry="2" /></svg>
            Lancer une réunion instantanée
          </button>
          <div className="action-divider"></div>
          <div className="join-group">
            <input
              type="text"
              placeholder="Entrez le code de réunion"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleJoinRoom()}
            />
            <button className="btn btn-primary" onClick={handleJoinRoom}>Rejoindre</button>
          </div>
        </div>
      </div>

      {/* ===== FEATURES ===== */}
      <section className="features" id="features">
        <div className="lp-container">
          <div className="section-header">
            <span className="section-label reveal" ref={addRevealRef}>Fonctionnalités</span>
            <h2 className="section-title reveal reveal-delay-1" ref={addRevealRef}>Tout ce dont vous avez besoin.<br />Rien de superflu.</h2>
            <p className="section-subtitle reveal reveal-delay-2" ref={addRevealRef}>Une interface minimaliste pensée pour l&apos;essentiel : communiquer efficacement, en toute simplicité.</p>
          </div>
          <div className="features-grid">
            {[
              { icon: <><polygon points="23 7 16 12 23 17 23 7" /><rect x="1" y="5" width="15" height="14" rx="2" ry="2" /></>, title: 'Vidéo HD', desc: 'Vidéoconférence haute définition fluide pour des réunions jusqu\'à 100 participants simultanés.' },
              { icon: <><rect x="2" y="3" width="20" height="14" rx="2" ry="2" /><line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" /></>, title: 'Partage d\'écran', desc: 'Partagez votre écran ou une fenêtre spécifique en un clic pour des présentations fluides.' },
              { icon: <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />, title: 'Chat intégré', desc: 'Échangez des messages en temps réel pendant vos réunions, sans quitter l\'appel.' },
              { icon: <><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></>, title: 'Arrière-plan personnalisé', desc: 'Personnalisez votre arrière-plan vidéo pour un rendu professionnel en toute circonstance.' },
              { icon: <><rect x="5" y="2" width="14" height="20" rx="2" ry="2" /><line x1="12" y1="18" x2="12.01" y2="18" /></>, title: 'Multi-appareils', desc: 'Compatible téléphone, ordinateur et tablette. Aucune installation requise, tout fonctionne depuis le navigateur.' },
              { icon: <><rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></>, title: 'Chiffrement TLS', desc: 'Toutes vos communications sont chiffrées de bout en bout via le protocole TLS.' },
              { icon: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></>, title: 'Interface minimaliste', desc: 'Juste ce qu\'il faut, pas plus. Une interface épurée qui vous permet de vous concentrer sur l\'essentiel.' },
              { icon: <><circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" /></>, title: 'Multilingue', desc: 'Disponible en français et en anglais. D\'autres langues seront ajoutées prochainement.' },
            ].map((f, i) => (
              <div className={`feature-card reveal ${i % 4 > 0 ? `reveal-delay-${i % 4}` : ''}`} key={f.title} ref={addRevealRef}>
                <div className="feature-icon"><svg viewBox="0 0 24 24">{f.icon}</svg></div>
                <h3>{f.title}</h3>
                <p>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== SOVEREIGNTY ===== */}
      <section className="sovereignty" id="sovereignty">
        <div className="lp-container">
          <div className="sovereignty-grid">
            <div className="sovereignty-text">
              <span className="section-label reveal" ref={addRevealRef}>Souveraineté numérique</span>
              <h2 className="section-title reveal reveal-delay-1" ref={addRevealRef}>Vos données vous appartiennent</h2>
              <p className="reveal reveal-delay-2" ref={addRevealRef}>Vos réunions, vos échanges stratégiques, vos données sensibles transitent chaque jour par des serveurs que vous ne contrôlez pas. Aïobi Meet change la donne.</p>
              <p className="reveal reveal-delay-2" ref={addRevealRef}>Notre infrastructure est conçue pour protéger ce qui compte : votre souveraineté numérique. Pas de revente de données, pas de tracking publicitaire, pas de compromis.</p>
              <div className="sovereignty-points">
                <div className="sov-point reveal" ref={addRevealRef}>
                  <div className="sov-point-icon">
                    <svg viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>
                  </div>
                  <div>
                    <h4>Infrastructure maîtrisée</h4>
                    <p>Une architecture conçue pour la protection de vos données</p>
                  </div>
                </div>
                <div className="sov-point reveal reveal-delay-1" ref={addRevealRef}>
                  <div className="sov-point-icon">
                    <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" /><line x1="4.93" y1="4.93" x2="19.07" y2="19.07" /></svg>
                  </div>
                  <div>
                    <h4>Zéro tracking publicitaire</h4>
                    <p>Aucune donnée revendue, aucun profilage, aucune publicité ciblée</p>
                  </div>
                </div>
                <div className="sov-point reveal reveal-delay-2" ref={addRevealRef}>
                  <div className="sov-point-icon">
                    <svg viewBox="0 0 24 24"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>
                  </div>
                  <div>
                    <h4>Conçu en Afrique, pour l&apos;Afrique</h4>
                    <p>Une approche souveraine pensée pour le continent</p>
                  </div>
                </div>
              </div>
            </div>
            <div className="sovereignty-visual reveal" ref={addRevealRef}>
              <div className="shield-graphic">
                <div className="shield-ring"></div>
                <div className="shield-ring"></div>
                <div className="shield-ring"></div>
                <div className="shield-center">
                  <svg viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ===== ROADMAP ===== */}
      <section className="roadmap" id="roadmap">
        <div className="lp-container">
          <div className="section-header">
            <span className="section-label reveal" ref={addRevealRef}>Roadmap</span>
            <h2 className="section-title reveal reveal-delay-1" ref={addRevealRef}>Ce qui arrive bientôt</h2>
            <p className="section-subtitle reveal reveal-delay-2" ref={addRevealRef}>Aïobi Meet évolue en permanence. Voici ce que nous préparons pour vous.</p>
          </div>
          <div className="roadmap-timeline">
            {[
              { phase: 'Disponible', title: 'Aïobi Meet v1', desc: 'La version actuelle avec toutes les fonctionnalités essentielles.', features: ['Vidéoconférence HD', 'Chat intégré', 'Partage d\'écran', 'Chiffrement TLS'] },
              { phase: 'Phase 2', title: 'Aïobi IA intégrée', desc: 'L\'intelligence artificielle au service de vos réunions.', features: ['Transcription automatique', 'Comptes rendus IA', 'Enregistrement des réunions'] },
              { phase: 'Phase 3', title: 'Écosystème Aïobi', desc: 'Intégration complète avec la suite Aïobi.', features: ['App mobile Android/iOS', 'Intégration Aïobi ERP'] },
            ].map((item, i) => (
              <div className={`roadmap-card reveal ${i > 0 ? `reveal-delay-${i}` : ''}`} key={item.phase} ref={addRevealRef}>
                <div className="roadmap-dot"></div>
                <div className="roadmap-card-inner">
                  <div className="roadmap-phase">{item.phase}</div>
                  <h3>{item.title}</h3>
                  <p>{item.desc}</p>
                  <div className="roadmap-features">
                    {item.features.map((f) => <span key={f}>{f}</span>)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== PRICING ===== */}
      <section className="pricing" id="pricing">
        <div className="lp-container">
          <div className="section-header">
            <span className="section-label reveal" ref={addRevealRef}>Tarifs</span>
            <h2 className="section-title reveal reveal-delay-1" ref={addRevealRef}>Simple et transparent</h2>
            <p className="section-subtitle reveal reveal-delay-2" ref={addRevealRef}>Commencez gratuitement, évoluez quand vous êtes prêt.</p>
          </div>
          <div className="pricing-grid">
            <div className="pricing-card reveal" ref={addRevealRef}>
              <h3>Gratuit</h3>
              <div className="price">0 FCFA</div>
              <div className="price-sub">Pour toujours — fair use applicable</div>
              <ul className="pricing-list">
                <li>Jusqu&apos;à 100 participants</li>
                <li>Vidéo HD</li>
                <li>Partage d&apos;écran</li>
                <li>Chat intégré</li>
                <li>Chiffrement TLS</li>
                <li>Aucune installation</li>
                <li>Durée max 1h30</li>
              </ul>
              {isLoggedIn ? (
                <button className="btn btn-ghost btn-lg" onClick={handleCreateInstant}>Créer une réunion</button>
              ) : (
                <a href={authUrl()} className="btn btn-ghost btn-lg">Créer un compte gratuit</a>
              )}
            </div>
            <div className="pricing-card reveal reveal-delay-1" ref={addRevealRef}>
              <h3>Entreprise</h3>
              <div className="price">13 750 FCFA</div>
              <div className="price-sub">/mois par organisation</div>
              <ul className="pricing-list">
                <li>Tout le plan gratuit inclus</li>
                <li>Participants illimités</li>
                <li>Durée illimitée</li>
                <li>Support dédié + SLA</li>
                <li>Administration des comptes</li>
                <li>Arrière-plans personnalisés</li>
              </ul>
              <a href="mailto:contact@aiobi.world" className="btn btn-primary btn-lg">Contactez-nous</a>
            </div>
            <div className="pricing-card featured reveal reveal-delay-2" ref={addRevealRef}>
              <div className="pricing-badge">Recommandé</div>
              <h3>Platinum</h3>
              <div className="price">Sur mesure</div>
              <div className="price-sub">L&apos;écosystème Aïobi complet</div>
              <ul className="pricing-list">
                <li>Tout le plan Entreprise inclus</li>
                <li>Transcription IA des réunions</li>
                <li>Comptes rendus automatiques par IA</li>
                <li>Accès Aïobi ERP</li>
                <li>Accès Aïobi Mail</li>
                <li>Accompagnement dédié</li>
              </ul>
              <a href="mailto:contact@aiobi.world" className="btn btn-primary btn-lg">Contactez-nous</a>
            </div>
          </div>
        </div>
      </section>

      {/* ===== COMPARISON ===== */}
      <section className="comparison" id="comparison">
        <div className="lp-container">
          <div className="section-header">
            <span className="section-label reveal" ref={addRevealRef}>Comparaison</span>
            <h2 className="section-title reveal reveal-delay-1" ref={addRevealRef}>Pourquoi Aïobi Meet ?</h2>
          </div>
          <div className="comparison-table-wrapper reveal" ref={addRevealRef}>
            <table className="comparison-table">
              <thead>
                <tr>
                  <th></th>
                  <th className="highlight">Aïobi Meet</th>
                  <th>Zoom</th>
                  <th>Google Meet</th>
                  <th>Teams</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Version gratuite</td>
                  <td className="highlight"><span className="check">&#10003;</span> Complète</td>
                  <td>Limitée (40 min)</td>
                  <td>Limitée (60 min)</td>
                  <td>Limitée</td>
                </tr>
                <tr>
                  <td>Souveraineté des données</td>
                  <td className="highlight"><span className="check">&#10003;</span> Totale</td>
                  <td><span className="cross">&#10007;</span> USA</td>
                  <td><span className="cross">&#10007;</span> USA</td>
                  <td><span className="cross">&#10007;</span> USA</td>
                </tr>
                <tr>
                  <td>Participants max (gratuit)</td>
                  <td className="highlight">100</td>
                  <td>100</td>
                  <td>100</td>
                  <td>100</td>
                </tr>
                <tr>
                  <td>IA intégrée</td>
                  <td className="highlight">Bientôt</td>
                  <td>Payant</td>
                  <td>Payant</td>
                  <td>Payant</td>
                </tr>
                <tr>
                  <td>Tracking publicitaire</td>
                  <td className="highlight"><span className="check">&#10003;</span> Aucun</td>
                  <td><span className="cross">&#10007;</span> Oui</td>
                  <td><span className="cross">&#10007;</span> Oui</td>
                  <td><span className="cross">&#10007;</span> Oui</td>
                </tr>
                <tr>
                  <td>Sans installation</td>
                  <td className="highlight"><span className="check">&#10003;</span></td>
                  <td>App requise</td>
                  <td><span className="check">&#10003;</span></td>
                  <td>App requise</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ===== SIMULATOR ===== */}
      <section className="simulator" id="simulator">
        <div className="lp-container">
          <div className="section-header">
            <span className="section-label reveal" ref={addRevealRef}>Economies</span>
            <h2 className="section-title reveal reveal-delay-1" ref={addRevealRef}>Combien payez-vous aujourd&apos;hui ?</h2>
            <p className="section-subtitle reveal reveal-delay-2" ref={addRevealRef}>Aïobi Meet : un prix fixe par organisation, quel que soit le nombre d&apos;utilisateurs.</p>
          </div>
          <div className="simulator-content reveal" ref={addRevealRef}>
            <div className="simulator-slider">
              <label className="slider-label" htmlFor="teamSlider">Taille de votre équipe</label>
              <div className="slider-wrapper">
                <input
                  type="range"
                  id="teamSlider"
                  min={1}
                  max={200}
                  value={teamSize}
                  className="team-slider"
                  onChange={(e) => setTeamSize(parseInt(e.target.value))}
                  style={{
                    background: `linear-gradient(to right, var(--accent) 0%, var(--accent) ${sliderPct}%, var(--border) ${sliderPct}%, var(--border) 100%)`,
                  }}
                />
                <div className="slider-value">{teamSize} {teamSize > 1 ? 'personnes' : 'personne'}</div>
              </div>
            </div>
            <div className="simulator-bars">
              <div className="sim-row">
                <span className="sim-label">Zoom Business</span>
                <div className="sim-bar-track"><div className="sim-bar" style={{ width: '100%' }}></div></div>
                <span className="sim-price">{formatPrice(zoomPrice)}</span>
              </div>
              <div className="sim-row">
                <span className="sim-label">Google Standard</span>
                <div className="sim-bar-track"><div className="sim-bar" style={{ width: `${(googlePrice / maxPrice) * 100}%` }}></div></div>
                <span className="sim-price">{formatPrice(googlePrice)}</span>
              </div>
              <div className="sim-row">
                <span className="sim-label">Microsoft Teams</span>
                <div className="sim-bar-track"><div className="sim-bar" style={{ width: `${(teamsPrice / maxPrice) * 100}%` }}></div></div>
                <span className="sim-price">{formatPrice(teamsPrice)}</span>
              </div>
              <div className="sim-row sim-row-highlight">
                <span className="sim-label">Aïobi Meet</span>
                <div className="sim-bar-track"><div className="sim-bar sim-bar-accent" style={{ width: `${Math.max((AIOBI_FLAT / maxPrice) * 100, 1.5)}%` }}></div></div>
                <span className="sim-price sim-price-accent">{formatPrice(AIOBI_FLAT)}</span>
              </div>
            </div>
            <p className="simulator-savings">
              Économisez <strong>{formatPrice(savings)}/mois</strong> par rapport à Zoom (−{savingsPct}%)
            </p>
          </div>
        </div>
      </section>

      {/* ===== ABOUT ===== */}
      <section className="about" id="about">
        <div className="lp-container">
          <div className="about-grid">
            <div className="about-text">
              <span className="section-label reveal" ref={addRevealRef}>À propos</span>
              <h2 className="section-title reveal reveal-delay-1" ref={addRevealRef}>Qui sommes-nous ?</h2>
              <p className="reveal reveal-delay-2" ref={addRevealRef}>
                <a href="https://aiobi.world" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)' }}>Aïobi</a> est la première DeepTech d&apos;Afrique de l&apos;Ouest dédiée à l&apos;intelligence artificielle appliquée aux entreprises. Nous concevons des solutions technologiques souveraines pour le continent africain.
              </p>
              <p className="reveal reveal-delay-2" ref={addRevealRef}>
                Filiale du groupe BBS Holding / BURVAL Corporate, nous bénéficions de plus de 30 ans d&apos;expertise et d&apos;une présence dans 8 pays avec plus de 12 000 collaborateurs.
              </p>
              <div className="about-stats reveal reveal-delay-3" ref={addRevealRef}>
                <div className="stat-item">
                  <div className="stat-number">30+</div>
                  <div className="stat-label">Années d&apos;expertise</div>
                </div>
                <div className="stat-item">
                  <div className="stat-number">12k+</div>
                  <div className="stat-label">Collaborateurs</div>
                </div>
                <div className="stat-item">
                  <div className="stat-number">8</div>
                  <div className="stat-label">Pays</div>
                </div>
              </div>
            </div>
            <div className="about-visual reveal" ref={addRevealRef}>
              <img src="/assets/logo.svg" alt="Aïobi" className="about-logo-large" />
            </div>
          </div>
        </div>
      </section>

      {/* ===== SIGNUP / CTA ===== */}
      <section className="signup" id="signup">
        <div className="lp-container">
          <span className="section-label" style={{ color: 'var(--accent)' }}>Commencez maintenant</span>
          <h2>Prêt à communiquer<br />en toute souveraineté ?</h2>
          <p>Accédez gratuitement à toutes les fonctionnalités de base. Sans engagement, sans carte bancaire.</p>
          <div className="cta-buttons">
            {isLoggedIn ? (
              <button className="btn btn-primary btn-lg" onClick={handleCreateInstant}>
                Créer une réunion
              </button>
            ) : (
              <a href={authUrl()} className="btn btn-primary btn-lg">Créer un compte gratuit</a>
            )}
            <a href="#pricing" className="btn btn-ghost btn-lg" style={{ borderColor: 'rgba(255,255,255,0.2)', color: 'rgba(255,255,255,0.8)' }}>Voir les tarifs</a>
          </div>
        </div>
      </section>

      {/* ===== FAQ ===== */}
      <section className="faq" id="faq">
        <div className="lp-container">
          <div className="section-header">
            <span className="section-label reveal" ref={addRevealRef}>FAQ</span>
            <h2 className="section-title reveal reveal-delay-1" ref={addRevealRef}>Questions fréquentes</h2>
          </div>
          <div className="faq-list">
            {[
              { q: 'Ai-je besoin de créer un compte pour rejoindre une réunion ?', a: 'Non, vous pouvez rejoindre une réunion simplement avec le code ou le lien d\'invitation, sans créer de compte. Un compte est nécessaire uniquement pour créer et organiser vos propres réunions.' },
              { q: 'Combien de participants maximum par réunion ?', a: 'La version gratuite permet jusqu\'à 100 participants par réunion. La version entreprise offre un nombre de participants étendu selon vos besoins.' },
              { q: 'Est-ce que mes données sont protégées ?', a: 'Oui. Toutes les communications sont chiffrées via le protocole TLS. Nous ne revendons aucune donnée et ne pratiquons aucun tracking publicitaire. Votre vie privée est notre priorité.' },
              { q: 'Quelle est la différence entre la version gratuite et entreprise ?', a: 'La version gratuite donne accès à toutes les fonctionnalités de base sans limite de temps. La version entreprise ajoute le support dédié avec SLA, l\'administration des comptes, le branding personnalisé, les intégrations custom et un nombre de participants étendu.' },
              { q: 'Est-ce que ça marche sur mobile ?', a: 'Oui, Aïobi Meet fonctionne directement depuis le navigateur de votre téléphone ou tablette, sans aucune installation. Une application mobile native Android et iOS est également prévue dans notre roadmap.' },
              { q: 'Comment contacter le support ?', a: 'Vous pouvez nous contacter à tout moment via l\'adresse support-meet@aiobi.world. Les utilisateurs de la version entreprise bénéficient d\'un support dédié avec des temps de réponse garantis.' },
            ].map((item, i) => (
              <div className={`faq-item ${openFaq === i ? 'open' : ''} reveal ${i > 0 ? `reveal-delay-${Math.min(i, 3)}` : ''}`} key={i} ref={addRevealRef}>
                <button className="faq-question" onClick={() => setOpenFaq(openFaq === i ? null : i)}>
                  {item.q}
                  <div className="faq-icon"></div>
                </button>
                <div className="faq-answer">
                  <p className="faq-answer-inner">{item.a}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== FOOTER ===== */}
      <footer className="lp-footer">
        <div className="footer-content lp-container">
          <div className="footer-grid">
            <div className="footer-col-intro">
              <h4>Vidéoconférence souveraine,<br />conçue en Afrique de l&apos;Ouest.</h4>
              <p>Première DeepTech du continent dédiée à l&apos;IA appliquée aux entreprises. Filiale de BBS Holding / BURVAL Corporate.</p>
              <div className="footer-status">
                <span>Disponible maintenant</span>
                <span className="status-secondary">Afrique &middot; Europe &middot; Monde</span>
              </div>
              <div className="footer-socials">
                <a href="https://facebook.com" target="_blank" rel="noopener noreferrer" aria-label="Facebook"><svg viewBox="0 0 24 24"><path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" /></svg></a>
                <a href="https://linkedin.com" target="_blank" rel="noopener noreferrer" aria-label="LinkedIn"><svg viewBox="0 0 24 24"><path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-4 0v7h-4v-7a6 6 0 0 1 6-6z" /><rect x="2" y="9" width="4" height="12" /><circle cx="4" cy="4" r="2" /></svg></a>
                <a href="https://instagram.com" target="_blank" rel="noopener noreferrer" aria-label="Instagram"><svg viewBox="0 0 24 24"><path d="M7.8 2h8.4C19.4 2 22 4.6 22 7.8v8.4a5.8 5.8 0 0 1-5.8 5.8H7.8C4.6 22 2 19.4 2 16.2V7.8A5.8 5.8 0 0 1 7.8 2m-.2 2A3.6 3.6 0 0 0 4 7.6v8.8C4 18.39 5.61 20 7.6 20h8.8a3.6 3.6 0 0 0 3.6-3.6V7.6C20 5.61 18.39 4 16.4 4H7.6m9.65 1.5a1.25 1.25 0 0 1 1.25 1.25A1.25 1.25 0 0 1 17.25 8 1.25 1.25 0 0 1 16 6.75a1.25 1.25 0 0 1 1.25-1.25M12 7a5 5 0 0 1 5 5 5 5 0 0 1-5 5 5 5 0 0 1-5-5 5 5 0 0 1 5-5m0 2a3 3 0 0 0-3 3 3 3 0 0 0 3 3 3 3 0 0 0 3-3 3 3 0 0 0-3-3z" /></svg></a>
              </div>
            </div>
            <div className="footer-nav">
              <h5>Navigation</h5>
              <div className="footer-links">
                <a href="#">Accueil</a>
                <a href="#features">Fonctionnalités</a>
                <a href="#pricing">Tarifs</a>
                <a href="#about">À propos</a>
                <a href="#faq">FAQ</a>
              </div>
            </div>
            <div className="footer-contact-col">
              <h5>Contact</h5>
              <div className="footer-contact-links">
                <a href="mailto:contact@aiobi.world">contact@aiobi.world</a>
                <a href="mailto:support-meet@aiobi.world">support-meet@aiobi.world</a>
                <a href="https://aiobi.world" target="_blank" rel="noopener noreferrer">aiobi.world</a>
              </div>
            </div>
          </div>
        </div>
        <div className="footer-brand">Aïobi Meet</div>
        <div className="footer-bottom lp-container">
          <p>&copy; 2026 <a href="https://aiobi.world" target="_blank" rel="noopener noreferrer" style={{ color: 'rgba(255,255,255,0.3)', textDecoration: 'underline', textUnderlineOffset: '2px' }}>Aïobi</a>. Made in Africa.</p>
        </div>
      </footer>

      {/* Back to top */}
      <button
        className={`back-to-top ${backToTopVisible ? 'visible' : ''}`}
        aria-label="Retour en haut"
        onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      >
        <svg viewBox="0 0 24 24"><polyline points="18 15 12 9 6 15" /></svg>
      </button>
    </div>
  )
}

export const Home = () => {
  return (
    <UserAware>
      <Screen header={false} footer={false}>
        <LandingContent />
      </Screen>
    </UserAware>
  )
}
