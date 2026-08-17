# Adding Sound to INVSBL WRLD

## How it works

Sound effects live in `src/assets/sounds/<trigger-name>/` — one folder per
interaction. Drop a file in the matching folder and it's wired up
automatically on the next `npm run dev` / `npm run build`. No code edits
needed.

Supported formats: `.mp3`, `.wav`, `.ogg`, `.m4a`, `.aif`/`.aiff`.

**Multiple files in one folder = random variation** by default — drop in 2–4
slightly different takes of the same effect (e.g. a few hover ticks) and a
random one plays each time, so repeated interactions don't sound identical.
Some folders instead **cycle** through their files in order (sorted by
filename) rather than picking randomly — currently just `nav/`. See
`PLAYBACK_MODE` at the top of `src/utils/sounds.js` to change which trigger
folders use which mode.

An empty folder just stays silent — same spirit as the photo gallery's
`NO SIGNAL`. Nothing breaks if a trigger has no sound yet.

## Trigger folders

| Folder             | Fires when…                                             |
|---------------------|----------------------------------------------------------|
| `title-reveal/`     | The landing title letters fade in — first page load and every return from the shop (silent on that very first load only, see Mute section) |
| `gallery-tick/`      | A gallery thumbnail crosses the midpoint while scrolling — the arc's bow point on desktop, the strip's horizontal center on mobile |
| `enter/`            | Landing → shop transition begins                        |
| `exit/`              | Shop → landing transition begins                        |
| `nav/`               | The shown item changes (arrow keys, scroll, dots, TOC)  |
| `hover/`             | Mouse enters a gallery thumbnail panel or an Archive Index menu option (desktop only) |
| `glitch-gallery/`    | A photo gallery thumbnail panel's idle CRT-glitch flicker fires |
| `glitch-text/`       | An info panel's (name/specs/cart button) idle CRT-glitch flicker fires |
| `lightbox-open/`     | The full-screen photo viewer opens                       |
| `lightbox-close/`    | The full-screen photo viewer closes                       |
| `size-select/`       | A gauge/size chip is picked                              |
| `add-to-cart/`       | ADD TO CART is clicked                                   |
| `cart-open/`         | The cart panel slides open                               |
| `cart-close/`        | The cart panel slides closed                             |
| `checkout/`          | CHECKOUT is clicked (fires right before the Square redirect) |
| `cart-qty/`          | The +/− quantity buttons on a cart line item              |
| `click/`             | Other minor controls — remove item, lightbox arrow-key nav |
| `ambient/`           | Optional looping background bed — plays continuously while the shop is open, stops on exit (see below) |

## Recommended format

- Short, compressed clips: MP3 at 128–192kbps is plenty for UI ticks.
- Keep one-shot effects brief (well under a second for things like hover/click).
- `ambient/` is the exception — it can be a longer loop; keep the loop
  seamless (no audible seam where it repeats) since it's set to `loop: true`.

## Mute

There's a speaker-icon toggle in the shop's top nav (`#soundToggle` in
`index.html`) — shows a crossed-out speaker when muted, persists across
visits via `localStorage`. Sound is also blocked until the user's first
interaction regardless of mute state,
because browsers won't allow audio to play before that; entering the shop
(click/scroll/swipe/Enter on the landing page) or toggling mute both count.

## Where the code lives

`src/utils/sounds.js` — the `SoundManager` singleton (`import { sounds }`).
Auto-loads everything above via `import.meta.glob`, decodes it once with the
Web Audio API after unlock, and exposes `sounds.play('trigger-name')` plus
`sounds.startAmbient()` / `sounds.stopAmbient()`. Trigger calls are already
wired into `main.js`, `src/scene/HUD.js`, and `src/scene/MobileShop.js` at
each interaction listed above — you shouldn't need to touch those files
unless you want to add a new trigger point that doesn't exist yet.
