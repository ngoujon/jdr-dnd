/**
 * Catalogue de sorts, regles 2014 (SRD 5.1).
 *
 * Source : System Reference Document 5.1 de Wizards of the Coast, publie sous
 * licence Creative Commons Attribution 4.0. Les descriptions sont des resumes
 * d'effet rediges pour cette application, pas le texte officiel : elles servent
 * a reconnaitre un sort et a decider en jeu, pas a remplacer le manuel. En cas
 * de doute sur une regle precise, c'est le manuel qui tranche.
 *
 * `text` reste volontairement court : la liste s'affiche a cote de la fiche,
 * dans une colonne etroite, et un joueur qui cherche un sort veut d'abord
 * savoir s'il s'agit du bon.
 *
 * Champs : level 0 = sortilege (cantrip) ; `conc` = concentration ;
 * `ritual` = lancable en rituel ; `classes` sert a filtrer par classe.
 */

const B = 'Barde', C = 'Clerc', D = 'Druide', E = 'Ensorceleur';
const M = 'Magicien', P = 'Paladin', R = 'Rôdeur', O = 'Occultiste';

export const SPELLS = [
  /* ------------------------------------------------------- Sortilèges --- */
  { name: 'Aspersion acide', level: 0, school: 'Invocation', classes: [E, M], time: '1 action', range: '18 m', components: 'V, G', duration: 'Instantanée', text: "Une bulle d'acide éclabousse une créature, ou deux si elles sont à moins de 1,50 m l'une de l'autre. Chaque cible fait un jet de Dextérité ou subit 1d6 acide." },
  { name: 'Assistance', level: 0, school: 'Divination', classes: [B, C, D, M, O, E], time: '1 action', range: 'Contact', components: 'V, G', duration: 'Concentration, 1 minute', conc: true, text: "Vous touchez une créature : une fois avant la fin du sort, elle ajoute 1d4 à un jet de caractéristique de son choix." },
  { name: 'Aiguillon mental', level: 0, school: 'Enchantement', classes: [E, M, O], time: '1 action', range: '18 m', components: 'V', duration: 'Instantanée', text: "La cible fait un jet d'Intelligence ou subit 1d6 psychique et perd sa réaction jusqu'à son prochain tour." },
  { name: 'Bouffée de poison', level: 0, school: 'Nécromancie', classes: [D, E, M, O], time: '1 action', range: '3 m', components: 'V, G', duration: 'Instantanée', text: "La cible fait un jet de Constitution ou subit 1d12 poison." },
  { name: 'Coup au but', level: 0, school: 'Transmutation', classes: [D, E, M, O], time: '1 action', range: 'Contact', components: 'V, G', duration: '1 round', text: "L'arme touchée devient magique et inflige 1d4 dégâts supplémentaires de force à sa prochaine attaque réussie ce tour." },
  { name: 'Épargner les mourants', level: 0, school: 'Nécromancie', classes: [C], time: '1 action', range: 'Contact', components: 'V, G', duration: 'Instantanée', text: "Une créature à 0 point de vie est stabilisée. Elle ne remonte pas à 1 point de vie, elle cesse seulement de faire des jets contre la mort." },
  { name: 'Flamme sacrée', level: 0, school: 'Évocation', classes: [C], time: '1 action', range: '18 m', components: 'V, G', duration: 'Instantanée', text: "Une lumière tombe sur la cible, qui fait un jet de Dextérité ou subit 1d8 radiant. Ni l'abri ni la couverture ne l'aident." },
  { name: 'Friction glaciale', level: 0, school: 'Évocation', classes: [E, M], time: '1 action', range: '18 m', components: 'V, G', duration: 'Instantanée', text: "1d8 dégâts de froid en cas d'attaque de sort réussie, et la cible ne peut pas effectuer de réaction jusqu'à son prochain tour." },
  { name: 'Illusion mineure', level: 0, school: 'Illusion', classes: [B, E, M, O], time: '1 action', range: '9 m', components: 'G, M', duration: '1 minute', text: "Crée un son ou l'image d'un objet, au choix. Un examen attentif révèle la supercherie avec un jet d'Investigation." },
  { name: 'Lumière', level: 0, school: 'Évocation', classes: [B, C, E, M], time: '1 action', range: 'Contact', components: 'V, M', duration: '1 heure', text: "Un objet émet une lumière vive sur 6 m et une pénombre sur 6 m de plus. Une créature non consentante peut l'éviter avec un jet de Dextérité." },
  { name: 'Main du mage', level: 0, school: 'Invocation', classes: [B, E, M, O], time: '1 action', range: '9 m', components: 'V, G', duration: '1 minute', text: "Une main spectrale manipule des objets de moins de 5 kg, ouvre une porte non verrouillée ou verse le contenu d'une fiole. Elle ne peut pas attaquer." },
  { name: 'Message', level: 0, school: 'Transmutation', classes: [B, E, M], time: '1 action', range: '36 m', components: 'V, G, M', duration: '1 round', text: "Vous murmurez à une créature visible ; elle seule entend et peut répondre de la même façon." },
  { name: 'Poigne électrique', level: 0, school: 'Évocation', classes: [E, M], time: '1 action', range: 'Contact', components: 'V, G', duration: 'Instantanée', text: "Attaque de sort au contact : 1d8 dégâts de foudre, et la cible ne peut pas effectuer de réaction jusqu'à son prochain tour." },
  { name: 'Prestidigitation', level: 0, school: 'Transmutation', classes: [B, E, M, O], time: '1 action', range: '3 m', components: 'V, G', duration: "Jusqu'à 1 heure", text: "Petits tours sans effet mécanique : allumer une bougie, salir ou nettoyer un objet, créer une odeur, une marque ou une babiole." },
  { name: 'Produire une flamme', level: 0, school: 'Invocation', classes: [D], time: '1 action', range: 'Personnelle', components: 'V, G', duration: '10 minutes', text: "Une flamme dans votre main éclaire comme une torche, et peut être lancée en attaque de sort pour 1d8 dégâts de feu." },
  { name: 'Rayon de givre', level: 0, school: 'Évocation', classes: [E, M], time: '1 action', range: '18 m', components: 'V, G', duration: 'Instantanée', text: "Attaque de sort à distance : 1d8 dégâts de froid, et la vitesse de la cible baisse de 3 m jusqu'à votre prochain tour." },
  { name: 'Réparation', level: 0, school: 'Transmutation', classes: [B, C, D, E, M], time: '1 minute', range: 'Contact', components: 'V, G', duration: 'Instantanée', text: "Répare une cassure ou une déchirure d'au plus 30 cm. Ne restaure aucune propriété magique." },
  { name: 'Résistance', level: 0, school: 'Abjuration', classes: [C, D], time: '1 action', range: 'Contact', components: 'V, G, M', duration: 'Concentration, 1 minute', conc: true, text: "La créature touchée ajoute 1d4 à un jet de sauvegarde de son choix, une fois avant la fin du sort." },
  { name: 'Trait de feu', level: 0, school: 'Évocation', classes: [E, M], time: '1 action', range: '36 m', components: 'V, G', duration: 'Instantanée', text: "Attaque de sort à distance : 1d10 dégâts de feu. Un objet inflammable non porté s'embrase." },
  { name: 'Trait mystique', level: 0, school: 'Évocation', classes: [O], time: '1 action', range: '36 m', components: 'V, G', duration: 'Instantanée', text: "Attaque de sort à distance : 1d10 dégâts de force. Le nombre de traits augmente aux niveaux 5, 11 et 17." },
  { name: 'Thaumaturgie', level: 0, school: 'Transmutation', classes: [C], time: '1 action', range: '9 m', components: 'V', duration: "Jusqu'à 1 minute", text: "Manifestation mineure de puissance divine : voix tonnante, flammes qui vacillent, porte qui claque, tremblement bref." },
  { name: 'Druidisme', level: 0, school: 'Transmutation', classes: [D], time: '1 action', range: '9 m', components: 'V, G', duration: 'Instantanée', text: "Effet naturel mineur : prédire la météo à 24 heures, faire éclore une fleur, allumer ou éteindre une petite flamme." },
  { name: 'Moquerie cruelle', level: 0, school: 'Enchantement', classes: [B], time: '1 action', range: '18 m', components: 'V', duration: 'Instantanée', text: "Une insulte chargée de magie : jet de Sagesse ou 1d4 psychique et désavantage à la prochaine attaque de la cible." },
  { name: 'Gourdin magique', level: 0, school: 'Transmutation', classes: [D], time: "1 action bonus", range: 'Contact', components: 'V, G, M', duration: '1 minute', text: "Votre gourdin ou bâton devient une arme magique dont les dégâts passent à 1d8 et qui utilise votre caractéristique d'incantation." },

  /* ---------------------------------------------------------- Niveau 1 --- */
  { name: 'Armure du mage', level: 1, school: 'Abjuration', classes: [E, M], time: '1 action', range: 'Contact', components: 'V, G, M', duration: '8 heures', text: "Une cible sans armure voit sa CA passer à 13 + son modificateur de Dextérité." },
  { name: 'Bouclier', level: 1, school: 'Abjuration', classes: [E, M], time: '1 réaction', range: 'Personnelle', components: 'V, G', duration: '1 round', text: "En réaction à une attaque, +5 de CA jusqu'à votre prochain tour, y compris contre l'attaque déclenchante, et immunité à Projectile magique." },
  { name: 'Charme-personne', level: 1, school: 'Enchantement', classes: [B, D, E, M, O], time: '1 action', range: '9 m', components: 'V, G', duration: '1 heure', text: "Un humanoïde fait un jet de Sagesse ou vous considère comme un ami. Il sait qu'il a été charmé une fois le sort terminé." },
  { name: 'Compréhension des langues', level: 1, school: 'Divination', classes: [B, E, M, O], time: '1 action', range: 'Personnelle', components: 'V, G, M', duration: '1 heure', ritual: true, text: "Vous comprenez toute langue parlée entendue et tout texte écrit touché. Ne déchiffre pas les codes secrets." },
  { name: 'Détection de la magie', level: 1, school: 'Divination', classes: [B, C, D, P, R, E, M], time: '1 action', range: 'Personnelle', components: 'V, G', duration: 'Concentration, 10 minutes', conc: true, ritual: true, text: "Vous percevez la magie dans un rayon de 9 m ; une action supplémentaire révèle l'école d'un effet précis." },
  { name: 'Don des langues', level: 1, school: 'Divination', classes: [B, O, E, M], time: '1 action', range: 'Contact', components: 'V, M', duration: '1 heure', text: "La créature touchée comprend toute langue qu'elle entend, et ce qu'elle dit est compris de quiconque connaît une langue." },
  { name: 'Focalisateur spirituel', level: 1, school: 'Évocation', classes: [C], time: "1 action bonus", range: '18 m', components: 'V, G', duration: 'Concentration, 1 minute', conc: true, text: "Une arme spectrale apparaît et frappe pour 1d8 + votre modificateur d'incantation ; une action bonus la déplace de 6 m et frappe à nouveau." },
  { name: 'Grand pas', level: 1, school: 'Transmutation', classes: [D, R, E, M], time: '1 action bonus', range: 'Contact', components: 'V, G, M', duration: 'Concentration, 10 minutes', conc: true, text: "La vitesse de la créature touchée double." },
  { name: 'Graisse', level: 1, school: 'Invocation', classes: [M], time: '1 action', range: '18 m', components: 'V, G, M', duration: '1 minute', text: "Une zone de 3 m de côté devient un terrain difficile ; les créatures qui y entrent ou y commencent leur tour font un jet de Dextérité ou tombent à terre." },
  { name: 'Identification', level: 1, school: 'Divination', classes: [B, M], time: '1 minute', range: 'Contact', components: 'V, G, M', duration: 'Instantanée', ritual: true, text: "Révèle les propriétés d'un objet magique, ses charges restantes, et si un sort affecte une créature touchée." },
  { name: 'Injonction', level: 1, school: 'Enchantement', classes: [C, P], time: '1 action', range: '18 m', components: 'V', duration: '1 round', text: "Un mot d'ordre d'un seul terme : jet de Sagesse ou la cible obéit à son prochain tour (approche, fuite, lâche, couché, halte)." },
  { name: 'Mains brûlantes', level: 1, school: 'Évocation', classes: [E, M], time: '1 action', range: 'Cône de 4,50 m', components: 'V, G', duration: 'Instantanée', text: "Un cône de flammes : jet de Dextérité, 3d6 feu, moitié en cas de réussite. Les objets inflammables non portés s'embrasent." },
  { name: 'Mot de guérison', level: 1, school: 'Évocation', classes: [B, C, D], time: '1 action bonus', range: '18 m', components: 'V', duration: 'Instantanée', text: "Une créature visible récupère 1d4 + votre modificateur d'incantation. Ne fonctionne pas sur les morts-vivants ni les créatures artificielles." },
  { name: 'Projectile magique', level: 1, school: 'Évocation', classes: [E, M], time: '1 action', range: '36 m', components: 'V, G', duration: 'Instantanée', text: "Trois fléchettes qui touchent automatiquement, 1d4+1 force chacune, réparties comme vous voulez. Un projectile de plus par niveau d'emplacement au-delà du 1er." },
  { name: 'Reproches', level: 1, school: 'Évocation', classes: [C, P], time: '1 réaction', range: '18 m', components: 'V', duration: 'Instantanée', text: "En réaction aux dégâts subis, la créature responsable fait un jet de Dextérité ou subit 2d10 radiant, ou du type choisi à l'incantation." },
  { name: 'Sanctuaire', level: 1, school: 'Abjuration', classes: [C], time: '1 action bonus', range: '9 m', components: 'V, G, M', duration: '1 minute', text: "Qui veut attaquer la créature protégée fait un jet de Sagesse ; en cas d'échec il doit choisir une autre cible ou renoncer. Le sort se rompt si la cible attaque." },
  { name: 'Soin des blessures', level: 1, school: 'Évocation', classes: [B, C, D, P, R], time: '1 action', range: 'Contact', components: 'V, G', duration: 'Instantanée', text: "La créature touchée récupère 1d8 + votre modificateur d'incantation. Sans effet sur les morts-vivants et les créatures artificielles." },
  { name: 'Sommeil', level: 1, school: 'Enchantement', classes: [B, E, M], time: '1 action', range: '27 m', components: 'V, G, M', duration: '1 minute', text: "5d8 points de vie de créatures, en commençant par la plus faible, tombent inconscientes. Les morts-vivants et les créatures immunisées au charme sont épargnés." },
  { name: 'Vague tonnante', level: 1, school: 'Évocation', classes: [B, D, E, M], time: '1 action', range: 'Cube de 4,50 m', components: 'V, G', duration: 'Instantanée', text: "Jet de Constitution : 2d8 tonnerre et repoussé de 3 m, moitié des dégâts et pas de recul en cas de réussite. Le tonnerre s'entend à 90 m." },
  { name: 'Image silencieuse', level: 1, school: 'Illusion', classes: [B, E, M], time: '1 action', range: '18 m', components: 'V, G, M', duration: 'Concentration, 10 minutes', conc: true, text: "Une image purement visuelle, sans son ni odeur, d'au plus 4,50 m de côté, que vous pouvez déplacer. Un jet d'Investigation la démasque." },
  { name: 'Faveur divine', level: 1, school: 'Évocation', classes: [P], time: '1 action bonus', range: 'Personnelle', components: 'V, G', duration: 'Concentration, 1 minute', conc: true, text: "Vos attaques d'arme infligent 1d4 dégâts radiants supplémentaires." },
  { name: 'Marque du chasseur', level: 1, school: 'Divination', classes: [R], time: '1 action bonus', range: '27 m', components: 'V', duration: 'Concentration, 1 heure', conc: true, text: "Vous désignez une créature : +1d6 dégâts à chacune de vos attaques d'arme contre elle, et avantage pour la pister ou la repérer." },
  { name: 'Bénédiction', level: 1, school: 'Enchantement', classes: [C, P], time: '1 action', range: '9 m', components: 'V, G, M', duration: 'Concentration, 1 minute', conc: true, text: "Jusqu'à trois créatures ajoutent 1d4 à leurs jets d'attaque et de sauvegarde." },
  { name: 'Fléau', level: 1, school: 'Enchantement', classes: [C, P], time: '1 action', range: '9 m', components: 'V, G, M', duration: 'Concentration, 1 minute', conc: true, text: "Jet de Charisme ou la cible retranche 1d4 de ses jets d'attaque et de sauvegarde." },
  { name: 'Détection du mal et du bien', level: 1, school: 'Divination', classes: [C, P], time: '1 action', range: 'Personnelle', components: 'V, G', duration: 'Concentration, 10 minutes', conc: true, text: "Vous percevez la présence d'aberrations, célestes, élémentaires, fées, fiélons et morts-vivants dans un rayon de 9 m, sans connaître leur identité." },

  /* ---------------------------------------------------------- Niveau 2 --- */
  { name: 'Aide', level: 2, school: 'Abjuration', classes: [C, P], time: '1 action', range: '9 m', components: 'V, G, M', duration: '8 heures', text: "Trois créatures gagnent 5 points de vie maximum et actuels supplémentaires pendant la durée." },
  { name: 'Arme magique', level: 2, school: 'Transmutation', classes: [P, E, M], time: '1 action bonus', range: 'Contact', components: 'V, G', duration: 'Concentration, 1 heure', conc: true, text: "Une arme non magique devient magique avec un bonus de +1 à l'attaque et aux dégâts." },
  { name: 'Détection des pensées', level: 2, school: 'Divination', classes: [B, E, M], time: '1 action', range: 'Personnelle', components: 'V, G, M', duration: 'Concentration, 1 minute', conc: true, text: "Vous lisez les pensées de surface d'une créature à 9 m ; sonder plus profondément déclenche un jet de Sagesse et alerte la cible." },
  { name: 'Flou', level: 2, school: 'Illusion', classes: [E, M], time: '1 action', range: 'Personnelle', components: 'V', duration: 'Concentration, 1 minute', conc: true, text: "Votre silhouette vacille : les attaques contre vous ont un désavantage, sauf de la part de créatures qui n'ont pas besoin de voir ou qui perçoivent au-delà de la vue." },
  { name: 'Immobiliser un humanoïde', level: 2, school: 'Enchantement', classes: [B, C, D, E, M, O], time: '1 action', range: '18 m', components: 'V, G, M', duration: 'Concentration, 1 minute', conc: true, text: "Jet de Sagesse ou l'humanoïde est paralysé, avec un nouveau jet à la fin de chacun de ses tours." },
  { name: 'Invisibilité', level: 2, school: 'Illusion', classes: [B, E, M, O], time: '1 action', range: 'Contact', components: 'V, G, M', duration: 'Concentration, 1 heure', conc: true, text: "La créature touchée devient invisible, ainsi que ce qu'elle porte. Le sort prend fin si elle attaque ou lance un sort." },
  { name: 'Lévitation', level: 2, school: 'Transmutation', classes: [E, M], time: '1 action', range: '18 m', components: 'V, G, M', duration: 'Concentration, 10 minutes', conc: true, text: "Une créature ou un objet s'élève jusqu'à 6 m et y flotte. Une cible non consentante peut résister avec un jet de Constitution." },
  { name: 'Nappe de brouillard', level: 2, school: 'Invocation', classes: [D, R, E, M], time: '1 action', range: '36 m', components: 'V, G', duration: 'Concentration, 1 heure', conc: true, text: "Une sphère de brouillard de 6 m de rayon rend la zone lourdement obscurcie. Un vent fort la disperse en 1 round." },
  { name: 'Restauration partielle', level: 2, school: 'Abjuration', classes: [B, C, D, P, R], time: '1 action', range: 'Contact', components: 'V, G', duration: 'Instantanée', text: "Met fin à une maladie, ou à un état parmi aveuglé, assourdi, paralysé ou empoisonné." },
  { name: 'Rayon ardent', level: 2, school: 'Évocation', classes: [E, M], time: '1 action', range: '36 m', components: 'V, G', duration: 'Instantanée', text: "Trois rayons de feu, chacun visé séparément, 2d6 dégâts par rayon qui touche. Un rayon de plus par niveau d'emplacement supérieur." },
  { name: 'Silence', level: 2, school: 'Illusion', classes: [B, C, R], time: '1 action', range: '36 m', components: 'V, G', duration: 'Concentration, 10 minutes', conc: true, ritual: true, text: "Aucun son dans une sphère de 6 m de rayon. Les créatures à l'intérieur sont immunisées au tonnerre et ne peuvent pas lancer de sorts à composante verbale." },
  { name: 'Toile d\'araignée', level: 2, school: 'Invocation', classes: [E, M], time: '1 action', range: '18 m', components: 'V, G, M', duration: 'Concentration, 1 heure', conc: true, text: "Des toiles épaisses remplissent un cube de 6 m : terrain difficile, et jet de Dextérité sous peine d'être entravé." },
  { name: 'Verrou magique', level: 2, school: 'Abjuration', classes: [M], time: '1 action', range: 'Contact', components: 'V, G, M', duration: "Jusqu'à dissipation", text: "Une porte, une fenêtre ou un coffre se verrouille ; le DD pour le forcer augmente de 10. Vous pouvez définir un mot de passe." },
  { name: 'Vision dans le noir', level: 2, school: 'Transmutation', classes: [D, R, E, M], time: '1 action', range: 'Contact', components: 'V, G, M', duration: '8 heures', text: "La créature touchée voit dans le noir jusqu'à 18 m." },
  { name: 'Zone de vérité', level: 2, school: 'Enchantement', classes: [B, C, P], time: '1 action', range: '18 m', components: 'V, G', duration: '10 minutes', text: "Dans une sphère de 4,50 m, les créatures qui ratent un jet de Charisme ne peuvent pas mentir, mais restent libres d'esquiver la question." },
  { name: 'Rayon affaiblissant', level: 2, school: 'Nécromancie', classes: [O, M], time: '1 action', range: '18 m', components: 'V, G', duration: 'Concentration, 1 minute', conc: true, text: "Attaque de sort : 2d6 nécrotiques, et la cible inflige la moitié des dégâts de ses attaques d'arme basées sur la Force." },
  { name: 'Passage sans trace', level: 2, school: 'Abjuration', classes: [D, R], time: '1 action', range: 'Personnelle', components: 'V, G, M', duration: 'Concentration, 1 heure', conc: true, text: "Vous et vos compagnons proches gagnez +10 en Discrétion et ne laissez aucune trace à suivre." },

  /* ---------------------------------------------------------- Niveau 3 --- */
  { name: 'Boule de feu', level: 3, school: 'Évocation', classes: [E, M], time: '1 action', range: '45 m', components: 'V, G, M', duration: 'Instantanée', text: "Une explosion de 6 m de rayon : jet de Dextérité, 8d6 feu, moitié en cas de réussite. Embrase les objets inflammables non portés." },
  { name: 'Contresort', level: 3, school: 'Abjuration', classes: [E, M, O], time: '1 réaction', range: '18 m', components: 'G', duration: 'Instantanée', text: "Interrompt un sort de niveau 3 ou moins lancé à portée. Au-delà, il faut réussir un test de caractéristique d'incantation DD 10 + niveau du sort." },
  { name: 'Dissipation de la magie', level: 3, school: 'Abjuration', classes: [B, C, D, P, E, M, O], time: '1 action', range: '36 m', components: 'V, G', duration: 'Instantanée', text: "Met fin aux effets magiques de niveau 3 ou moins sur une cible ; au-delà, test de caractéristique d'incantation DD 10 + niveau du sort." },
  { name: 'Éclair', level: 3, school: 'Évocation', classes: [E, M], time: '1 action', range: 'Ligne de 30 m', components: 'V, G, M', duration: 'Instantanée', text: "Une ligne de foudre de 30 m sur 1,50 m : jet de Dextérité, 8d6 foudre, moitié en cas de réussite." },
  { name: 'Hâte', level: 3, school: 'Transmutation', classes: [E, M], time: '1 action', range: '9 m', components: 'V, G, M', duration: 'Concentration, 1 minute', conc: true, text: "La cible double sa vitesse, gagne +2 de CA, l'avantage aux jets de Dextérité et une action supplémentaire limitée. À la fin du sort, elle perd son tour suivant." },
  { name: 'Lenteur', level: 3, school: 'Transmutation', classes: [E, M], time: '1 action', range: '36 m', components: 'V, G, M', duration: 'Concentration, 1 minute', conc: true, text: "Jusqu'à six créatures font un jet de Sagesse : vitesse divisée par deux, −2 de CA et de jets de Dextérité, une seule action ou action bonus par tour." },
  { name: 'Peur', level: 3, school: 'Illusion', classes: [B, E, M, O], time: '1 action', range: 'Cône de 9 m', components: 'V, G, M', duration: 'Concentration, 1 minute', conc: true, text: "Jet de Sagesse ou la créature lâche ce qu'elle tient et fuit, terrorisée, tant qu'elle vous voit." },
  { name: 'Respiration aquatique', level: 3, school: 'Transmutation', classes: [D, R, E, M], time: '1 action', range: '9 m', components: 'V, G, M', duration: '24 heures', ritual: true, text: "Jusqu'à dix créatures respirent sous l'eau, sans perdre leur capacité à respirer l'air." },
  { name: 'Restauration mineure', level: 3, school: 'Abjuration', classes: [B, C, D, P], time: '1 action', range: 'Contact', components: 'V, G', duration: 'Instantanée', text: "Met fin à un effet réduisant les caractéristiques ou les points de vie maximum, ou à une pétrification, une malédiction ou un charme." },
  { name: 'Vol', level: 3, school: 'Transmutation', classes: [E, M, O], time: '1 action', range: 'Contact', components: 'V, G, M', duration: 'Concentration, 10 minutes', conc: true, text: "La créature touchée gagne une vitesse de vol de 18 m. À la fin du sort, elle tombe si elle est encore en l'air." },
  { name: 'Nuage nauséabond', level: 3, school: 'Invocation', classes: [B, E, M], time: '1 action', range: '27 m', components: 'V, G, M', duration: 'Concentration, 10 minutes', conc: true, text: "Une sphère de gaz de 6 m de rayon : jet de Constitution ou la créature perd son action. La zone est lourdement obscurcie." },
  { name: 'Mot de guérison de groupe', level: 3, school: 'Évocation', classes: [B, C, D], time: '1 action bonus', range: '18 m', components: 'V', duration: 'Instantanée', text: "Jusqu'à six créatures récupèrent chacune 1d4 + votre modificateur d'incantation." },
  { name: 'Clairvoyance', level: 3, school: 'Divination', classes: [B, C, E, M], time: '10 minutes', range: '1,5 km', components: 'V, G, M', duration: 'Concentration, 10 minutes', conc: true, text: "Un capteur invisible vous laisse voir ou entendre depuis un lieu connu ou visible. Une créature qui perçoit la magie le repère." },
  { name: 'Revivification', level: 3, school: 'Nécromancie', classes: [C, P], time: '1 action', range: 'Contact', components: 'V, G, M', duration: 'Instantanée', text: "Ramène à la vie une créature morte depuis moins d'une minute, avec 1 point de vie. Ne restaure ni membre manquant ni mort par vieillesse." },
];

/** Niveaux presents dans le catalogue, pour les filtres de l'interface. */
export const SPELL_LEVELS = [...new Set(SPELLS.map((s) => s.level))].sort((a, b) => a - b);

export const spellLevelLabel = (level) =>
  level === 0 ? 'Sortilège' : `Niveau ${level}`;

/** Recherche insensible a la casse et aux accents, sur le nom puis l'ecole. */
const normalize = (value) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

export function searchSpells(query, { level = null, className = null } = {}) {
  const needle = normalize(query).trim();
  return SPELLS.filter((spell) => {
    if (level !== null && spell.level !== level) return false;
    if (className && !spell.classes.includes(className)) return false;
    if (!needle) return true;
    return normalize(spell.name).includes(needle) || normalize(spell.school).includes(needle);
  });
}

export const findSpell = (name) =>
  SPELLS.find((spell) => normalize(spell.name) === normalize(name)) || null;
