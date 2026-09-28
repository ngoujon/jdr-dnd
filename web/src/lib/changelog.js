// Historique des versions affiché dans la modale de patchnote (voir TopBar.jsx).
// Pense à ajouter une entrée en tête de liste à chaque nouvelle fonctionnalité livrée.
export const CHANGELOG = [
  {
    version: '0.6.0',
    date: '2026-09-28',
    changes: [
      "Choix de la sous-race à la création du personnage, selon les règles de 2014",
      "Catalogue de sorts avec recherche par nom et description de l'effet à côté",
      "Rappel de l'effet d'un sort directement sur la fiche, au survol",
    ],
  },
  {
    version: '0.5.0',
    date: '2026-09-28',
    changes: [
      "Suppression de la grille : les pions se placent librement, une échelle de scène remplace le quadrillage",
      "La scène reprend les dimensions du fond de carte choisi",
      "Le Maître du Jeu voit la portée de déplacement des personnages joueurs",
      "Notes privées par personnage : chacun ne voit que les siennes, joueur comme MJ",
      "Fiche de personnage accessible et modifiable depuis « Mes personnages », et ouverte dès la création",
      "Fiche réorganisée : navigation par icônes, points de vie lisibles d'un coup d'œil, bulles d'aide sur les champs",
      "Conversations privées en fenêtres réductibles, avec rappel de l'historique",
      "Menu « Mes campagnes » dans l'en-tête, pour changer de table sans repasser par l'accueil",
      "Page d'accueil enrichie et inscription avec confirmation du mot de passe",
    ],
  },
  {
    version: '0.4.0',
    date: '2026-09-28',
    changes: [
      "Masquage des curseurs partagés des autres joueurs et du MJ sur le plateau",
      "Affichage d'un cercle de portée max autour du pion sélectionné",
      "Export PDF de la fiche de personnage et ajout de champs complémentaires",
      "Correction de la copie du code de campagne, email éditable et fiches privées assignées",
      "Affichage de la version déployée dans l'en-tête et fiabilisation du déploiement",
    ],
  },
  {
    version: '0.3.0',
    date: '2026-09-23',
    changes: [
      "Possibilité d'associer un personnage existant à une campagne rejointe",
    ],
  },
  {
    version: '0.2.0',
    date: '2026-09-22',
    changes: [
      "Accès à l'application sécurisé et non indexé par les moteurs de recherche",
      "Ajout de comptes de test (MJ + joueurs) pour faciliter les démonstrations",
      "Passage de l'unité de mesure par défaut des scènes en mètres",
      "Correction du placement des nouvelles ressources hors du plateau visible",
      "Protection contre les jointures de campagne invalides",
      "Interdiction pour les joueurs de déplacer les pions des autres ou les PNJ",
      "Agrandissement de l'emblème des pions PNJ sur la carte",
      "Raccourci « MP » pour chuchoter à un joueur depuis la liste du groupe",
      "Synchronisation des PV du tracker de combat avec le pion sur la carte",
      "Fin de la mise en cache du client pour éviter de rester bloqué sur une ancienne version",
      "Affichage de l'unité de la grille dans les réglages de scène",
      "Correction de la perte de modifications rapides sur les fiches de personnage",
      "Pions du joueur toujours visibles au-dessus du brouillard de guerre",
    ],
  },
  {
    version: '0.1.0',
    date: '2026-09-15',
    changes: [
      "Lancement de Table Ronde, la table de jeu virtuelle dockerisée",
      "Corrections d'affichage diverses",
    ],
  },
];

export const APP_VERSION = CHANGELOG[0].version;
