import './ReleaseNotes.css'

export const ReleaseNotesRoute = () => {
  return (
    <div className="release-notes-page">
      <nav className="rn-navbar">
        <div className="rn-container">
          <a href="/" className="rn-logo">
            <img src="/assets/logo.svg" alt="Aïobi Meet" />
          </a>
          <a href="/" className="rn-back">&larr; Retour au site</a>
        </div>
      </nav>

      <main className="rn-main">
        <div className="rn-container">

          <header className="rn-header">
            <span className="rn-badge">v1.0.0</span>
            <h1>Nouveautés Aïobi Meet</h1>
            <p className="rn-subtitle">
              Première version publique — Avril 2026
            </p>
            <p className="rn-intro">
              Bienvenue sur la page des nouveautés Aïobi Meet. C'est ici que nous publierons, à chaque version, tout ce qui arrive de nouveau dans votre outil de visioconférence. Comme il s'agit de notre toute première publication, cette page fait à la fois office d'introduction au produit et de note de lancement officiel.
            </p>
          </header>

          <section className="rn-section rn-highlight">
            <p className="rn-tagline">La visioconférence souveraine, pensée et hébergée pour l'Afrique.</p>
            <p>
              Aïobi Meet est un outil de visioconférence professionnel, gratuit pour commencer, conçu pour les équipes, les écoles, les administrations et les entreprises africaines qui veulent communiquer efficacement sans dépendre des géants américains.
            </p>
            <p>Pas d'installation. Pas de publicité. Pas de tracking. Vos données restent chez nous.</p>
          </section>

          <section className="rn-section">
            <h2>Pourquoi Aïobi Meet</h2>
            <p>La plupart des outils de visioconférence que vous connaissez sont hébergés aux États-Unis, collectent vos données, et imposent des tarifs conçus pour des économies lointaines. Aïobi Meet propose une alternative crédible :</p>
            <ul className="rn-list">
              <li><strong>Souveraineté</strong> — toute votre donnée reste sur une infrastructure hébergée en propre.</li>
              <li><strong>Prix adaptés</strong> — un modèle simple, en FCFA, pensé pour les organisations africaines.</li>
              <li><strong>Zéro installation</strong> — ça marche directement dans votre navigateur, sur ordinateur ou téléphone.</li>
              <li><strong>Transcription IA incluse</strong> — même gratuitement, dans la limite d'un usage raisonnable.</li>
              <li><strong>Pas de publicité, pas de revente de données</strong> — jamais.</li>
            </ul>
          </section>

          <section className="rn-section">
            <h2>Ce que vous pouvez faire avec Aïobi Meet</h2>

            <div className="rn-feature">
              <h3>Démarrer une réunion en deux clics</h3>
              <p>Créez une nouvelle réunion depuis votre tableau de bord, copiez le lien, partagez-le. Vos invités rejoignent directement depuis leur navigateur, sans créer de compte et sans installer quoi que ce soit.</p>
            </div>

            <div className="rn-feature">
              <h3>Planifier vos réunions à l'avance</h3>
              <p>Organisez une réunion pour plus tard en choisissant la date, l'heure et le fuseau horaire. Invitez vos participants par email : Aïobi Meet envoie automatiquement à chacun un email d'invitation propre avec le lien et tous les détails.</p>
              <p>Besoin d'ajouter des invités plus tard ? Rouvrez simplement la réunion, tous les détails sont conservés.</p>
            </div>

            <div className="rn-feature">
              <h3>Retrouver toutes vos réunions au même endroit</h3>
              <p>La page <strong>Mes réunions</strong> regroupe vos sessions en trois onglets : <strong>À venir</strong>, <strong>Historique</strong>, <strong>Archives</strong>. Vous pouvez rejoindre, copier le lien, modifier le titre ou la date, inviter de nouvelles personnes, supprimer une réunion, ou archiver/supprimer plusieurs sessions d'un coup.</p>
            </div>

            <div className="rn-feature">
              <h3>Enregistrer vos réunions</h3>
              <p>Lancez l'enregistrement en un clic pendant une réunion. Dès qu'il est prêt, vous recevez un email avec le lien de téléchargement. Vous gardez le contrôle total sur votre enregistrement.</p>
            </div>

            <div className="rn-feature">
              <h3>Transcrire automatiquement ce qui s'est dit</h3>
              <p>Aïobi Meet transcrit automatiquement vos réunions grâce à une intelligence artificielle hébergée en propre. Vous recevez la transcription par email, avec les horodatages pour retrouver rapidement un passage. La transcription est disponible <strong>dès le plan gratuit</strong>, dans la limite d'un usage raisonnable.</p>
            </div>

            <div className="rn-feature">
              <h3>Garder le contrôle de vos réunions</h3>
              <p>L'organisateur dispose d'outils de modération complets : couper le micro d'un participant ou de tous les participants, exclure quelqu'un de la réunion, activer une salle d'attente pour valider chaque entrée, et contrôler les permissions (caméra, micro, partage d'écran) pour l'ensemble des participants. Les participants peuvent lever la main pour demander la parole.</p>
            </div>

            <div className="rn-feature">
              <h3>Vidéo HD, partage d'écran, chat, réactions</h3>
              <p>Tout ce qu'on attend d'un outil de visioconférence moderne : vidéo haute définition, partage d'écran, chat intégré pendant la réunion, réactions rapides, flou d'arrière-plan, et des paramètres d'accessibilité pour adapter l'outil à votre confort.</p>
            </div>
          </section>

          <section className="rn-section">
            <h2>Combien ça coûte</h2>
            <div className="rn-pricing-grid">
              <div className="rn-pricing-card">
                <h3>Gratuit</h3>
                <div className="rn-price">0 FCFA</div>
                <div className="rn-price-sub">Pour toujours</div>
                <ul>
                  <li>Jusqu'à 100 participants par réunion</li>
                  <li>Durée maximale de 1h30 par appel</li>
                  <li>Vidéo HD, partage d'écran, chat</li>
                  <li>Enregistrement et transcription IA inclus (fair use)</li>
                  <li>Aucune publicité, aucun tracking</li>
                </ul>
              </div>
              <div className="rn-pricing-card">
                <h3>Entreprise</h3>
                <div className="rn-price">13 750 FCFA</div>
                <div className="rn-price-sub">/ mois / organisation</div>
                <ul>
                  <li>Tout le plan Gratuit inclus</li>
                  <li>Participants et durée illimités</li>
                  <li>Enregistrement complet sans quota</li>
                  <li>Administration des comptes</li>
                  <li>Arrière-plans personnalisés</li>
                  <li>Support dédié avec SLA</li>
                </ul>
              </div>
              <div className="rn-pricing-card rn-featured">
                <h3>Platinum</h3>
                <div className="rn-price">Sur mesure</div>
                <div className="rn-price-sub">L'écosystème Aïobi complet</div>
                <ul>
                  <li>Tout le plan Entreprise inclus</li>
                  <li>Transcription IA et comptes rendus automatiques sans limite</li>
                  <li>Accès aux autres produits de l'écosystème Aïobi (ERP, Mail)</li>
                  <li>Accompagnement dédié</li>
                </ul>
              </div>
            </div>
            <p className="rn-pricing-cta">Pour un plan Entreprise ou Platinum, écrivez-nous à <strong><a href="mailto:contact@aiobi.world">contact@aiobi.world</a></strong>.</p>
          </section>

          <section className="rn-section">
            <h2>Pour qui est Aïobi Meet</h2>
            <ul className="rn-list">
              <li><strong>Les startups et PME africaines</strong> qui veulent un outil professionnel sans les tarifs en dollars ou en euros</li>
              <li><strong>Les écoles, universités et formateurs</strong> qui organisent des cours ou ateliers à distance</li>
              <li><strong>Les administrations et institutions publiques</strong> qui ont besoin de garantir la souveraineté de leurs échanges</li>
              <li><strong>Les associations et équipes distantes</strong> qui cherchent un outil simple, souverain et abordable</li>
              <li><strong>Tout utilisateur</strong> qui veut une alternative sérieuse aux plateformes américaines</li>
            </ul>
          </section>

          <section className="rn-section rn-cta-section">
            <h2>Commencer maintenant</h2>
            <p>Aïobi Meet est disponible sur <strong><a href="https://meet.aiobi.world">meet.aiobi.world</a></strong>.</p>
            <p>Créez votre compte gratuit, invitez vos collègues, et tenez votre première réunion en moins d'une minute.</p>
            <a href="https://meet.aiobi.world" className="rn-btn-primary">Créer un compte gratuit</a>
          </section>

          <footer className="rn-footer">
            <p><strong>Questions ou retours ?</strong></p>
            <p>Support utilisateurs : <a href="mailto:support@aiobi.world">support@aiobi.world</a></p>
            <p>Demandes commerciales : <a href="mailto:team@aiobi.world">team@aiobi.world</a></p>
            <p className="rn-footer-note">Retrouvez les prochaines nouveautés Aïobi Meet sur cette même page, à chaque nouvelle version.</p>
            <p className="rn-footer-brand">L'équipe Aïobi</p>
          </footer>

        </div>
      </main>
    </div>
  )
}
