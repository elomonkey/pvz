# Intermission illustration assets

Generated with the built-in `image_gen` tool using the two owner-approved results/shop concepts as references. No CLI/API fallback was used. These are static UI illustrations, not Three.js models or scene textures.

- [employee.webp](employee.webp): 512×683, alpha, 48 828 bytes. Lazily assigned to the results portrait on its first opening.
- [shop-atlas.webp](shop-atlas.webp): 1024×768, alpha, 177 146 bytes. One 4×3 atlas, addressed by CSS background-position for the five upgrades and seven existing decor items.

PNG outputs were encoded to WebP at quality 0.9 and downscaled with Chromium canvas for delivery. No content retouching, extra 3D context, shadows or postprocessing were added. Original generated PNGs remain in the generation library; the app uses only these two WebP files. [Implementation and screenshots](../../../docs/screenshots/78-intermission/REPORT.md).

## Owner review: vector icons

The approved shoe and scanner illustrations are unchanged. Three atlas slots are now replaced in CSS by small code-native SVG illustrations: [meditation.svg](meditation.svg) (seated silhouette for tolerance), [smile.svg](smile.svg) (charm), [duck.svg](duck.svg) (the yellow anti-stress toy from the game). The same icons appear beside the character stats. [wallet.svg](wallet.svg) and [coins.svg](coins.svg) add outlined currency symbols. These five SVGs were drawn directly as vector paths, not generated or edited as bitmaps. Vite inlines them into the UI stylesheet; they add no WebGL resources. The old atlas remains shared by shoes, scanner and decor.

## Final portrait prompt

Extract/recreate ONLY the smiling employee illustration from the left side of this approved game UI concept as a clean production-ready transparent PNG cutout. Same exact character identity, yellow cap, short dark faceted hair, cheerful eyes closed and wide open smiling mouth, blue work jacket with small cream badge, hands on hips, proud relieved stance, waist-up ending at hips. Same warm faceted low-poly illustration, NOT realistic. Preserve his silhouette and the cream cut-paper outline with a narrow offset burgundy backing. Portrait centered on a tall 3:4 transparent canvas, complete cap, elbows and hips visible, 5% padding, no cropping. Remove all text, identity card/plaque, boxes, background shop, interface, icons, yellow exclamation strokes, and all other objects. Transparent alpha everywhere outside the outlined character. This is an actual sprite asset for the results UI, not a new mockup. No checkerboard painted into the artwork.

Input: approved results concept; transparent_background=true.

## Final atlas prompt

Create one production-ready transparent UI ICON ATLAS for this exact cozy low-poly parcel shop game. Use the four illustrated products in this reference as the exact stylistic guide. ONE sheet, landscape 4:3 aspect ratio, exactly FOUR equal columns and THREE equal rows, 12 equal SQUARE cells. No cell borders, no labels, no text anywhere, no background. Each icon centered within its square cell with at least 12% empty transparent padding on ALL sides and no overlap into adjacent cells. Consistent orthographic 3/4 view, warm soft diffuse lighting, clean flat faceted low-poly meshes, cream/blue/wood/gold/muted-green palette, subtle small grounding shadow, crisp silhouette. Not photorealistic, no neon, no glossy effects. Icon placements MUST be EXACT as follows, read left to right:

ROW 1: (1) pair of blue-and-cream sneakers like reference, (2) golden cheerful smiling speech-bubble badge like reference, (3) blue shield with cream rim and cream check like reference, (4) small golden teddy bear with burgundy bow like reference.

ROW 2: (5) charcoal handheld barcode scanner with small red trigger, (6) seated ginger cat figurine, (7) round blue-rim clock with cream face and dark hands, (8) folded slate-blue rug with cream border.

ROW 3: (9) small green rectangular illuminated shop sign in a wooden frame with a simple cream parcel symbol, NO letters, (10) mint-green wall paint swatch and a small cream paintbrush, (11) three light honey-wood floor planks, (12) small charcoal flat-screen TV on two feet, muted blue screen with a simple warm sun shape.

All 12 are separate isolated objects on actual transparent alpha. The entire atlas must be an exact regular 4-column 3-row grid so CSS background-position can address it. No character, interface panel, price, decorative tape, fake checkerboard, grid markings, logo or additional item.

Input: approved shop concept; transparent_background=true.
