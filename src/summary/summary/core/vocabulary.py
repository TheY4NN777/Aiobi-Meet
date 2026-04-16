"""Universal vocabulary for whisper initial_prompt.

Categories ordered by transcription impact (proper nouns and terms most likely
to be misrecognized by whisper on African-accented French audio).
Update via PR — applies on next summary image rebuild.
"""

VOCABULARY: dict[str, list[str]] = {
    "platform": [
        "Aïobi",
        "Aïobi Meet",
        "Aïobi Docs",
        "Aïobi ID",
        "Aïobi OS",
        "KAIROS",
        "LiveKit",
        "Keycloak",
        "Django",
        "Celery",
        "FastAPI",
        "MinIO",
        "Docker",
        "Kubernetes",
        "Traefik",
        "WireGuard",
        "Prometheus",
        "Grafana",
        "Loki",
        "GlitchTip",
        "Plausible",
        "HocusPocus",
        "CRDT",
        "Yjs",
        "Vite.js",
    ],
    "tech_universal": [
        "API",
        "WebRTC",
        "SFU",
        "OIDC",
        "SSO",
        "CI/CD",
        "GitHub",
        "GitLab",
        "Figma",
        "Notion",
        "Slack",
        "LLM",
        "Ollama",
        "Gemma",
        "Langfuse",
        "Terraform",
        "Ansible",
        "PostgreSQL",
        "Redis",
    ],
    "business_startup": [
        "MVP",
        "Sprint",
        "Scrum",
        "Backlog",
        "Epic",
        "Livrable",
        "Pitch",
        "Fintech",
        "Agritech",
        "Healthtech",
        "Incubateur",
        "Accélérateur",
        "OHADA",
        "UEMOA",
        "CEDEAO",
        "BRVM",
        "Mobile Money",
        "Orange Money",
        "Wave",
        "MTN MoMo",
    ],
    "academic": [
        "soutenance",
        "mémoire",
        "encadreur",
        "jury",
        "DESS",
        "Master",
        "Licence",
        "doctorat",
        "séminaire",
        "symposium",
        "2iE",
        "UCAO",
        "UAO",
    ],
    "corporate": [
        "BBS Holding",
        "BURVAL",
        "OGUN",
        "HERMES",
        "LEGBA",
        "Souveraineté Numérique",
        "Scaling Horizontal",
    ],
}

_INTRO = "Réunion en français. Termes : "
_MAX_CHARS = 900


def build_initial_prompt() -> str:
    """Build a whisper initial_prompt from vocabulary, truncated to ~224 tokens."""
    terms: list[str] = []
    for category_terms in VOCABULARY.values():
        terms.extend(category_terms)

    result = _INTRO
    for term in terms:
        candidate = result + term + ", "
        if len(candidate) > _MAX_CHARS:
            break
        result = candidate
    return result.rstrip(", ") + "."
