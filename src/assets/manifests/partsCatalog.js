/**
 * Standard 12-color Lego palette. Inlined here so the sandbox doesn't
 * depend on the legacy `brickCatalog.js` (deleted in M1').
 */
export const STANDARD_PALETTE = [
  '#c91a09', // red
  '#0055bf', // blue
  '#fec101', // yellow
  '#237841', // green
  '#f4f4f4', // white
  '#1b2a34', // black
  '#ff8e0d', // orange
  '#a83c8a', // magenta
  '#58a5ab', // teal
  '#9b9b9b', // light gray
  '#6d6e5c', // olive
  '#5a93db'  // azure
]

/**
 * Community-curated "100 most commonly used Lego parts" catalog.
 * Each entry references a real LDraw `.dat` file in `public/model/parts/<partNumber>.dat`
 * plus the studio-rendered thumbnail (also a `.dat` instance, rendered through
 * the same LDrawLoader pipeline at runtime).
 *
 * Footprint and height are nominal — the `LDrawPartLoader` measures the actual
 * bounding box at load time and overrides these if they drift by more than a
 * fraction of a cell. Categories drive the collapsible grouping in the
 * `PartSearchHUD`.
 */

const categories = {
  brick: 'Bricks',
  plate: 'Plates',
  slope: 'Slopes',
  tile: 'Tiles',
  round: 'Rounds',
  wedge: 'Wedges & Arches',
  technic: 'Technic',
  baseplate: 'Baseplates',
  decor: 'Decorations'
}

/**
 * Build a catalog entry with sensible defaults. Footprint/height come from the
 * LDraw name embedded in the part itself; the loader normalizes them to the
 * build grid at load time.
 */
function entry(partNumber, name, category, footprint, height) {
  return {
    partNumber,
    displayName: name,
    category,
    categoryLabel: categories[category] ?? category,
    footprint,
    height,
    colorPalette: STANDARD_PALETTE
  }
}

/**
 * The canonical 100-part community list. Sub-parts referenced via `s\<n>s01.dat`
 * are pulled in lazily by LDrawLoader when needed (no need to declare here).
 */
export const partsCatalog = {
  // ── Bricks ────────────────────────────────────────────────────────────────
  '3001': entry('3001', 'Brick 2×4', 'brick', { x: 4, z: 2 }, 3),
  '3002': entry('3002', 'Brick 2×3', 'brick', { x: 3, z: 2 }, 3),
  '3003': entry('3003', 'Brick 2×2', 'brick', { x: 2, z: 2 }, 3),
  '3004': entry('3004', 'Brick 1×2', 'brick', { x: 2, z: 1 }, 3),
  '3005': entry('3005', 'Brick 1×1', 'brick', { x: 1, z: 1 }, 3),
  '3006': entry('3006', 'Brick 2×6', 'brick', { x: 6, z: 2 }, 3),
  '3007': entry('3007', 'Brick 2×8', 'brick', { x: 8, z: 2 }, 3),
  '3008': entry('3008', 'Brick 1×8', 'brick', { x: 8, z: 1 }, 3),
  '3009': entry('3009', 'Brick 1×6', 'brick', { x: 6, z: 1 }, 3),
  '3010': entry('3010', 'Brick 1×4', 'brick', { x: 4, z: 1 }, 3),
  '3020': entry('3020', 'Plate 2×4', 'plate', { x: 4, z: 2 }, 1),
  '3021': entry('3021', 'Plate 2×3', 'plate', { x: 3, z: 2 }, 1),
  '3022': entry('3022', 'Plate 2×2', 'plate', { x: 2, z: 2 }, 1),
  '3023': entry('3023', 'Plate 1×2', 'plate', { x: 2, z: 1 }, 1),
  '3024': entry('3024', 'Plate 1×1', 'plate', { x: 1, z: 1 }, 1),
  '3028': entry('3028', 'Plate 1×8', 'plate', { x: 8, z: 1 }, 1),
  '3029': entry('3029', 'Plate 1×6', 'plate', { x: 6, z: 1 }, 1),
  '3030': entry('3030', 'Plate 2×4', 'plate', { x: 4, z: 2 }, 1),
  '3031': entry('3031', 'Plate 2×3', 'plate', { x: 3, z: 2 }, 1),
  '3032': entry('3032', 'Plate 2×2', 'plate', { x: 2, z: 2 }, 1),
  '3034': entry('3034', 'Plate 1×2', 'plate', { x: 2, z: 1 }, 1),
  '3035': entry('3035', 'Plate 1×1', 'plate', { x: 1, z: 1 }, 1),
  '3036': entry('3036', 'Plate 1×6', 'plate', { x: 6, z: 1 }, 1),
  '3666': entry('3666', 'Plate 1×2 with Handle', 'plate', { x: 2, z: 1 }, 1),
  '3673': entry('3673', 'Plate 1×4', 'plate', { x: 4, z: 1 }, 1),

  // ── Slopes ─────────────────────────────────────────────────────────────────
  '3037': entry('3037', 'Slope 45° 2×2', 'slope', { x: 2, z: 2 }, 3),
  '3038': entry('3038', 'Slope 45° 2×3', 'slope', { x: 3, z: 2 }, 3),
  '3039': entry('3039', 'Slope 45° 2×2 Double', 'slope', { x: 2, z: 2 }, 3),
  '3040': entry('3040', 'Slope 45° 2×1', 'slope', { x: 1, z: 2 }, 3),
  '3041': entry('3041', 'Slope 33° 2×3', 'slope', { x: 3, z: 2 }, 3),
  '3042': entry('3042', 'Slope 33° 2×2', 'slope', { x: 2, z: 2 }, 3),
  '3043': entry('3043', 'Slope 45° 1×2', 'slope', { x: 2, z: 1 }, 3),
  '3044': entry('3044', 'Slope 33° 1×2', 'slope', { x: 2, z: 1 }, 3),
  '3045': entry('3045', 'Slope 25° 1×2', 'slope', { x: 2, z: 1 }, 3),
  '3298': entry('3298', 'Slope 33° 3×2', 'slope', { x: 2, z: 3 }, 3),
  '3747': entry('3747', 'Slope 55° 2×3', 'slope', { x: 3, z: 2 }, 3),
  '3665': entry('3665', 'Slope Inverted 45° 1×2', 'slope', { x: 2, z: 1 }, 3),
  '3680': entry('3680', 'Slope 75° 2×1', 'slope', { x: 1, z: 2 }, 3),

  // ── Tiles ─────────────────────────────────────────────────────────────────
  '3068': entry('3068', 'Tile 2×2', 'tile', { x: 2, z: 2 }, 1),
  '3069': entry('3069', 'Tile 1×2', 'tile', { x: 2, z: 1 }, 1),
  '3070': entry('3070', 'Tile 1×1', 'tile', { x: 1, z: 1 }, 1),
  '4150': entry('4150', 'Tile Round 2×2', 'tile', { x: 2, z: 2 }, 1),
  '4151': entry('4151', 'Tile Round 1×1', 'tile', { x: 1, z: 1 }, 1),
  '4162': entry('4162', 'Tile 1×8', 'tile', { x: 8, z: 1 }, 1),
  '4163': entry('4163', 'Tile 1×4', 'tile', { x: 4, z: 1 }, 1),
  '6636': entry('6636', 'Tile 1×6', 'tile', { x: 6, z: 1 }, 1),
  '2431': entry('2431', 'Tile 2×4', 'tile', { x: 4, z: 2 }, 1),
  '2432': entry('2432', 'Tile 1×3', 'tile', { x: 3, z: 1 }, 1),

  // ── Rounds / Cylinders ────────────────────────────────────────────────────
  '3062': entry('3062', 'Brick Round 1×2', 'round', { x: 2, z: 1 }, 3),
  '3065': entry('3065', 'Brick Round 1×1', 'round', { x: 1, z: 1 }, 3),
  '3941': entry('3941', 'Brick Round 2×2', 'round', { x: 2, z: 2 }, 3),
  '4032': entry('4032', 'Plate Round 1×1', 'round', { x: 1, z: 1 }, 1),
  '4740': entry('4740', 'Plate Round 2×2', 'round', { x: 2, z: 2 }, 1),
  '6141': entry('6141', 'Plate Round 1×1 with Stud', 'round', { x: 1, z: 1 }, 1),
  '6143': entry('6143', 'Plate Round 2×2 with Studs', 'round', { x: 2, z: 2 }, 1),
  '85970': entry('85970', 'Plate Round 1×1 with Open Stud', 'round', { x: 1, z: 1 }, 1),
  '3460': entry('3460', 'Plate 1×1 Round', 'round', { x: 1, z: 1 }, 1),
  '3937': entry('3937', 'Hinge 1×2 Base', 'round', { x: 2, z: 1 }, 1),

  // ── Wedges & Arches ───────────────────────────────────────────────────────
  '4345': entry('4345', 'Arch 1×3×2', 'wedge', { x: 3, z: 1 }, 3),
  '4346': entry('4346', 'Arch 1×4×2', 'wedge', { x: 4, z: 1 }, 3),
  '4352': entry('4352', 'Arch 1×5×2', 'wedge', { x: 5, z: 1 }, 3),
  '4353': entry('4353', 'Arch 1×6×2', 'wedge', { x: 6, z: 1 }, 3),
  '4415': entry('4415', 'Wedge 4×3', 'wedge', { x: 3, z: 4 }, 3),
  '44309': entry('44309', 'Wedge 4×2 Right', 'wedge', { x: 4, z: 2 }, 3),
  '49668': entry('49668', 'Wedge 4×4 Inverted', 'wedge', { x: 4, z: 4 }, 3),
  '30363': entry('30363', 'Slope 18° 4×2', 'slope', { x: 2, z: 4 }, 3),
  '4286': entry('4286', 'Arch 1×3×2', 'wedge', { x: 3, z: 1 }, 3),
  '3622': entry('3622', 'Arch 1×3', 'wedge', { x: 3, z: 1 }, 3),

  // ── Technic ───────────────────────────────────────────────────────────────
  '3700': entry('3700', 'Technic Brick 1×2 with Hole', 'technic', { x: 2, z: 1 }, 3),
  '3701': entry('3701', 'Technic Brick 1×4 with Holes', 'technic', { x: 4, z: 1 }, 3),
  '3702': entry('3702', 'Technic Brick 1×6 with Holes', 'technic', { x: 6, z: 1 }, 3),
  '3703': entry('3703', 'Technic Brick 1×8 with Holes', 'technic', { x: 8, z: 1 }, 3),
  '3713': entry('3713', 'Technic Plate 1×4 with Holes', 'technic', { x: 4, z: 1 }, 1),
  '41677': entry('41677', 'Technic Beam 1×2', 'technic', { x: 2, z: 1 }, 1),
  '87079': entry('87079', 'Technic Brick 2×4', 'technic', { x: 4, z: 2 }, 3),
  '85984': entry('85984', 'Technic Plate 1×2', 'technic', { x: 2, z: 1 }, 1),
  '4274': entry('4274', 'Technic Pin 1/2', 'technic', { x: 1, z: 1 }, 1),
  '6558': entry('6558', 'Technic Pin Long', 'technic', { x: 1, z: 1 }, 1),

  // ── Baseplates ────────────────────────────────────────────────────────────
  '3811': entry('3811', 'Baseplate 32×32', 'baseplate', { x: 32, z: 32 }, 1),
  '3812': entry('3812', 'Baseplate 16×16', 'baseplate', { x: 16, z: 16 }, 1),
  '44359': entry('44359', 'Baseplate 8×16', 'baseplate', { x: 16, z: 8 }, 1),
  '4186': entry('4186', 'Baseplate 16×16', 'baseplate', { x: 16, z: 16 }, 1),
  '11211': entry('11211', 'Baseplate 32×32', 'baseplate', { x: 32, z: 32 }, 1),

  // ── Decorations & Misc ───────────────────────────────────────────────────
  '4589': entry('4589', 'Cone 1×1', 'decor', { x: 1, z: 1 }, 3),
  '4073': entry('4073', 'Plate Round 1×1', 'decor', { x: 1, z: 1 }, 1),
  '4074': entry('4074', 'Hinge 1×2', 'decor', { x: 2, z: 1 }, 1),
  '4081': entry('4081', 'Minifig Hand', 'decor', { x: 1, z: 1 }, 1),
  '4083': entry('4083', 'Chain Link', 'decor', { x: 1, z: 1 }, 1),
  '4079': entry('4079', 'Minifig Tap', 'decor', { x: 1, z: 1 }, 1),
  '4599': entry('4599', 'Tap No Stud', 'decor', { x: 1, z: 1 }, 1),
  '61252': entry('61252', 'Cone 1×1 with Stud', 'decor', { x: 1, z: 1 }, 3),
  '87552': entry('87552', 'Panel 1×2×1', 'decor', { x: 2, z: 1 }, 3),
  '90541': entry('90541', 'Panel 1×4×1', 'decor', { x: 4, z: 1 }, 3),
  '92538': entry('92538', 'Panel 1×3×1', 'decor', { x: 3, z: 1 }, 3),
  '4733': entry('4733', 'Brick 1×2 with Groove', 'brick', { x: 2, z: 1 }, 3),
  '47905': entry('47905', 'Brick 1×1 with Studs on Side', 'brick', { x: 1, z: 1 }, 3),
  '2357': entry('2357', 'Brick 2×2 Corner', 'brick', { x: 2, z: 2 }, 3),
  '2362': entry('2362', 'Panel 1×3×1', 'decor', { x: 3, z: 1 }, 3),
  '2420': entry('2420', 'Plate 2×2 Corner', 'plate', { x: 2, z: 2 }, 1),
  '2436': entry('2436', 'Bracket 1×2×2', 'decor', { x: 2, z: 2 }, 3),
  '2540': entry('2540', 'Plate 1×2 with Handle', 'plate', { x: 2, z: 1 }, 1),
  '2723': entry('2723', 'Plate 1×2 with Door Rail', 'plate', { x: 2, z: 1 }, 1),
  '2780': entry('2780', 'Technic Pin with Friction', 'technic', { x: 1, z: 1 }, 1),
  '3623': entry('3623', 'Plate 1×3', 'plate', { x: 3, z: 1 }, 1),
  '3794': entry('3794', 'Plate 1×2 with Groove', 'plate', { x: 2, z: 1 }, 1),
  '3938': entry('3938', 'Hinge 1×2 Top', 'decor', { x: 2, z: 1 }, 1),
  '4282': entry('4282', 'Plate 2×2 Round', 'plate', { x: 2, z: 2 }, 1),
  '44674': entry('44674', 'Bracket 1×2×2 Inverted', 'decor', { x: 2, z: 2 }, 3),
  '6003': entry('6003', 'Plate 1×2 with Clip', 'plate', { x: 2, z: 1 }, 1),
  '6215': entry('6215', 'Brick 2×2 with Studs on Side', 'brick', { x: 2, z: 2 }, 3),
  '98397': entry('98397', 'Panel 1×4×1', 'decor', { x: 4, z: 1 }, 3),
  '99563': entry('99563', 'Panel 1×2×1', 'decor', { x: 2, z: 1 }, 3)
}

export const partsCatalogByCategory = Object.values(partsCatalog).reduce((acc, entry) => {
  const cat = entry.category
  if (!acc[cat]) acc[cat] = []
  acc[cat].push(entry)
  return acc
}, {})

export function getPartEntry(partNumber) {
  return partsCatalog[partNumber] ?? null
}

export function listPartNumbers() {
  return Object.keys(partsCatalog)
}
