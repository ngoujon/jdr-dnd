/** Données de référence D&D 5e utilisées côté serveur (calculs dérivés). */

export const ABILITIES = ['str', 'dex', 'con', 'int', 'wis', 'cha'];

export const SKILLS = {
  acrobatics: 'dex',
  animalHandling: 'wis',
  arcana: 'int',
  athletics: 'str',
  deception: 'cha',
  history: 'int',
  insight: 'wis',
  intimidation: 'cha',
  investigation: 'int',
  medicine: 'wis',
  nature: 'int',
  perception: 'wis',
  performance: 'cha',
  persuasion: 'cha',
  religion: 'int',
  sleightOfHand: 'dex',
  stealth: 'dex',
  survival: 'wis',
};

export const modifier = (score) => Math.floor((Number(score || 10) - 10) / 2);

export const proficiencyBonus = (level) => 2 + Math.floor((Math.max(1, Number(level || 1)) - 1) / 4);

/** Ajoute les valeurs calculées (mods, DD, bonus de competences) à une fiche. */
export const withDerived = (character) => {
  if (!character) return character;
  const abilities = character.abilities || {};
  const prof = proficiencyBonus(character.level);
  const profs = character.proficiencies || { saves: {}, skills: {} };
  const mods = Object.fromEntries(ABILITIES.map((a) => [a, modifier(abilities[a])]));

  const saves = Object.fromEntries(
    ABILITIES.map((a) => [a, mods[a] + prof * (profs.saves?.[a] ? 1 : 0)]),
  );
  const skills = Object.fromEntries(
    Object.entries(SKILLS).map(([skill, ability]) => {
      const rank = profs.skills?.[skill] || 0; // 0 = aucune, 1 = maitrise, 2 = expertise
      return [skill, mods[ability] + prof * rank];
    }),
  );
  const spellAbility = character.spellcasting?.ability || 'int';

  return {
    ...character,
    derived: {
      proficiencyBonus: prof,
      mods,
      saves,
      skills,
      passivePerception: 10 + skills.perception,
      passiveInsight: 10 + skills.insight,
      initiative: mods.dex + Number(character.initiative || 0),
      spellSaveDc: 8 + prof + (mods[spellAbility] ?? 0),
      spellAttack: prof + (mods[spellAbility] ?? 0),
    },
  };
};
