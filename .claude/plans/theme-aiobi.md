# Plan : Appliquer le theme Aiobi Meet

## Contexte

Le frontend utilise encore la palette DINUM (bleu republicain #000091, system fonts).
Les brand guidelines Aiobi imposent : Violet #4A3C5C, Lilas #E4D3E6, Blanc #F8F8F9, Noir #0F1010, fonts HK Grotesk (titres) + Roboto (body).

## Fichiers a modifier (7 fichiers)

| # | Fichier | Changement |
|---|---------|-----------|
| 1 | `src/frontend/package.json` | Ajouter `@fontsource/hk-grotesk` + `@fontsource/roboto` |
| 2 | `src/frontend/index.html` | Ajouter `<link rel="preload">` pour HK Grotesk 700 et Roboto 400 |
| 3 | `src/frontend/src/styles/index.css` | Ajouter `@font-face` pour HK Grotesk (700) + Roboto (400, 500, 700) |
| 4 | `src/frontend/panda.config.ts` | Remplacer palettes primary/primaryDark, fonts, textStyles, semantic tokens |
| 5 | `src/frontend/src/styles/livekit.css` | Corriger `blue-300` → `primary-300` (ligne 126) |
| 6 | `src/frontend/src/primitives/A.tsx` | Remplacer `Marianne` → `heading`, `blue` → `primary` |
| 7 | `src/frontend/src/features/rooms/livekit/components/IsIdleDisconnectModal.tsx` | `blue.100` → `primary.100`, `blue.800` → `primary.800` |

## Etape 1 : Installer les fonts (npm)

```bash
cd src/frontend && npm install @fontsource/hk-grotesk @fontsource/roboto
```

## Etape 2 : `index.html` — Preload fonts

Ajouter avant les preloads Material Icons existants :

```html
<link rel="preload" as="font" crossorigin="anonymous"
  href="/node_modules/@fontsource/hk-grotesk/files/hk-grotesk-latin-700-normal.woff2" type="font/woff2" />
<link rel="preload" as="font" crossorigin="anonymous"
  href="/node_modules/@fontsource/roboto/files/roboto-latin-400-normal.woff2" type="font/woff2" />
```

## Etape 3 : `index.css` — @font-face declarations

Ajouter apres `@import './livekit.css'` : HK Grotesk (700) + Roboto (400, 500, 700)

## Etape 4 : `panda.config.ts` — Palettes de couleurs

### primary (violet Aiobi)
50: #F6F3F7, 100: #E4D3E6 (Lilas), 200: #D4BFD7, 300: #C0A5C4, 400: #9A7EA0, 500: #7A6282, 600: #5E4A66, 700: #4A3C5C (Violet), 800: #3A2E4A, 900: #2B2138, 950: #1E1628, action: #4A3C5C

### primaryDark (mode sombre visio)
50: #1A1422, 75: #241C30, 100: #2E243C, 200: #3E3250, 300: #5E4A6E, 400: #7A6488, 500: #967EA2, 600: #B098BC, 700: #C8B2D2, 800: #DCCCE4, 900: #EADCEF, 950: #F6F0F8, action: #C0A5C4

## Etape 5 : `panda.config.ts` — Fonts
- `fonts.sans` → Roboto + fallbacks
- `fonts.heading` (nouveau) → HK Grotesk + fallbacks

## Etape 6 : `panda.config.ts` — Text styles
Ajouter `fontFamily: 'heading'` a display, h1, h2, h3.

## Etape 7 : `panda.config.ts` — Semantic tokens
primary.DEFAULT → {colors.primary.700}, default.text → #0F1010, default.bg → #F8F8F9, focusRing → #4A3C5C

## Etape 8 : Corrections hardcoded
- livekit.css: blue-300 → primary-300
- A.tsx: Marianne → heading
- IsIdleDisconnectModal.tsx: blue.100/800 → primary.100/800

## Etape 9 : Supprimer logo-suite-numerique.png

## Verification
1. npm install → npx panda codegen → npm run build
2. Visuellement : fond #F8F8F9, boutons violets, HK Grotesk titres, Roboto body
3. Accessibilite : WCAG AAA (ratio ~7.2:1)

---
Copie aussi dans : `.claude/plans/theme-aiobi.md` (dans le repo)
