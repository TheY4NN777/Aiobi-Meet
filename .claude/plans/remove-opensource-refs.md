# Plan : Supprimer les references open source et licences

## Contexte
Aïobi Meet est desormais un produit proprietaire. Toutes les references a l'open source,
aux licences MIT/Etalab, aux contributions communautaires et au fork DINUM doivent etre
supprimees ou remplacees.

---

## Etape 1 — Fichiers root a supprimer

- [ ] `CONTRIBUTING.md` — guide de contribution open source
- [ ] `CODE_OF_CONDUCT.md` — code of conduct communautaire
- [ ] `LICENSES/LICENSE.MIT.md` — licence MIT DINUM/Etalab
- [ ] `LICENSES/LICENSE.Etalab-2.0.md` — licence ouverte Etalab 2.0
- [ ] Supprimer le dossier `LICENSES/` s'il est vide apres

## Etape 2 — Fichiers root a modifier

### `LICENSE.md`
- Remplacer le contenu MIT par une mention proprietaire :
  ```
  Copyright (c) 2025-present Aïobi. All rights reserved.
  This software is proprietary and confidential.
  Unauthorized copying, distribution, or use is strictly prohibited.
  ```

### `README.md`
- Retirer le badge "PRs Welcome" (ligne 10)
- Retirer "released under the MIT License" (ligne 44)
- Retirer la section "Contributing" (lignes 76-81)
- Retirer "open-source video conferencing" (ligne 86)
- Retirer "available under MIT license" (ligne 95)
- Retirer "All features we develop will always remain open-source" (ligne 97)
- Retirer la section fork attribution "La Suite Meet by DINUM" (ligne 101)
- Retirer "published under the MIT license" (ligne 107)

### `SECURITY.md`
- Remplacer "open source project" par "project" (ligne 12)
- Remplacer "open source software project" par "software project" (ligne 23)

## Etape 3 — Frontend locales (4 langues)

### `en/global.json`
- Retirer "Our code is open and available on this" (ligne 40)
- Retirer "Open Source Code Repository" (ligne 41)
- Retirer "Unless otherwise stated..." + "etalab 2.0 license" (lignes 45-46)

### `fr/global.json`
- Retirer "Notre code est ouvert et disponible sur ce" (ligne 40)
- Retirer "depot de code Open Source" (ligne 41)
- Retirer "Sauf mention contraire..." + "licence etalab 2.0" (lignes 45-46)

### `de/global.json`
- Retirer "Unser Code ist offen..." (ligne 40)
- Retirer "Open-Source-Repository" (ligne 41)
- Retirer "Sofern nicht anders angegeben..." + "Etalab 2.0 Lizenz" (lignes 45-46)

### `nl/global.json`
- Retirer "Onze code is open..." (ligne 39)
- Retirer "Open Source Code Repository" (ligne 40)
- Retirer "Tenzij anders vermeld..." + "etalab 2.0 licentie" (lignes 44-45)

### `en/legals.json`, `fr/legals.json`, `de/legals.json`, `nl/legals.json`
- Retirer les mentions "Etalab 2.0 open license" et descriptions associees

## Etape 4 — Frontend composants

### `src/frontend/src/features/legalsTerms/LegalTermsRoute.tsx`
- Retirer le lien vers la licence Etalab 2.0 PDF (lignes 62-66)
- Remplacer par "Tous droits reserves Aiobi" ou equivalent

### `src/frontend/src/layout/Footer.tsx`
- Verifier qu'aucun lien "code repository" n'est rendu

## Etape 5 — Verification

- [ ] `grep -ri "open.source\|MIT\|etalab\|contributing\|PRs welcome" --include="*.md" --include="*.json" --include="*.tsx"` ne retourne rien
- [ ] Les pages legales s'affichent correctement sans reference open source
- [ ] Le footer ne montre aucun lien vers un repo de code

## Commit

Format : `chore(branding) remove open source references, replace with proprietary license`
