/**
 * Mise a l'echelle d'une carte : le MJ trace un segment sur la carte puis
 * indique sa longueur reelle en metres. Le bouton vit dans les reglages de la
 * scene, le trace sur la carte : ce petit etat partage relie les deux.
 */
import { create } from 'zustand';

export const useCalibration = create(() => ({ active: false }));

export const startCalibration = () => useCalibration.setState({ active: true });
export const stopCalibration = () => useCalibration.setState({ active: false });

/** Un carre de reference vaut 1,5 m (une case de D&D). */
export const REFERENCE_METERS = 1.5;

/**
 * Reglages d'echelle pour qu'un segment de `pixels` vaille `meters` metres.
 * On garde 1,5 m par longueur de reference : la taille d'un pion pose ensuite
 * correspond alors a une creature de taille moyenne sur ce plan. Si la carte
 * est trop grande ou trop petite pour ca, on garde la longueur de reference
 * actuelle et on change ce qu'elle vaut.
 */
export const scaleFromMeasure = (pixels, meters, currentScalePx = 70) => {
  const scalePx = Math.round((pixels * REFERENCE_METERS) / meters);
  if (scalePx >= 10 && scalePx <= 500) return { scalePx, scaleUnits: REFERENCE_METERS, unitLabel: 'm' };
  const scaleUnits = Math.round(((meters * currentScalePx) / pixels) * 1000) / 1000;
  return { scalePx: currentScalePx, scaleUnits: Math.min(1000, Math.max(0.1, scaleUnits)), unitLabel: 'm' };
};
