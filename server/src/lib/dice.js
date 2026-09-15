import crypto from 'node:crypto';

/**
 * Moteur de des supportant la notation usuelle des JDR :
 *   3d6, 1d20+5, 2d20kh1 (avantage), 2d20kl1 (desavantage),
 *   4d6dl1 (stats), 1d8r1 (relance des 1), 8d6!  (explosif),
 *   des multiples et modificateurs : 1d8+1d6+3
 *
 * Renvoie { formula, total, rolls: [...], breakdown: string, error? }
 */

const MAX_DICE = 200;
const MAX_SIDES = 1000;

/** Tirage uniforme non biaise via crypto. */
const rollDie = (sides) => {
  if (sides <= 0) return 0;
  const limit = Math.floor(0xffffffff / sides) * sides;
  let value;
  do {
    value = crypto.randomBytes(4).readUInt32BE(0);
  } while (value >= limit);
  return (value % sides) + 1;
};

const TERM_RE = /^(\d*)d(\d+|%|f)((?:[a-z]+\d*|!)*)$/i;

const parseModifiers = (raw) => {
  const mods = [];
  const re = /(kh|kl|dh|dl|r|ro|min|max|!)(\d*)/gi;
  let match;
  while ((match = re.exec(raw)) !== null) {
    mods.push({ op: match[1].toLowerCase(), value: match[2] === '' ? null : Number(match[2]) });
  }
  return mods;
};

const applyTerm = (count, sides, modsRaw) => {
  const mods = parseModifiers(modsRaw || '');
  const explode = mods.some((m) => m.op === '!');
  const rerollMods = mods.filter((m) => m.op === 'r' || m.op === 'ro');
  const minMod = mods.find((m) => m.op === 'min');
  const maxMod = mods.find((m) => m.op === 'max');

  const dice = [];
  const rollOne = () => {
    let value = rollDie(sides);
    for (const rr of rerollMods) {
      const threshold = rr.value ?? 1;
      if (rr.op === 'ro') {
        if (value <= threshold) value = rollDie(sides);
      } else {
        let guard = 0;
        while (value <= threshold && guard < 50) {
          value = rollDie(sides);
          guard += 1;
        }
      }
    }
    if (minMod?.value != null) value = Math.max(value, minMod.value);
    if (maxMod?.value != null) value = Math.min(value, maxMod.value);
    return value;
  };

  for (let i = 0; i < count; i += 1) {
    let value = rollOne();
    dice.push({ value, kept: true, exploded: false });
    if (explode) {
      let guard = 0;
      while (value === sides && guard < 20) {
        value = rollOne();
        dice.push({ value, kept: true, exploded: true });
        guard += 1;
      }
    }
  }

  // keep/drop : on marque les des non conserves plutot que de les supprimer,
  // pour que le joueur voie l'integralite du tirage.
  const keepDrop = mods.find((m) => ['kh', 'kl', 'dh', 'dl'].includes(m.op));
  if (keepDrop) {
    const n = keepDrop.value ?? 1;
    const order = [...dice].sort((a, b) => a.value - b.value);
    let discarded = [];
    if (keepDrop.op === 'kh') discarded = order.slice(0, Math.max(0, dice.length - n));
    if (keepDrop.op === 'kl') discarded = order.slice(n);
    if (keepDrop.op === 'dl') discarded = order.slice(0, n);
    if (keepDrop.op === 'dh') discarded = order.slice(Math.max(0, dice.length - n));
    for (const die of discarded) die.kept = false;
  }

  return dice;
};

const tokenize = (formula) => {
  const cleaned = formula.replace(/\s+/g, '').toLowerCase();
  const parts = cleaned.split(/(?=[+-])/).filter(Boolean);
  return parts.map((part) => {
    const sign = part.startsWith('-') ? -1 : 1;
    const body = part.replace(/^[+-]/, '');
    return { sign, body };
  });
};

export const rollDice = (formula, { label = '', advantage = 'none' } = {}) => {
  let working = String(formula || '').trim();
  if (!working) return { error: 'Formule vide' };
  if (working.length > 120) return { error: 'Formule trop longue' };

  // Avantage / desavantage applique au premier d20 rencontre.
  if (advantage === 'advantage') working = working.replace(/\b1?d20\b/, '2d20kh1');
  if (advantage === 'disadvantage') working = working.replace(/\b1?d20\b/, '2d20kl1');

  const terms = tokenize(working);
  if (!terms.length) return { error: 'Formule invalide' };

  let total = 0;
  const parts = [];

  for (const { sign, body } of terms) {
    if (/^\d+$/.test(body)) {
      const value = Number(body) * sign;
      total += value;
      parts.push({ kind: 'modifier', sign, value: Number(body) });
      continue;
    }
    const match = TERM_RE.exec(body);
    if (!match) return { error: `Terme non reconnu : « ${body} »` };

    const count = match[1] === '' ? 1 : Number(match[1]);
    const sidesRaw = match[2];
    const sides = sidesRaw === '%' ? 100 : sidesRaw === 'f' ? 3 : Number(sidesRaw);
    if (count < 1 || count > MAX_DICE) return { error: `Nombre de dés hors limites (1-${MAX_DICE})` };
    if (sides < 2 || sides > MAX_SIDES) return { error: `Nombre de faces hors limites (2-${MAX_SIDES})` };

    const dice = applyTerm(count, sides, match[3]);
    const isFudge = sidesRaw === 'f';
    const sum = dice
      .filter((d) => d.kept)
      .reduce((acc, d) => acc + (isFudge ? d.value - 2 : d.value), 0);
    total += sum * sign;
    parts.push({
      kind: 'dice',
      sign,
      count,
      sides,
      notation: `${count}d${sidesRaw}${match[3] || ''}`,
      dice: isFudge ? dice.map((d) => ({ ...d, value: d.value - 2 })) : dice,
      sum,
      crit: sides === 20 && dice.some((d) => d.kept && d.value === 20),
      fumble: sides === 20 && dice.some((d) => d.kept && d.value === 1),
    });
  }

  const breakdown = parts
    .map((p, i) => {
      const sign = p.sign < 0 ? '-' : i === 0 ? '' : '+';
      if (p.kind === 'modifier') return `${sign}${p.value}`;
      const dice = p.dice.map((d) => (d.kept ? `${d.value}` : `~~${d.value}~~`)).join(', ');
      return `${sign}${p.notation}[${dice}]`;
    })
    .join(' ');

  return {
    formula: String(formula).trim(),
    normalized: working,
    label,
    advantage,
    total,
    parts,
    breakdown,
    crit: parts.some((p) => p.kind === 'dice' && p.crit),
    fumble: parts.some((p) => p.kind === 'dice' && p.fumble),
  };
};

/** Extrait "/roll 1d20+3 # Perception" depuis un message de chat. */
export const parseRollCommand = (text) => {
  const match = /^\/(roll|r|gmroll|gr)\s+(.+)$/i.exec(text.trim());
  if (!match) return null;
  const secret = /^(gmroll|gr)$/i.test(match[1]);
  const [formula, ...labelParts] = match[2].split('#');
  return { formula: formula.trim(), label: labelParts.join('#').trim(), secret };
};
