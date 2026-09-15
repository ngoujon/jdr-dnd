/**
 * Genere les ressources graphiques livrees avec l'application (SVG, sans
 * dependance externe) : pions de classe, cadres de portrait et cartes de base.
 * Execute au build de l'image puis référence en base par le seed.
 */
import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.join(process.cwd(), 'builtin');

/** Silhouettes dessinees dans une boite 100x100 centree. */
export const GLYPHS = {
  sword: 'M50 12 L57 26 L57 60 L62 60 L62 66 L53 66 L53 86 L47 86 L47 66 L38 66 L38 60 L43 60 L43 26 Z',
  shield: 'M50 14 L80 24 V50 C80 68 66 80 50 88 C34 80 20 68 20 50 V24 Z',
  bow: 'M34 16 C60 30 60 70 34 84 M34 16 L34 84 M34 50 L74 50 M68 44 L78 50 L68 56',
  staff: 'M44 88 L58 20 M51 12 L55 22 L65 24 L57 31 L59 41 L51 36 L43 41 L45 31 L37 24 L47 22 Z',
  skull: 'M50 16 C68 16 80 29 80 46 C80 56 74 62 70 66 L70 78 L30 78 L30 66 C26 62 20 56 20 46 C20 29 32 16 50 16 Z M38 44 a7 8 0 1 0 0.1 0 M62 44 a7 8 0 1 0 0.1 0 M46 62 h8',
  claw: 'M30 18 C36 40 38 62 34 84 M50 14 C56 38 58 62 54 86 M70 18 C76 40 78 62 74 84',
  crown: 'M20 70 L26 32 L38 50 L50 24 L62 50 L74 32 L80 70 Z M20 74 H80 V82 H20 Z',
  flame: 'M50 12 C62 32 76 40 70 60 C66 76 58 86 50 88 C42 86 34 76 30 60 C24 40 38 32 50 12 Z M50 46 C56 58 58 66 50 76 C42 66 44 58 50 46 Z',
  eye: 'M12 50 C28 26 72 26 88 50 C72 74 28 74 12 50 Z M50 36 a14 14 0 1 0 0.1 0 M50 44 a6 6 0 1 0 0.1 0',
  horns: 'M22 20 C18 44 28 62 46 70 M78 20 C82 44 72 62 54 70 M46 70 h8 M34 78 a16 10 0 0 0 32 0',
  harp: 'M32 84 C32 46 44 22 70 16 M32 84 H72 M44 76 V34 M54 74 V28 M64 72 V22',
  potion: 'M42 14 H58 V30 L70 60 C74 76 64 88 50 88 C36 88 26 76 30 60 Z M32 58 H68',
  boot: 'M36 14 H52 V56 L78 66 C86 70 86 82 76 84 H36 C30 84 28 80 28 74 V22 Z',
  book: 'M22 20 C34 14 44 16 50 22 C56 16 66 14 78 20 V80 C66 74 56 76 50 82 C44 76 34 74 22 80 Z M50 22 V82',
  dragon: 'M14 62 C28 40 44 34 58 38 L74 22 L72 40 L86 46 L70 54 C68 74 52 86 34 84 C40 74 38 68 30 68 Z M62 44 a4 4 0 1 0 0.1 0',
  wolf: 'M24 28 L34 48 C42 40 58 40 66 48 L76 28 L78 52 C78 72 66 84 50 84 C34 84 22 72 22 52 Z M40 56 a4 4 0 1 0 0.1 0 M60 56 a4 4 0 1 0 0.1 0 M50 68 l-6 6 h12 Z',
};

export const CLASS_TOKENS = [
  { key: 'guerrier', label: 'Guerrier', glyph: 'sword', color: '#b5443a', tags: ['classe', 'guerrier'] },
  { key: 'paladin', label: 'Paladin', glyph: 'shield', color: '#d9a441', tags: ['classe', 'paladin'] },
  { key: 'rodeur', label: 'Rôdeur', glyph: 'bow', color: '#4f8a52', tags: ['classe', 'rodeur'] },
  { key: 'magicien', label: 'Magicien', glyph: 'staff', color: '#4a6fbd', tags: ['classe', 'magicien'] },
  { key: 'occultiste', label: 'Occultiste', glyph: 'flame', color: '#8a4fbd', tags: ['classe', 'occultiste'] },
  { key: 'clerc', label: 'Clerc', glyph: 'crown', color: '#c9c06a', tags: ['classe', 'clerc'] },
  { key: 'roublard', label: 'Roublard', glyph: 'boot', color: '#5c6470', tags: ['classe', 'roublard'] },
  { key: 'barde', label: 'Barde', glyph: 'harp', color: '#c56ba0', tags: ['classe', 'barde'] },
  { key: 'moine', label: 'Moine', glyph: 'horns', color: '#c47a3f', tags: ['classe', 'moine'] },
  { key: 'druide', label: 'Druide', glyph: 'wolf', color: '#3f7f6f', tags: ['classe', 'druide'] },
  { key: 'barbare', label: 'Barbare', glyph: 'claw', color: '#8c3b2a', tags: ['classe', 'barbare'] },
  { key: 'ensorceleur', label: 'Ensorceleur', glyph: 'eye', color: '#b03b6a', tags: ['classe', 'ensorceleur'] },
  { key: 'alchimiste', label: 'Alchimiste', glyph: 'potion', color: '#3f8f8a', tags: ['classe', 'artificier'] },
  { key: 'erudit', label: 'Érudit', glyph: 'book', color: '#7a6a50', tags: ['pnj', 'erudit'] },
  { key: 'mort-vivant', label: 'Mort-vivant', glyph: 'skull', color: '#6f7d84', tags: ['monstre', 'mort-vivant'] },
  { key: 'dragon', label: 'Dragon', glyph: 'dragon', color: '#a33b2f', tags: ['monstre', 'dragon'] },
];

const shade = (hex, amount) => {
  const n = parseInt(hex.slice(1), 16);
  const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)));
  const r = clamp(((n >> 16) & 255) * amount);
  const g = clamp(((n >> 8) & 255) * amount);
  const b = clamp((n & 255) * amount);
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
};

export const tokenSvg = ({ glyph, color, ring = '#e8d9b5' }) => {
  const d = GLYPHS[glyph] ?? GLYPHS.sword;
  const stroked = ['bow', 'claw', 'horns', 'harp'].includes(glyph);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="120" height="120">
  <defs>
    <radialGradient id="bg" cx="38%" cy="32%" r="78%">
      <stop offset="0%" stop-color="${shade(color, 1.45)}"/>
      <stop offset="60%" stop-color="${color}"/>
      <stop offset="100%" stop-color="${shade(color, 0.45)}"/>
    </radialGradient>
    <linearGradient id="ring" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${ring}"/>
      <stop offset="100%" stop-color="${shade(ring, 0.6)}"/>
    </linearGradient>
  </defs>
  <circle cx="60" cy="60" r="56" fill="url(#bg)"/>
  <circle cx="60" cy="60" r="56" fill="none" stroke="url(#ring)" stroke-width="6"/>
  <circle cx="60" cy="60" r="48" fill="none" stroke="${shade(color, 0.35)}" stroke-width="2" opacity="0.7"/>
  <g transform="translate(10,10)" fill="${stroked ? 'none' : shade(ring, 1.08)}" stroke="${shade(ring, 1.08)}" stroke-width="${stroked ? 6 : 2}" stroke-linecap="round" stroke-linejoin="round" opacity="0.95">
    <path d="${d}"/>
  </g>
</svg>`;
};

export const FRAMES = [
  { key: 'or', label: 'Cadre doré', color: '#d9a441' },
  { key: 'argent', label: 'Cadre argent', color: '#c3ccd6' },
  { key: 'sang', label: 'Cadre de sang', color: '#a33b2f' },
  { key: 'foret', label: 'Cadre sylvestre', color: '#4f8a52' },
  { key: 'arcane', label: 'Cadre arcanique', color: '#7a5fd0' },
];

const frameSvg = ({ color }) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="200" height="200">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${shade(color, 1.4)}"/>
      <stop offset="50%" stop-color="${color}"/>
      <stop offset="100%" stop-color="${shade(color, 0.55)}"/>
    </linearGradient>
  </defs>
  <rect x="6" y="6" width="188" height="188" rx="14" fill="none" stroke="url(#g)" stroke-width="10"/>
  <rect x="18" y="18" width="164" height="164" rx="8" fill="none" stroke="${shade(color, 0.5)}" stroke-width="2"/>
  ${[[18, 18], [182, 18], [18, 182], [182, 182]]
    .map(([x, y]) => `<circle cx="${x}" cy="${y}" r="9" fill="url(#g)" stroke="${shade(color, 0.4)}" stroke-width="2"/>`)
    .join('\n  ')}
</svg>`;

/** Fond de carte stylise : sol texture, murs, decor. */
const mapSvg = ({ w = 1680, h = 1120, floor, wall, accent, decor }) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">
  <defs>
    <pattern id="tile" width="70" height="70" patternUnits="userSpaceOnUse">
      <rect width="70" height="70" fill="${floor}"/>
      <rect width="70" height="70" fill="none" stroke="${shade(floor, 0.82)}" stroke-width="2"/>
      <circle cx="18" cy="24" r="3" fill="${shade(floor, 0.9)}"/>
      <circle cx="52" cy="48" r="2" fill="${shade(floor, 1.08)}"/>
      <path d="M8 58 L26 62" stroke="${shade(floor, 0.88)}" stroke-width="2"/>
    </pattern>
    <radialGradient id="vignette" cx="50%" cy="50%" r="72%">
      <stop offset="60%" stop-color="#000" stop-opacity="0"/>
      <stop offset="100%" stop-color="#000" stop-opacity="0.45"/>
    </radialGradient>
  </defs>
  <rect width="${w}" height="${h}" fill="${shade(wall, 0.7)}"/>
  <rect x="70" y="70" width="${w - 140}" height="${h - 140}" fill="url(#tile)"/>
  <rect x="70" y="70" width="${w - 140}" height="${h - 140}" fill="none" stroke="${wall}" stroke-width="24"/>
  ${decor}
  <rect width="${w}" height="${h}" fill="url(#vignette)"/>
</svg>`;

export const MAPS = [
  {
    key: 'salle-gardes',
    label: 'Salle des gardes',
    tags: ['donjon', 'intérieur'],
    svg: mapSvg({
      floor: '#6b6157',
      wall: '#3a3229',
      accent: '#c0873f',
      decor: `
  <rect x="180" y="180" width="300" height="160" rx="8" fill="#4a3c2c" stroke="#2b221a" stroke-width="6"/>
  <rect x="1200" y="180" width="300" height="160" rx="8" fill="#4a3c2c" stroke="#2b221a" stroke-width="6"/>
  <rect x="740" y="480" width="200" height="200" rx="12" fill="#5b4a36" stroke="#2b221a" stroke-width="8"/>
  <circle cx="840" cy="580" r="54" fill="#c0873f" opacity="0.35"/>
  <rect x="180" y="820" width="1320" height="120" rx="10" fill="#514639" stroke="#2b221a" stroke-width="6"/>
  ${[300, 560, 1120, 1380].map((x) => `<circle cx="${x}" cy="700" r="26" fill="#3a3229" stroke="#241d17" stroke-width="6"/>`).join('')}`,
    }),
  },
  {
    key: 'clairiere',
    label: 'Clairière sylvestre',
    tags: ['extérieur', 'foret'],
    svg: mapSvg({
      floor: '#4e6b41',
      wall: '#25381f',
      accent: '#8fb46a',
      decor: `
  <ellipse cx="840" cy="560" rx="430" ry="330" fill="#5d7a4a" opacity="0.85"/>
  <ellipse cx="520" cy="820" rx="190" ry="120" fill="#3f6b8a" opacity="0.8"/>
  ${[[260, 260], [420, 200], [1350, 300], [1420, 760], [300, 900], [1180, 940], [700, 190], [980, 210]]
    .map(([x, y]) => `<g><circle cx="${x}" cy="${y}" r="78" fill="#2f4a28"/><circle cx="${x - 16}" cy="${y - 18}" r="52" fill="#3e6234"/></g>`)
    .join('')}
  ${[[760, 520], [900, 640], [820, 700]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="22" fill="#6d6155"/>`).join('')}`,
    }),
  },
  {
    key: 'taverne',
    label: 'Taverne du Sanglier',
    tags: ['intérieur', 'ville'],
    svg: mapSvg({
      floor: '#7a5a3c',
      wall: '#3d2a1b',
      accent: '#d9a441',
      decor: `
  <rect x="140" y="140" width="520" height="90" rx="10" fill="#5b3f28" stroke="#2d1e12" stroke-width="6"/>
  ${[[300, 420], [600, 420], [900, 420], [1200, 420], [300, 760], [600, 760], [900, 760], [1200, 760]]
    .map(([x, y]) => `<g><circle cx="${x}" cy="${y}" r="70" fill="#6b4a30" stroke="#33220f" stroke-width="6"/>
      ${[0, 90, 180, 270].map((a) => {
        const rad = (a * Math.PI) / 180;
        return `<circle cx="${(x + Math.cos(rad) * 98).toFixed(0)}" cy="${(y + Math.sin(rad) * 98).toFixed(0)}" r="18" fill="#4f3823"/>`;
      }).join('')}</g>`)
    .join('')}
  <rect x="1380" y="140" width="150" height="840" rx="10" fill="#523622" stroke="#2d1e12" stroke-width="6"/>
  <circle cx="840" cy="130" r="40" fill="#d9a441" opacity="0.4"/>`,
    }),
  },
  {
    key: 'caverne',
    label: 'Caverne humide',
    tags: ['donjon', 'souterrain'],
    svg: mapSvg({
      floor: '#4a4a55',
      wall: '#1f1f27',
      accent: '#6fa8c9',
      decor: `
  <path d="M170 420 C400 260 700 300 900 220 C1180 120 1420 260 1520 420 C1560 640 1420 900 1150 980 C860 1060 520 1010 300 880 C160 800 120 600 170 420 Z" fill="#5a5a68"/>
  <ellipse cx="1150" cy="760" rx="240" ry="150" fill="#2f5d73" opacity="0.85"/>
  ${[[420, 520], [520, 640], [980, 460], [1300, 520], [700, 860], [820, 380]]
    .map(([x, y]) => `<polygon points="${x},${y - 46} ${x + 26},${y + 30} ${x - 26},${y + 30}" fill="#3b3b47" stroke="#26262e" stroke-width="4"/>`)
    .join('')}`,
    }),
  },
  {
    key: 'grille-vierge',
    label: 'Grille vierge',
    tags: ['neutre'],
    svg: mapSvg({ floor: '#2a3140', wall: '#1a2029', accent: '#c0873f', decor: '' }),
  },
];

export const generateBuiltins = async () => {
  await fs.mkdir(path.join(ROOT, 'tokens'), { recursive: true });
  await fs.mkdir(path.join(ROOT, 'frames'), { recursive: true });
  await fs.mkdir(path.join(ROOT, 'maps'), { recursive: true });

  const created = [];
  for (const token of CLASS_TOKENS) {
    const file = `tokens/${token.key}.svg`;
    await fs.writeFile(path.join(ROOT, file), tokenSvg(token));
    created.push({ name: `Pion — ${token.label}`, url: `/builtin/${file}`, kind: 'TOKEN', tags: token.tags });
  }
  for (const frame of FRAMES) {
    const file = `frames/${frame.key}.svg`;
    await fs.writeFile(path.join(ROOT, file), frameSvg(frame));
    created.push({ name: frame.label, url: `/builtin/${file}`, kind: 'PORTRAIT', tags: ['cadre'] });
  }
  for (const map of MAPS) {
    const file = `maps/${map.key}.svg`;
    await fs.writeFile(path.join(ROOT, file), map.svg);
    created.push({ name: `Carte — ${map.label}`, url: `/builtin/${file}`, kind: 'MAP', tags: map.tags, width: 1680, height: 1120 });
  }
  return created;
};

if (import.meta.url === `file://${process.argv[1]}`) {
  generateBuiltins().then((items) => console.log(`${items.length} ressources generees`));
}
