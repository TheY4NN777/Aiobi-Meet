#!/bin/bash
# =============================================================================
# DuckDNS IP Update Script
# Ajouter au crontab : */5 * * * * /path/to/duckdns-update.sh >> /var/log/duckdns.log 2>&1
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Charger le token depuis .env
if [ -f "$SCRIPT_DIR/.env" ]; then
    DUCKDNS_TOKEN=$(grep '^DUCKDNS_TOKEN=' "$SCRIPT_DIR/.env" | cut -d'=' -f2)
fi

if [ -z "$DUCKDNS_TOKEN" ] || [ "$DUCKDNS_TOKEN" = "<votre-token-duckdns>" ]; then
    echo "$(date): ERREUR — DUCKDNS_TOKEN non configure dans .env"
    exit 1
fi

DOMAINS="aiobi-meet,aiobi-livekit"

RESPONSE=$(curl -s "https://www.duckdns.org/update?domains=${DOMAINS}&token=${DUCKDNS_TOKEN}&verbose=true")

echo "$(date): $RESPONSE"
