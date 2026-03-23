# TODO: Replace Visio favicons with Aïobi icon

## Source
Use the Aïobi circular icon (symbol only, no wordmark). Black on transparent background.

## Files to replace

All go in `src/frontend/public/`:

| File | Size | Format |
|------|------|--------|
| `favicon.ico` | 48x48 (multi-size) | ICO |
| `favicon-16x16.png` | 16x16 | PNG |
| `favicon-32x32.png` | 32x32 | PNG |
| `apple-touch-icon.png` | 180x180 | PNG |
| `android-chrome-192x192.png` | 192x192 | PNG |
| `android-chrome-512x512.png` | 512x512 | PNG |

## How to generate

1. Start with a 512x512 PNG of the Aïobi icon
2. Go to https://realfavicongenerator.net
3. Upload the 512x512 PNG
4. Download the generated package
5. Drop all files into `src/frontend/public/`

---

# TODO: Rebrand `docker/dinum-frontend/` to Aïobi

This folder builds a custom-branded production frontend Docker image.
Currently contains DINUM/French gov assets. Do NOT rename the folder yet — swap content first.

## What to replace

| Current file | Action |
|-------------|--------|
| `dinum-styles.css` | Replace Marianne font refs with Roboto + HK Grotesk, remove `.Header-beforeLogo` gov header styles |
| `logo.svg` | Replace with Aïobi logo SVG |
| `assets/marianne.svg` | Remove |
| `assets/gouvernement.svg` | Remove |
| `assets/devise.svg` | Remove |
| `fonts/Marianne-*.woff2` (12 files) | Replace with Roboto + HK Grotesk woff2 files |
| `Dockerfile` | Update COPY lines to match new asset paths, rename folder refs |

## When
After Aïobi font + logo assets are ready. Do it all in one commit with the favicon swap above.

---

## After all replacements

Commit with:
```bash
GIT_COMMITTER_NAME="TheY4NN777" GIT_COMMITTER_EMAIL="yanisaxel.dabo@aiobi.world" \
git commit --author="TheY4NN777 <yanisaxel.dabo@aiobi.world>" -m "chore(branding) replace favicons and Docker frontend assets with Aiobi branding"
```
