# Aiobi Meet — Production Deployment Log

> Ce fichier documente les erreurs rencontrees et les corrections apportees
> lors du deploiement en production. Il sert de reference pour le depannage.

---

## Deploiement initial — En attente

Le deploiement initial n'a pas encore eu lieu. Les prerequis serveur doivent
etre completes en premier (voir README.md section 13).

### Prerequis en attente

- [ ] Docker installe sur le serveur de prod
- [ ] GitLab Runner enregistre (tag: prod)
- [ ] Structure repertoires creee (`/opt/aiobi-meet/production/`)
- [ ] `.env` rempli avec les secrets
- [ ] DNS A records configures (meet, id, lkt → IP serveur)
- [ ] Sysctl `net.core.rmem_max=5000000`
- [ ] Firewall : 80, 443, 47881/tcp, 47882/udp
