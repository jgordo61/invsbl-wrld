# Adding Jewelry to INVSBL WRLD

## Adding gallery photos

Photos live in `src/assets/photos/<piece-name>/` — one folder per piece.

1. **Create/use the folder** matching the piece's name (case, spaces, and
   punctuation don't matter — `Crescent Gradient`, `crescent-gradient`, and
   `CRESCENT_GRADIENT` all match the `CRESCENT GRADIENT` catalog item):
   ```
   src/assets/photos/
   ├── crescent-gradient/
   ├── half-crescent-gradient/
   ├── cloud-bengal/
   ├── hypercube/
   └── epsilon/
   ```
2. **Drop image files in** (`.jpg`, `.png`, `.webp`, or `.avif`), named
   `1.jpg`, `2.jpg`, `3.jpg`, etc. The leading number in the filename is the
   exact gallery slot it fills — `2.jpg` always shows in the VIEW·02 panel,
   even if `1.jpg` is missing (that slot just shows NO SIGNAL instead of
   shifting everything down).
3. That's it — `main.js` auto-loads every numbered image in a matching folder
   into that piece's gallery on the next `npm run dev` / `npm run build`. No
   code edits needed. Folders can hold anywhere from 0 to as many photos as
   you want. Files that don't start with a number are ignored.

**Recommended dimensions:** ~1600×900px landscape (16:9), under ~400KB each.
The gallery panels crop to a wide letterbox (`object-fit: cover`), and the
click-to-zoom lightbox shows the full image (`object-fit: contain`) — 16:9
crops cleanly into the panels and fits the lightbox with minimal letterboxing.

## How to add a new piece

1. **Export your 3D jewelry model** as a `.glb` file.
   - Blender: File → Export → glTF 2.0 → Format: glb, enable Draco compression
   - Recommended: ~50k–100k polygons, centered at origin, ~1m scale

2. **Drop the file** into `/public/models/`
   ```
   public/
   └── models/
       ├── aurum-ring.glb
       ├── void-pendant.glb
       └── ...
   ```

3. **Register it** in `src/main.js` in the `CATALOG` array:
   ```js
   {
     name:       'AURUM RING I',
     collection: 'INVSBL',
     price:      '$320',
     modelUrl:   '/models/aurum-ring.glb',   // ← set this
     color:      '#d4af37',                  // particle color (gold)
     colorShift: '#fff8dc'                   // color when shattered
   }
   ```

4. Run `npm run dev` and scroll through the shop to see it.

---

## Particle color guide

| Material       | `color`     | `colorShift` |
|----------------|-------------|--------------|
| 18k Yellow Gold| `#d4af37`  | `#fff8dc`    |
| Sterling Silver| `#c0c0c0`  | `#ffffff`    |
| Rose Gold      | `#b87333`  | `#ffd7b0`    |
| White Gold     | `#e8e8e8`  | `#f8f8ff`    |
| Oxidized Black | `#2e2e3a`  | `#7a7a9e`    |
| Bronze         | `#cd7f32`  | `#f5cba7`    |

---

## Proxy shapes (while you work without a GLB)

Set `modelUrl: null` and choose a `proxyType`:

| proxyType    | Looks like      |
|--------------|-----------------|
| `ring`       | Torus ring      |
| `pendant`    | Icosahedron gem |
| `necklace`   | Torus knot      |
| `bracelet`   | Wide flat torus |
| `earring`    | Octahedron      |

---

## Deployment to INVSBL.wrld

1. Build: `npm run build`
2. The `/dist` folder is your static site — deploy to any host:
   - **Netlify**: Drag `/dist` onto netlify.com/drop
   - **Vercel**: `vercel --prod` from the project root
   - **Cloudflare Pages**: Connect your repo, build command `npm run build`, output `/dist`
3. Point your `INVSBL.wrld` domain's DNS to your host's servers.
