/**
 * Jeu d'icônes SVG de l'application.
 *
 * Tracé uniquement, en `currentColor` : une icône prend la couleur et la taille
 * du texte qui l'entoure, et reste lisible sur le fond sombre comme sur le
 * parchemin de la fiche imprimée. Pas d'émoji : leur rendu dépend de la police
 * du système et ne se colore pas.
 */
const base = {
  width: '1em',
  height: '1em',
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
  focusable: false,
};

export const IconCharacter = () => (
  <svg {...base}>
    <circle cx="12" cy="8" r="3.4" />
    <path d="M4.8 20a7.2 7.2 0 0 1 14.4 0" />
  </svg>
);

export const IconSkills = () => (
  <svg {...base}>
    <path d="M12 3.2 14.6 9l6.2.5-4.7 4 1.4 6-5.5-3.3L6.5 19.5l1.4-6-4.7-4L9.4 9z" />
  </svg>
);

export const IconCombat = () => (
  <svg {...base}>
    <path d="M14.5 3.5h6v6" />
    <path d="m20.5 3.5-9 9" />
    <path d="m3.5 20.5 4-4" />
    <path d="M3.5 9.5v-6h6" />
    <path d="m3.5 3.5 9 9" />
    <path d="m20.5 20.5-4-4" />
  </svg>
);

export const IconSpells = () => (
  <svg {...base}>
    <path d="M5 19 16 8" />
    <path d="m14 6 4 4" />
    <path d="M18.5 3v3M20 4.5h-3" />
    <path d="M6.5 4v2.5M7.75 5.25h-2.5" />
  </svg>
);

export const IconGear = () => (
  <svg {...base}>
    <path d="M6 8h12l-1 12H7z" />
    <path d="M9.5 8V6a2.5 2.5 0 0 1 5 0v2" />
  </svg>
);

export const IconStory = () => (
  <svg {...base}>
    <path d="M4 5.5A2 2 0 0 1 6 4h5v16H6a2 2 0 0 0-2 2z" />
    <path d="M20 5.5A2 2 0 0 0 18 4h-5v16h5a2 2 0 0 1 2 2z" />
  </svg>
);

export const IconLook = () => (
  <svg {...base}>
    <circle cx="12" cy="12" r="8.5" />
    <circle cx="9" cy="9.5" r="1.1" />
    <circle cx="15" cy="9.5" r="1.1" />
    <path d="M8.8 15a4 4 0 0 0 6.4 0" />
  </svg>
);

export const IconNotes = () => (
  <svg {...base}>
    <path d="M6 3.5h8.5L19 8v12.5H6z" />
    <path d="M14 3.5V8h5" />
    <path d="M9 12.5h6M9 16h4" />
  </svg>
);

export const IconJoin = () => (
  <svg {...base}>
    <path d="M13 4h5a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-5" />
    <path d="M10 8.5 13.5 12 10 15.5" />
    <path d="M13.5 12H4" />
  </svg>
);

export const IconTrash = () => (
  <svg {...base}>
    <path d="M4.5 6.5h15" />
    <path d="M9.5 6.5V4.8a1.3 1.3 0 0 1 1.3-1.3h2.4a1.3 1.3 0 0 1 1.3 1.3v1.7" />
    <path d="M6.5 6.5 7.4 20a1.3 1.3 0 0 0 1.3 1.2h6.6a1.3 1.3 0 0 0 1.3-1.2l.9-13.5" />
    <path d="M10.5 10.5v7M13.5 10.5v7" />
  </svg>
);

export const IconSheet = () => (
  <svg {...base}>
    <path d="M6 3.5h12v17H6z" />
    <path d="M9 8h6M9 11.5h6M9 15h4" />
  </svg>
);

export const IconCampaigns = () => (
  <svg {...base}>
    <path d="M3.5 19.5 12 4l8.5 15.5z" />
    <path d="M8.2 19.5 12 12l3.8 7.5" />
  </svg>
);

export const IconPlus = () => (
  <svg {...base}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);
