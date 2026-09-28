/**
 * Partie de démonstration : comptes MJ et joueurs, campagne complète avec
 * scènes, personnages, PNJ, documents, pions et historique de chat.
 *
 *   docker compose exec server node prisma/demo.js
 *
 * Idempotent : relancer le script remet la partie de démo dans son état initial
 * sans toucher aux autres campagnes.
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const PASSWORD = '***REDACTED***';
const JOIN_CODE = 'DEMO24';

const USERS = [
  { email: 'mj@demo.fr', username: 'Ombrelune', role: 'GM' },
  { email: 'kaelen@demo.fr', username: 'Kaelen', role: 'PLAYER' },
  { email: 'sylve@demo.fr', username: 'Sylve', role: 'PLAYER' },
  { email: 'brann@demo.fr', username: 'Brann', role: 'PLAYER' },
];

const abilities = (str, dex, con, int, wis, cha) => ({ str, dex, con, int, wis, cha });
const profs = (saves, skills) => ({
  saves: Object.fromEntries(saves.map((s) => [s, 1])),
  skills: Object.fromEntries(skills.map((s) => [s, 1])),
});

const HEROES = [
  {
    owner: 'Kaelen',
    name: 'Kaelen Ferlame',
    class: 'Paladin',
    subclass: 'Serment de dévotion',
    race: 'Humain',
    background: 'Noble',
    alignment: 'Loyal Bon',
    level: 4,
    xp: 3200,
    abilities: abilities(16, 10, 15, 9, 12, 16),
    proficiencies: profs(['wis', 'cha'], ['athletics', 'religion', 'persuasion', 'insight']),
    hp: 36, maxHp: 36, ac: 18, speed: 30, hitDice: '4d10', hitDiceLeft: 4,
    style: { shape: 'circle', fill: 'radial-gradient(circle at 34% 28%, #d9a441dd, #d9a441 55%, #000000aa)', ring: '#e8d9b5', glyph: '❂', glyphColor: '#2b1e08', accent: '#d9a441' },
    tokenUrl: '/builtin/tokens/paladin.svg',
    attacks: [
      { id: 'a1', name: 'Épée longue', bonus: 6, damage: '1d8+3', type: 'Tranchant', range: 'Corps à corps' },
      { id: 'a2', name: 'Frappe divine (niv. 1)', bonus: 6, damage: '2d8', type: 'Radiant', range: 'Corps à corps' },
    ],
    spellcasting: { ability: 'cha', slots: { 1: { max: 3, used: 1 } }, known: [
      { id: 's1', name: 'Bénédiction', level: 1, prepared: true, notes: 'Concentration, 1 min — +1d4 aux jets' },
      { id: 's2', name: 'Soin des blessures', level: 1, prepared: true, notes: '1d8+3 PV rendus' },
    ] },
    inventory: [
      { id: 'i1', name: 'Épée longue', qty: 1, weight: 1.5, equipped: true },
      { id: 'i2', name: 'Bouclier blasonné', qty: 1, weight: 3, equipped: true },
      { id: 'i3', name: 'Potion de soins', qty: 2, weight: 0.25, notes: '2d4+2 PV' },
    ],
    currency: { gp: 42, sp: 15, cp: 8, ep: 0, pp: 1 },
    features: [
      { id: 'f1', name: 'Imposition des mains', source: 'Paladin 1', description: 'Réserve de 20 PV à distribuer par action.' },
      { id: 'f2', name: 'Aura de protection', source: 'Paladin 6', description: 'Bonus de +3 aux jets de sauvegarde des alliés proches.' },
    ],
    details: {
      personality: "Parle toujours avec courtoisie, même à ses ennemis.",
      ideals: "L'honneur d'une maison se mesure à ses actes, pas à son or.",
      bonds: 'Sa sœur cadette a disparu dans les ruines de Valmorne.',
      flaws: 'Incapable de refuser un duel lancé en public.',
      backstory: "Fils déshérité de la maison Ferlame, Kaelen a troqué son titre contre une armure et un serment. Il cherche sa sœur depuis trois hivers.",
    },
  },
  {
    owner: 'Sylve',
    name: 'Sylve des Ronces',
    class: 'Druide',
    subclass: 'Cercle de la terre',
    race: 'Elfe',
    background: 'Ermite',
    alignment: 'Neutre Strict',
    level: 4,
    xp: 3100,
    abilities: abilities(10, 14, 14, 12, 17, 10),
    proficiencies: profs(['int', 'wis'], ['nature', 'perception', 'medicine', 'survival']),
    hp: 22, maxHp: 30, ac: 15, speed: 30, hitDice: '4d8', hitDiceLeft: 2,
    style: { shape: 'circle', fill: 'radial-gradient(circle at 34% 28%, #3f8f8add, #3f8f8a 55%, #000000aa)', ring: '#4f8a52', glyph: '☘\ufe0e', glyphColor: '#0e1a12', accent: '#3f8f8a' },
    tokenUrl: '/builtin/tokens/druide.svg',
    attacks: [
      { id: 'a1', name: 'Bâton de sourbier', bonus: 5, damage: '1d6+2', type: 'Contondant', range: 'Corps à corps' },
      { id: 'a2', name: 'Trait de feu', bonus: 6, damage: '2d10', type: 'Feu', range: '36 m' },
    ],
    spellcasting: { ability: 'wis', slots: { 1: { max: 4, used: 2 }, 2: { max: 3, used: 0 } }, known: [
      { id: 's1', name: 'Enchevêtrement', level: 1, prepared: true, notes: 'Zone 6 m, entrave — DD 14' },
      { id: 's2', name: 'Peau d’écorce', level: 2, prepared: true, notes: 'CA minimale 16, concentration' },
      { id: 's3', name: 'Druidisme', level: 0, prepared: true, notes: 'Tour de magie' },
    ] },
    inventory: [
      { id: 'i1', name: 'Bâton de sourbier', qty: 1, weight: 2, equipped: true },
      { id: 'i2', name: 'Sacoche à composantes', qty: 1, weight: 1, equipped: true },
      { id: 'i3', name: 'Herbes séchées', qty: 6, weight: 0.1 },
    ],
    currency: { gp: 11, sp: 40, cp: 22, ep: 0, pp: 0 },
    features: [
      { id: 'f1', name: 'Forme sauvage', source: 'Druide 2', description: 'Deux utilisations par repos court.' },
    ],
    details: {
      personality: 'Longs silences, puis une phrase qui tombe juste.',
      ideals: 'Ce que la forêt reprend ne se négocie pas.',
      bonds: 'Le bosquet de Valmorne dépérit depuis le passage de la comète.',
      flaws: 'Se méfie de tout ce qui est bâti en pierre taillée.',
      backstory: 'Gardienne du bosquet des Ronces, elle à quitté son cercle quand la sève a commencé à noircir.',
    },
  },
  {
    owner: 'Brann',
    name: 'Brann Taillepierre',
    class: 'Roublard',
    subclass: 'Voleur',
    race: 'Nain',
    background: 'Criminel',
    alignment: 'Chaotique Neutre',
    level: 4,
    xp: 2900,
    abilities: abilities(10, 17, 14, 13, 11, 12),
    proficiencies: { saves: { dex: 1, int: 1 }, skills: { stealth: 2, sleightOfHand: 2, perception: 1, deception: 1, investigation: 1 } },
    hp: 28, maxHp: 28, ac: 15, speed: 25, hitDice: '4d8', hitDiceLeft: 4,
    style: { shape: 'circle', fill: 'radial-gradient(circle at 34% 28%, #5c6470dd, #5c6470 55%, #000000aa)', ring: '#c3ccd6', glyph: '✦', glyphColor: '#0e1116', accent: '#5c6470' },
    tokenUrl: '/builtin/tokens/roublard.svg',
    attacks: [
      { id: 'a1', name: 'Dague (×2)', bonus: 6, damage: '1d4+3', type: 'Perforant', range: 'Corps à corps / 6 m' },
      { id: 'a2', name: 'Attaque sournoise', bonus: 6, damage: '2d6', type: 'Perforant', range: 'Si avantage' },
      { id: 'a3', name: 'Arbalète de poing', bonus: 6, damage: '1d6+3', type: 'Perforant', range: '9 m' },
    ],
    spellcasting: { ability: 'int', slots: {}, known: [] },
    inventory: [
      { id: 'i1', name: 'Outils de voleur', qty: 1, weight: 0.5, equipped: true, notes: 'Maîtrise — +6' },
      { id: 'i2', name: 'Corde de soie (15 m)', qty: 1, weight: 2 },
      { id: 'i3', name: 'Chausse-trapes', qty: 10, weight: 0.1 },
    ],
    currency: { gp: 78, sp: 3, cp: 51, ep: 2, pp: 0 },
    features: [
      { id: 'f1', name: 'Mains agiles', source: 'Roublard 3', description: 'Action bonus : Utiliser un objet ou crocheter.' },
      { id: 'f2', name: 'Esquive instinctive', source: 'Roublard 5', description: 'Réaction : demi-dégâts d’une attaque vue venir.' },
    ],
    details: {
      personality: 'Compte toujours les sorties d’une pièce avant d’y entrer.',
      ideals: 'On ne vole pas les pauvres. Le reste se discute.',
      bonds: 'Doit 400 po à la guilde des Chandelles.',
      flaws: 'Ne résiste jamais à une serrure réputée inviolable.',
      backstory: 'Ancien tailleur de pierre reconverti après l’effondrement de la mine haute. Connaît chaque pierre descellée de Valmorne.',
    },
  },
];

const NPCS = [
  {
    name: 'Maître Orvain, aubergiste',
    class: 'Roturier', race: 'Humain', level: 2,
    abilities: abilities(11, 10, 12, 12, 13, 14),
    hp: 9, maxHp: 9, ac: 10, speed: 30,
    style: { shape: 'circle', fill: 'radial-gradient(circle at 34% 28%, #7a6a50dd, #7a6a50 55%, #000000aa)', ring: '#e8d9b5', glyph: '❦', glyphColor: '#1a150c' },
    tokenUrl: '/builtin/tokens/erudit.svg',
    details: { notes: 'Sait que la crypte a été rouverte. Ne le dira qu’en échange d’une dette effacée.' },
  },
  {
    name: 'Goule de la crypte',
    class: 'Mort-vivant', race: 'Goule', level: 1,
    abilities: abilities(13, 15, 10, 7, 10, 6),
    hp: 22, maxHp: 22, ac: 12, speed: 30,
    style: { shape: 'circle', fill: 'radial-gradient(circle at 34% 28%, #6f7d84dd, #6f7d84 55%, #000000aa)', ring: '#a33b2f', glyph: '☠\ufe0e', glyphColor: '#12161a' },
    tokenUrl: '/builtin/tokens/mort-vivant.svg',
    attacks: [
      { id: 'a1', name: 'Griffes', bonus: 4, damage: '2d4+2', type: 'Tranchant', range: 'Corps à corps', notes: 'DD 10 CON ou paralysie' },
      { id: 'a2', name: 'Morsure', bonus: 2, damage: '2d6+2', type: 'Perforant', range: 'Corps à corps' },
    ],
    details: { notes: 'Trois goules attendent derrière la herse. Elles n’attaquent qu’à la lumière.' },
  },
  {
    name: 'Vharen, le veilleur pâle',
    class: 'Spectre', race: 'Mort-vivant', level: 7,
    abilities: abilities(8, 16, 14, 14, 13, 17),
    hp: 58, maxHp: 58, ac: 15, speed: 40,
    style: { shape: 'circle', fill: 'radial-gradient(circle at 34% 28%, #7a5fd0dd, #7a5fd0 55%, #000000aa)', ring: '#b4a3f0', glyph: '☾\ufe0e', glyphColor: '#140f22' },
    tokenUrl: '/builtin/tokens/ensorceleur.svg',
    attacks: [
      { id: 'a1', name: 'Toucher glacial', bonus: 6, damage: '3d8', type: 'Nécrotique', range: 'Corps à corps' },
    ],
    details: { notes: 'Antagoniste de l’acte II. Cherche le sceau que porte Kaelen sans le savoir.' },
  },
];

const run = async () => {
  const passwordHash = await bcrypt.hash(PASSWORD, 11);

  const users = {};
  for (const entry of USERS) {
    users[entry.username] = await prisma.user.upsert({
      where: { email: entry.email },
      update: { username: entry.username, passwordHash },
      create: { email: entry.email, username: entry.username, passwordHash },
    });
  }
  const gm = users.Ombrelune;

  // On repart d'une campagne propre pour que la démo soit toujours identique.
  await prisma.campaign.deleteMany({ where: { joinCode: JOIN_CODE } });

  const campaign = await prisma.campaign.create({
    data: {
      name: 'Les Cendres de Valmorne',
      description:
        "Une comète est tombée sur les ruines de Valmorne. Depuis, les morts ne tiennent plus en terre et " +
        "la route du col est coupée. Le bourg de Sourbier engage quiconque sait tenir une arme.",
      joinCode: JOIN_CODE,
      gmId: gm.id,
      combat: { create: {} },
      members: {
        create: USERS.map((entry) => ({ userId: users[entry.username].id, role: entry.role })),
      },
    },
  });

  const scenes = await Promise.all(
    [
      {
        name: "Taverne du Sanglier tapi",
        order: 0,
        backgroundUrl: '/builtin/maps/taverne.svg',
        width: 1680,
        height: 1120,
        notes:
          "## Ouverture\nLa salle est pleine, la pluie bat les volets.\n\n- **Orvain** sert derrière le comptoir. Il regarde souvent la porte.\n- Deux mercenaires jouent aux dés près de l'âtre : ils mentent sur leur destination.\n- Si les joueurs paient une tournée, Orvain lâche le mot « crypte ».\n\n**Test :** Perspicacité DD 13 pour repérer qu'Orvain a peur de quelqu'un dans la salle.",
        fogEnabled: false,
      },
      {
        name: 'Clairière du bosquet noirci',
        order: 1,
        backgroundUrl: '/builtin/maps/clairiere.svg',
        width: 1680,
        height: 1120,
        notes:
          "## Embuscade\nLa sève des arbres a noirci sur trois cents pas.\n\n- 4 **loups efflanqués** attaquent au round 2 depuis le nord.\n- La mare au sud-ouest est un terrain difficile.\n- Un cairn dissimule le **premier sceau** (Investigation DD 15).",
        fogEnabled: true,
        fogReveals: [{ id: 'r1', mode: 'reveal', x: 350, y: 280, w: 840, h: 560 }],
      },
      {
        name: 'Crypte du veilleur pâle',
        order: 2,
        backgroundUrl: '/builtin/maps/caverne.svg',
        width: 1680,
        height: 1120,
        notes:
          "## Acte II — la crypte\nLumière : aucune. Les joueurs doivent gérer leurs torches.\n\n- Herse rouillée : Force DD 16, ou crochetage DD 14.\n- 3 **goules** derrière la herse, immobiles tant qu'il fait noir.\n- **Vharen** apparaît quand le second sceau est touché. Il parle avant de frapper.",
        fogEnabled: true,
        fogReveals: [{ id: 'r1', mode: 'reveal', x: 140, y: 380, w: 520, h: 420 }],
      },
    ].map((scene) => prisma.scene.create({ data: { ...scene, campaignId: campaign.id } })),
  );

  await prisma.campaign.update({
    where: { id: campaign.id },
    data: { activeSceneId: scenes[0].id },
  });

  const heroes = [];
  for (const hero of HEROES) {
    const { owner, ...data } = hero;
    heroes.push(
      await prisma.character.create({
        data: { ...data, ownerId: users[owner].id, campaignId: campaign.id, shared: true },
      }),
    );
  }

  const npcs = [];
  for (const npc of NPCS) {
    npcs.push(
      await prisma.character.create({
        data: { ...npc, ownerId: gm.id, campaignId: campaign.id, isNpc: true, shared: false },
      }),
    );
  }

  // Pions posés dans la taverne : les héros assis autour de la seconde table.
  const step = 70; // espacement de placement des pions de demonstration
  const placements = [
    { character: heroes[0], x: 467, y: 385 },
    { character: heroes[1], x: 663, y: 385 },
    { character: heroes[2], x: 565, y: 287 },
  ];
  for (const [index, spot] of placements.entries()) {
    await prisma.token.create({
      data: {
        sceneId: scenes[0].id,
        name: spot.character.name.split(' ')[0],
        imageUrl: spot.character.tokenUrl,
        style: spot.character.style,
        characterId: spot.character.id,
        ownerId: spot.character.ownerId,
        x: spot.x,
        y: spot.y,
        width: step,
        height: step,
        hp: spot.character.hp,
        maxHp: spot.character.maxHp,
        ac: spot.character.ac,
        zIndex: index + 1,
      },
    });
  }
  await prisma.token.create({
    data: {
      sceneId: scenes[0].id,
      name: 'Orvain',
      imageUrl: npcs[0].tokenUrl,
      style: npcs[0].style,
      characterId: npcs[0].id,
      x: 690,
      y: 160,
      width: step,
      height: step,
      hp: npcs[0].hp,
      maxHp: npcs[0].maxHp,
      ac: npcs[0].ac,
      zIndex: 4,
    },
  });
  // Pion caché : le veilleur pâle attend dans la crypte, invisible pour les joueurs.
  await prisma.token.create({
    data: {
      sceneId: scenes[2].id,
      name: 'Vharen',
      imageUrl: npcs[2].tokenUrl,
      style: npcs[2].style,
      characterId: npcs[2].id,
      x: 11 * step,
      y: 7 * step,
      width: step * 1.5,
      height: step * 1.5,
      hp: npcs[2].hp,
      maxHp: npcs[2].maxHp,
      ac: npcs[2].ac,
      visible: false,
      layer: 'GM',
      auraRadius: 90,
      auraColor: '#7a5fd0',
      conditions: ['invisible'],
      zIndex: 5,
    },
  });

  await prisma.handout.createMany({
    data: [
      {
        campaignId: campaign.id,
        title: "Avis de recherche — le col de Valmorne",
        order: 0,
        isPublic: true,
        content:
          "# Avis du bailli de Sourbier\n\nLa route du col est **fermée** jusqu'à nouvel ordre.\n\n- 200 pièces d'or à qui rouvrira le passage\n- 50 pièces d'or par disparu ramené vivant\n- Se présenter à la **Taverne du Sanglier tapi**\n\n*Signé : Dame Ivrane, bailli.*",
      },
      {
        campaignId: campaign.id,
        title: 'Page arrachée d’un journal',
        order: 1,
        isPublic: false,
        content:
          "…la troisième nuit, la comète s'est éteinte et **le veilleur s'est levé**.\n\nIl ne cherche pas nos vies. Il cherche les sceaux. Nous en avons enterré deux, le troisième est parti avec la maison Ferlame.\n\n*Ne le laissez pas les réunir.*",
      },
      {
        campaignId: campaign.id,
        title: 'Notes du MJ — révélation de l’acte III',
        order: 2,
        isPublic: false,
        content:
          "Vharen était le premier paladin de Valmorne. Le sceau que porte Kaelen est celui de sa propre maison.\n\nSi les joueurs réunissent les trois sceaux, Vharen redevient mortel — et mourra en les remerciant.",
      },
    ],
  });

  await prisma.combat.update({
    where: { campaignId: campaign.id },
    data: {
      isActive: false,
      round: 1,
      turnIndex: 0,
      entries: [
        { id: 'c1', name: 'Brann Taillepierre', initiative: 19, characterId: heroes[2].id, hp: 28, maxHp: 28, ac: 15, isNpc: false, visible: true, conditions: [] },
        { id: 'c2', name: 'Kaelen Ferlame', initiative: 14, characterId: heroes[0].id, hp: 36, maxHp: 36, ac: 18, isNpc: false, visible: true, conditions: [] },
        { id: 'c3', name: 'Goule A', initiative: 12, hp: 22, maxHp: 22, ac: 12, isNpc: true, visible: true, conditions: [] },
        { id: 'c4', name: 'Sylve des Ronces', initiative: 11, characterId: heroes[1].id, hp: 22, maxHp: 30, ac: 15, isNpc: false, visible: true, conditions: ['blessed'] },
        { id: 'c5', name: 'Goule B', initiative: 8, hp: 22, maxHp: 22, ac: 12, isNpc: true, visible: true, conditions: [] },
      ],
    },
  });

  const now = Date.now();
  const history = [
    { user: gm, name: 'Ombrelune', type: 'TEXT', content: "La pluie tombe dru sur Sourbier. La porte de la taverne claque derrière vous.", offset: 22 },
    { user: users.Brann, name: 'Brann Taillepierre', type: 'EMOTE', content: 'secoue son manteau et compte les sorties de la salle.', offset: 20 },
    { user: users.Brann, name: 'Brann Taillepierre', type: 'ROLL', content: 'Perception', offset: 19, roll: { formula: '1d20+3', normalized: '1d20+3', total: 17, breakdown: '1d20[14] +3', crit: false, fumble: false, advantage: 'none', parts: [ { kind: 'dice', sign: 1, count: 1, sides: 20, notation: '1d20', dice: [{ value: 14, kept: true, exploded: false }], sum: 14, crit: false, fumble: false }, { kind: 'modifier', sign: 1, value: 3 } ] } },
    { user: gm, name: 'Ombrelune', type: 'TEXT', content: "Deux mercenaires près de l'âtre baissent la voix quand tu passes. L'aubergiste, lui, regarde la porte un peu trop souvent.", offset: 18 },
    { user: users.Kaelen, name: 'Kaelen Ferlame', type: 'TEXT', content: "Maître Orvain, une tournée pour la salle. Et deux mots pour vous.", offset: 15 },
    { user: users.Sylve, name: 'Sylve des Ronces', type: 'ROLL', content: 'Perspicacité', offset: 13, roll: { formula: '1d20+5', normalized: '2d20kh1+5', total: 23, breakdown: '2d20kh1[~~7~~, 18] +5', crit: false, fumble: false, advantage: 'advantage', parts: [ { kind: 'dice', sign: 1, count: 2, sides: 20, notation: '2d20kh1', dice: [{ value: 7, kept: false, exploded: false }, { value: 18, kept: true, exploded: false }], sum: 18, crit: false, fumble: false }, { kind: 'modifier', sign: 1, value: 5 } ] } },
    { user: gm, name: 'Ombrelune', type: 'TEXT', content: "Orvain a peur — mais pas de vous. Il murmure : « la crypte a été rouverte ».", offset: 11 },
  ];

  for (const entry of history) {
    await prisma.chatMessage.create({
      data: {
        campaignId: campaign.id,
        userId: entry.user.id,
        authorName: entry.name,
        type: entry.type,
        content: entry.content,
        rollData: entry.roll ?? undefined,
        createdAt: new Date(now - entry.offset * 60000),
      },
    });
  }

  console.log('\n=== Partie de démonstration prête ===');
  console.log(`Campagne : ${campaign.name}`);
  console.log(`Code d'invitation : ${JOIN_CODE}`);
  console.log(`Mot de passe commun : ${PASSWORD}\n`);
  for (const entry of USERS) {
    console.log(`  ${entry.role === 'GM' ? 'MJ     ' : 'Joueur '} ${entry.username.padEnd(12)} ${entry.email}`);
  }
  console.log('');
};

run()
  .catch((err) => {
    console.error('[demo] échec', err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
