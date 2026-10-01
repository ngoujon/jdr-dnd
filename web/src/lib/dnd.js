/** Données de référence D&D 5e, libellées en français. */

export const ABILITIES = [
  { key: 'str', label: 'Force', short: 'FOR' },
  { key: 'dex', label: 'Dextérité', short: 'DEX' },
  { key: 'con', label: 'Constitution', short: 'CON' },
  { key: 'int', label: 'Intelligence', short: 'INT' },
  { key: 'wis', label: 'Sagesse', short: 'SAG' },
  { key: 'cha', label: 'Charisme', short: 'CHA' },
];

export const SKILLS = [
  { key: 'acrobatics', label: 'Acrobaties', ability: 'dex' },
  { key: 'animalHandling', label: 'Dressage', ability: 'wis' },
  { key: 'arcana', label: 'Arcanes', ability: 'int' },
  { key: 'athletics', label: 'Athlétisme', ability: 'str' },
  { key: 'deception', label: 'Tromperie', ability: 'cha' },
  { key: 'history', label: 'Histoire', ability: 'int' },
  { key: 'insight', label: 'Perspicacité', ability: 'wis' },
  { key: 'intimidation', label: 'Intimidation', ability: 'cha' },
  { key: 'investigation', label: 'Investigation', ability: 'int' },
  { key: 'medicine', label: 'Médecine', ability: 'wis' },
  { key: 'nature', label: 'Nature', ability: 'int' },
  { key: 'perception', label: 'Perception', ability: 'wis' },
  { key: 'performance', label: 'Représentation', ability: 'cha' },
  { key: 'persuasion', label: 'Persuasion', ability: 'cha' },
  { key: 'religion', label: 'Religion', ability: 'int' },
  { key: 'sleightOfHand', label: 'Escamotage', ability: 'dex' },
  { key: 'stealth', label: 'Discretion', ability: 'dex' },
  { key: 'survival', label: 'Survie', ability: 'wis' },
];

export const CLASSES = [
  'Barbare', 'Barde', 'Clerc', 'Druide', 'Ensorceleur', 'Guerrier', 'Magicien',
  'Moine', 'Paladin', 'Rôdeur', 'Roublard', 'Occultiste', 'Artificier',
];

export const RACES = [
  'Humain', 'Elfe', 'Demi-elfe', 'Nain', 'Halfelin', 'Gnome', 'Demi-orc',
  'Drakéide', 'Tieffelin', 'Aasimar', 'Genasi', 'Tabaxi', 'Gobelin',
];

/**
 * Sous-races, d'apres les regles 2014 (Manuel des joueurs, puis Volo et
 * Elementary Evil pour les races ajoutees ensuite).
 *
 * Toutes les races n'en ont pas : demi-elfe, demi-orc, tieffelin et tabaxi se
 * jouent sans sous-race dans cette edition. Une race absente de cette table est
 * donc traitee comme n'ayant pas de choix a faire, et non comme une omission.
 *
 * Le drakeide choisit une ascendance draconique plutot qu'une sous-race : elle
 * se presente au meme endroit puisqu'elle se choisit au meme moment et
 * determine de la meme facon le type de degats du souffle.
 */
export const SUBRACES = {
  Nain: ['Nain des collines', 'Nain des montagnes'],
  Elfe: ['Haut-elfe', 'Elfe des bois', 'Elfe noir (drow)'],
  Halfelin: ['Pieds-légers', 'Robuste'],
  Gnome: ['Gnome des forêts', 'Gnome des roches'],
  Humain: ['Humain', 'Humain (variante)'],
  Drakéide: [
    'Ascendance airain (feu)', 'Ascendance argent (froid)', 'Ascendance blanc (froid)',
    'Ascendance bleu (foudre)', 'Ascendance bronze (foudre)', 'Ascendance cuivre (acide)',
    'Ascendance noir (acide)', 'Ascendance or (feu)', 'Ascendance rouge (feu)',
    'Ascendance vert (poison)',
  ],
  Aasimar: ['Aasimar protecteur', 'Aasimar fossoyeur', 'Aasimar justicier'],
  Genasi: ['Genasi de l\'air', 'Genasi de la terre', 'Genasi du feu', 'Genasi de l\'eau'],
  Gobelin: [],
  'Demi-elfe': [],
  'Demi-orc': [],
  Tieffelin: [],
  Tabaxi: [],
};

export const BACKGROUNDS = [
  'Acolyte', 'Artisan de guilde', 'Charlatan', 'Criminel', 'Ermite', 'Enfant des rues',
  'Héros du peuple', 'Marin', 'Ménestrel', 'Noble', 'Sage', 'Soldat', 'Sauvageon',
];

export const ALIGNMENTS = [
  'Loyal Bon', 'Neutre Bon', 'Chaotique Bon',
  'Loyal Neutre', 'Neutre Strict', 'Chaotique Neutre',
  'Loyal Mauvais', 'Neutre Mauvais', 'Chaotique Mauvais',
];

/** Etats prejudiciables, avec un pictogramme et une couleur pour les pions. */
export const CONDITIONS = [
  { key: 'blinded', label: 'Aveugle', icon: '◍', color: '#6b7688' },
  { key: 'charmed', label: 'Charmé', icon: '♥\ufe0e', color: '#c56ba0' },
  { key: 'deafened', label: 'Assourdi', icon: '◑', color: '#7a6a50' },
  { key: 'frightened', label: 'Effrayé', icon: '☾\ufe0e', color: '#7a5fd0' },
  { key: 'grappled', label: 'Agrippé', icon: '⊗', color: '#8a5f2b' },
  { key: 'incapacitated', label: 'Neutralisé', icon: '✖', color: '#b5443a' },
  { key: 'invisible', label: 'Invisible', icon: '◌', color: '#4a6fbd' },
  { key: 'paralyzed', label: 'Paralysé', icon: '⚡\ufe0e', color: '#d9a441' },
  { key: 'petrified', label: 'Pétrifié', icon: '▲', color: '#5c6470' },
  { key: 'poisoned', label: 'Empoisonné', icon: '☣\ufe0e', color: '#4f8a52' },
  { key: 'prone', label: 'À terre', icon: '▼', color: '#8a7f6a' },
  { key: 'restrained', label: 'Entravé', icon: '≡', color: '#6f7d84' },
  { key: 'stunned', label: 'Étourdi', icon: '✷', color: '#d9a441' },
  { key: 'unconscious', label: 'Inconscient', icon: '☠\ufe0e', color: '#b5443a' },
  { key: 'concentration', label: 'Concentration', icon: '◈', color: '#7a5fd0' },
  { key: 'blessed', label: 'Béni', icon: '✦', color: '#e0a75c' },
];

export const DAMAGE_TYPES = [
  'Tranchant', 'Perforant', 'Contondant', 'Feu', 'Froid', 'Acide', 'Poison',
  'Foudre', 'Tonnerre', 'Nécrotique', 'Radiant', 'Force', 'Psychique',
];

/** Tailles de pion exprimees en cases de grille. */
export const TOKEN_SIZES = [
  { key: 'tiny', label: 'Très petite', squares: 0.5 },
  { key: 'small', label: 'Petite', squares: 1 },
  { key: 'medium', label: 'Moyenne', squares: 1 },
  { key: 'large', label: 'Grande', squares: 2 },
  { key: 'huge', label: 'Très grande', squares: 3 },
  { key: 'gargantuan', label: 'Gigantesque', squares: 4 },
];

export const XP_THRESHOLDS = [
  0, 300, 900, 2700, 6500, 14000, 23000, 34000, 48000, 64000,
  85000, 100000, 120000, 140000, 165000, 195000, 225000, 265000, 305000, 355000,
];

export const modifier = (score) => Math.floor((Number(score || 10) - 10) / 2);
export const proficiencyBonus = (level) => 2 + Math.floor((Math.max(1, Number(level || 1)) - 1) / 4);
export const signed = (value) => (value >= 0 ? `+${value}` : `${value}`);

export const levelFromXp = (xp) => {
  let level = 1;
  for (let i = 0; i < XP_THRESHOLDS.length; i += 1) if (xp >= XP_THRESHOLDS[i]) level = i + 1;
  return level;
};

export const copyToClipboard = async (text) => {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // API présente mais refusée (hors contexte sécurisé, permission…) : on tente le repli.
    }
  }
  const el = document.createElement('textarea');
  el.value = text;
  el.style.position = 'fixed';
  el.style.opacity = '0';
  document.body.appendChild(el);
  el.focus();
  el.select();
  let ok = false;
  try {
    ok = document.execCommand('copy');
  } catch {
    ok = false;
  }
  document.body.removeChild(el);
  return ok;
};

/** Modeles de personnage pour demarrer une fiche en un clic. */
export const TEMPLATES = {
  Guerrier: { hitDice: '1d10', ac: 16, abilities: { str: 16, dex: 13, con: 15, int: 10, wis: 12, cha: 8 }, saves: ['str', 'con'], skills: ['athletics', 'perception'] },
  Magicien: { hitDice: '1d6', ac: 12, abilities: { str: 8, dex: 14, con: 13, int: 16, wis: 12, cha: 10 }, saves: ['int', 'wis'], skills: ['arcana', 'investigation'] },
  Roublard: { hitDice: '1d8', ac: 14, abilities: { str: 10, dex: 16, con: 13, int: 14, wis: 12, cha: 8 }, saves: ['dex', 'int'], skills: ['stealth', 'sleightOfHand', 'perception', 'deception'] },
  Clerc: { hitDice: '1d8', ac: 16, abilities: { str: 13, dex: 10, con: 14, int: 10, wis: 16, cha: 12 }, saves: ['wis', 'cha'], skills: ['medicine', 'religion'] },
  Rodeur: { hitDice: '1d10', ac: 15, abilities: { str: 12, dex: 16, con: 14, int: 10, wis: 14, cha: 8 }, saves: ['str', 'dex'], skills: ['survival', 'stealth', 'nature'] },
  Barde: { hitDice: '1d8', ac: 13, abilities: { str: 8, dex: 14, con: 13, int: 12, wis: 10, cha: 16 }, saves: ['dex', 'cha'], skills: ['performance', 'persuasion', 'deception'] },
  Barbare: { hitDice: '1d12', ac: 14, abilities: { str: 16, dex: 14, con: 16, int: 8, wis: 12, cha: 10 }, saves: ['str', 'con'], skills: ['athletics', 'survival'] },
  Paladin: { hitDice: '1d10', ac: 18, abilities: { str: 16, dex: 10, con: 14, int: 8, wis: 12, cha: 14 }, saves: ['wis', 'cha'], skills: ['athletics', 'religion'] },
  Druide: { hitDice: '1d8', ac: 14, abilities: { str: 10, dex: 13, con: 14, int: 12, wis: 16, cha: 10 }, saves: ['int', 'wis'], skills: ['nature', 'perception', 'medicine'] },
  Moine: { hitDice: '1d8', ac: 15, abilities: { str: 12, dex: 16, con: 14, int: 10, wis: 15, cha: 8 }, saves: ['str', 'dex'], skills: ['acrobatics', 'insight'] },
  Ensorceleur: { hitDice: '1d6', ac: 12, abilities: { str: 8, dex: 14, con: 14, int: 10, wis: 12, cha: 16 }, saves: ['con', 'cha'], skills: ['arcana', 'persuasion'] },
  Occultiste: { hitDice: '1d8', ac: 13, abilities: { str: 8, dex: 14, con: 14, int: 12, wis: 10, cha: 16 }, saves: ['wis', 'cha'], skills: ['arcana', 'deception'] },
  Artificier: { hitDice: '1d8', ac: 15, abilities: { str: 10, dex: 14, con: 14, int: 16, wis: 12, cha: 8 }, saves: ['con', 'int'], skills: ['arcana', 'investigation'] },
};

export const SPELL_ABILITY_BY_CLASS = {
  Magicien: 'int', Artificier: 'int', Clerc: 'wis', Druide: 'wis', Rodeur: 'wis',
  Barde: 'cha', Ensorceleur: 'cha', Occultiste: 'cha', Paladin: 'cha',
};

/** Convertit une vitesse D&D (en pieds) dans l'unite d'une scene, d'apres son
 *  label. Convention de la VF : 5 pieds = 1,5 m, soit une case. Un label
 *  inconnu est traite comme des metres, l'unite par defaut des scenes. */
export function feetToSceneUnits(feet, unitLabel = 'm') {
  const label = String(unitLabel || 'm').trim().toLowerCase();
  if (/^(ft|feet|foot|pi|pied|pieds|')$/.test(label)) return feet;
  if (/^(case|cases|sq|square|squares|c)$/.test(label)) return feet / 5;
  if (/^(km|kilom)/.test(label)) return feet * 0.0003;
  return feet * 0.3;
}
