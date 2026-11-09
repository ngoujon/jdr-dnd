import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth, useTable } from '../lib/store.js';
import { TokenSprite } from './TokenSprite.jsx';
import { feetToSceneUnits } from '../lib/dnd.js';
import { useCalibration, stopCalibration, scaleFromMeasure } from '../lib/calibration.js';
import { Modal, useToast } from './Ui.jsx';

const MIN_SCALE = 0.12;
const MAX_SCALE = 4;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const uid = () => Math.random().toString(36).slice(2, 10);
/** Tailles de creature proposees par l'inspecteur de pion, en cases (voir SIZES). */
const TOKEN_SIZE_FACTORS = [0.5, 1, 2, 3, 4];

/**
 * Plateau de jeu : panoramique, zoom, pions deplacables, brouillard de guerre,
 * calque de dessin, mesure de distance et pings.
 */
export function MapCanvas({
  tool,
  onToolChange,
  brush,
  selection,
  onSelectionChange,
  onOpenToken,
  viewRef,
}) {
  const scene = useTable((s) => s.scene);
  const tokens = useTable((s) => s.tokens);
  const characters = useTable((s) => s.characters);
  const ghosts = useTable((s) => s.ghosts);
  const pings = useTable((s) => s.pings);
  const reactions = useTable((s) => s.reactions);
  const isGM = useTable((s) => s.isGM);
  const me = useAuth((s) => s.user);
  const moveTokens = useTable((s) => s.moveTokens);
  const dragToken = useTable((s) => s.dragToken);
  const ping = useTable((s) => s.ping);
  const updateFog = useTable((s) => s.updateFog);
  const updateDrawings = useTable((s) => s.updateDrawings);
  const patchScene = useTable((s) => s.patchScene);
  const toast = useToast();

  // Mise a l'echelle (MJ) : le prochain trace sur la carte sert de segment de
  // reference, puis une fenetre demande sa longueur reelle en metres.
  const calibrating = useCalibration((s) => s.active) && isGM;
  const [calibration, setCalibration] = useState(null); // { pixels, meters }
  const calibratingRef = useRef(false);
  calibratingRef.current = calibrating;

  const cancelCalibration = () => {
    stopCalibration();
    setCalibration(null);
    setMeasure(null);
  };
  useEffect(() => {
    if (!calibrating) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') cancelCalibration();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [calibrating]);

  const applyCalibration = async () => {
    const meters = Number(String(calibration?.meters ?? '').replace(',', '.'));
    if (!Number.isFinite(meters) || meters <= 0) return toast('Indiquez une distance en mètres', 'error');
    const patch = scaleFromMeasure(calibration.pixels, meters, scene?.scalePx || 70);
    try {
      await patchScene(patch);
      toast(`Échelle appliquée : ${patch.scalePx} px = ${String(patch.scaleUnits).replace('.', ',')} m`, 'success');
      cancelCalibration();
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  const hostRef = useRef(null);
  const [view, setView] = useState({ x: 0, y: 0, k: 1 });
  const [panning, setPanning] = useState(false);
  const [marquee, setMarquee] = useState(null);
  const [measure, setMeasure] = useState(null);
  const measureTimer = useRef(null);
  const [erasing, setErasing] = useState(null);
  const [strokeDraft, setStrokeDraft] = useState(null);
  const [fogDraft, setFogDraft] = useState(null);
  const [localDrag, setLocalDrag] = useState({});
  const dragState = useRef(null);

  /** Longueur de reference de la scene : scalePx pixels valent scaleUnits unites.
   *  Sert d'echelle pour les distances et de taille par defaut d'un pion. */
  const scalePx = scene?.scalePx || 70;

  /** Miroir client de assertCanEdit (server/src/routes/tokens.js) : un joueur ne
   *  deplace que les pions qu'il possede ou lies a un de ses personnages. */
  const ownedCharacterIds = useMemo(
    () => new Set(characters.filter((c) => c.ownerId === me?.id).map((c) => c.id)),
    [characters, me],
  );
  const canMoveToken = useCallback(
    (token) => {
      if (isGM) return true;
      if (token.locked) return false;
      if (token.ownerId === me?.id) return true;
      return Boolean(token.characterId && ownedCharacterIds.has(token.characterId));
    },
    [isGM, me, ownedCharacterIds],
  );

  /** Un pion "possede" reste visible pour son joueur meme dans le brouillard. */
  const isTokenOwned = useCallback(
    (token) =>
      token.ownerId === me?.id || Boolean(token.characterId && ownedCharacterIds.has(token.characterId)),
    [me, ownedCharacterIds],
  );

  /** Determine si un point de la scene tombe dans une zone de brouillard non revelee,
   *  en reproduisant l'ordre d'empilement des rectangles utilise par le masque SVG. */
  const isTokenFogged = useCallback(
    (token) => {
      if (!scene?.fogEnabled) return false;
      const cx = token.x + (token.width || 0) / 2;
      const cy = token.y + (token.height || 0) / 2;
      let hidden = true;
      for (const rect of scene.fogReveals || []) {
        const rx = Math.min(rect.x, rect.x + (rect.w ?? 0));
        const ry = Math.min(rect.y, rect.y + (rect.h ?? 0));
        const rw = Math.abs(rect.w ?? 0);
        const rh = Math.abs(rect.h ?? 0);
        if (cx >= rx && cx <= rx + rw && cy >= ry && cy <= ry + rh) {
          hidden = rect.mode !== 'reveal';
        }
      }
      return hidden;
    },
    [scene?.fogEnabled, scene?.fogReveals],
  );

  /* --- Conversions écran <-> scene --------------------------------------- */

  /** Vue courante lue au moment de l'evenement : les gestes en cours (mesure,
   *  dessin, glisser) restent justes meme si on zoome ou deplace la carte pendant. */
  const liveView = useRef(view);
  liveView.current = view;

  const toScene = useCallback((clientX, clientY) => {
    const rect = hostRef.current.getBoundingClientRect();
    const v = liveView.current;
    return {
      x: (clientX - rect.left - v.x) / v.k,
      y: (clientY - rect.top - v.y) / v.k,
    };
  }, []);

  /** Recentre la carte dans la fenetre. Ne depend que des dimensions de la scene :
   *  un dessin ou une modif de brouillard ne doit pas reinitialiser le zoom. */
  const sceneWidth = scene?.width;
  const sceneHeight = scene?.height;
  const fitToScreen = useCallback(() => {
    if (!sceneWidth || !sceneHeight || !hostRef.current) return;
    const rect = hostRef.current.getBoundingClientRect();
    const k = clamp(Math.min(rect.width / sceneWidth, rect.height / sceneHeight) * 0.94, MIN_SCALE, MAX_SCALE);
    setView({ k, x: (rect.width - sceneWidth * k) / 2, y: (rect.height - sceneHeight * k) / 2 });
  }, [sceneWidth, sceneHeight]);

  /** Un joueur ne gomme que ses propres traits ; le MJ gomme tout. */
  const canErase = useCallback((stroke) => isGM || (stroke.ownerId && stroke.ownerId === me?.id), [isGM, me]);

  useEffect(() => {
    fitToScreen();
  }, [scene?.id, fitToScreen]);

  useEffect(() => () => clearTimeout(measureTimer.current), []);

  useEffect(() => {
    if (!viewRef) return;
    viewRef.current = {
      fit: fitToScreen,
      zoomBy: (factor) => setView((v) => ({ ...v, k: clamp(v.k * factor, MIN_SCALE, MAX_SCALE) })),
      centerOn: (x, y) => {
        const rect = hostRef.current.getBoundingClientRect();
        setView((v) => ({ ...v, x: rect.width / 2 - x * v.k, y: rect.height / 2 - y * v.k }));
      },
      toScene,
      get scale() {
        return view.k;
      },
    };
  }, [viewRef, fitToScreen, view.k, toScene]);

  /* --- Zoom molette ------------------------------------------------------- */

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;
    const onWheel = (e) => {
      e.preventDefault();
      const rect = host.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      setView((v) => {
        const k = clamp(v.k * Math.exp(-e.deltaY * 0.0016), MIN_SCALE, MAX_SCALE);
        const ratio = k / v.k;
        return { k, x: px - (px - v.x) * ratio, y: py - (py - v.y) * ratio };
      });
    };
    host.addEventListener('wheel', onWheel, { passive: false });
    return () => host.removeEventListener('wheel', onWheel);
  }, []);

  /* --- Interactions pointeur --------------------------------------------- */

  const startPan = (e) => {
    setPanning(true);
    const origin = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y };
    const onMove = (ev) =>
      setView((v) => ({ ...v, x: origin.vx + ev.clientX - origin.x, y: origin.vy + ev.clientY - origin.y }));
    const onUp = () => {
      setPanning(false);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const onBackgroundPointerDown = (e) => {
    if (e.button === 1 || e.button === 2 || tool === 'pan' || e.altKey) {
      e.preventDefault();
      return startPan(e);
    }
    if (e.button !== 0) return;
    const point = toScene(e.clientX, e.clientY);

    if (tool === 'ping') {
      ping(point.x, point.y, isGM);
      return;
    }
    if (tool === 'measure' || calibrating) {
      // Annule l'effacement programme par la mesure precedente, sinon il
      // ferait disparaitre celle-ci en plein trace.
      clearTimeout(measureTimer.current);
      setMeasure({ from: point, to: point });
      let last = point;
      const onMove = (ev) => {
        last = toScene(ev.clientX, ev.clientY);
        setMeasure((m) => (m ? { ...m, to: last } : m));
      };
      const onUp = () => {
        const pixels = Math.hypot(last.x - point.x, last.y - point.y);
        if (calibratingRef.current && pixels >= 5) {
          // Le segment reste affiche pendant que le MJ saisit sa longueur.
          setCalibration({ pixels, meters: '' });
        } else {
          measureTimer.current = setTimeout(() => setMeasure(null), 1500);
        }
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      return;
    }
    if (tool === 'draw' && brush.shape === 'eraser') {
      const tolerance = 8 / liveView.current.k;
      const erased = new Set();
      let last = point;
      // Le pointeur peut sauter de plusieurs pixels entre deux evenements : on
      // echantillonne le segment parcouru pour ne pas passer a travers un trait.
      const hit = (p) => {
        const steps = Math.max(1, Math.ceil(Math.hypot(p.x - last.x, p.y - last.y) / tolerance));
        let changed = false;
        for (let i = 1; i <= steps; i += 1) {
          const q = { x: last.x + ((p.x - last.x) * i) / steps, y: last.y + ((p.y - last.y) * i) / steps };
          for (const stroke of scene.drawings || []) {
            if (erased.has(stroke.id) || !(isGM || stroke.layer !== 'GM') || !canErase(stroke)) continue;
            if (strokeDistance(stroke, q) <= stroke.width / 2 + tolerance) {
              erased.add(stroke.id);
              changed = true;
            }
          }
        }
        last = p;
        if (changed) setErasing(new Set(erased));
      };
      hit(point);
      const onMove = (ev) => hit(toScene(ev.clientX, ev.clientY));
      const onUp = () => {
        if (erased.size) updateDrawings({ remove: [...erased] }).catch(() => {});
        setErasing(null);
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      return;
    }
    if (tool === 'draw') {
      const stroke = {
        ownerId: me?.id,
        id: uid(),
        tool: brush.shape,
        color: brush.color,
        width: brush.width,
        layer: brush.gmOnly ? 'GM' : 'ALL',
        points: [point.x, point.y],
      };
      setStrokeDraft(stroke);
      const onMove = (ev) => {
        const p = toScene(ev.clientX, ev.clientY);
        setStrokeDraft((s) => {
          if (!s) return s;
          if (s.tool === 'pen') return { ...s, points: [...s.points, p.x, p.y] };
          return { ...s, points: [s.points[0], s.points[1], p.x, p.y] };
        });
      };
      const onUp = () => {
        setStrokeDraft((s) => {
          if (s && s.points.length >= 4) {
            updateDrawings({ add: [s] }).catch(() => {});
          }
          return null;
        });
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      return;
    }
    if ((tool === 'fog-reveal' || tool === 'fog-hide') && isGM) {
      const draft = { mode: tool === 'fog-reveal' ? 'reveal' : 'hide', x: point.x, y: point.y, w: 0, h: 0 };
      setFogDraft(draft);
      const onMove = (ev) => {
        const p = toScene(ev.clientX, ev.clientY);
        setFogDraft((f) => (f ? { ...f, w: p.x - f.x, h: p.y - f.y } : f));
      };
      const onUp = () => {
        setFogDraft((f) => {
          if (f && Math.abs(f.w) > 6 && Math.abs(f.h) > 6) {
            const rect = {
              id: uid(),
              mode: f.mode,
              x: Math.min(f.x, f.x + f.w),
              y: Math.min(f.y, f.y + f.h),
              w: Math.abs(f.w),
              h: Math.abs(f.h),
            };
            updateFog([...(scene.fogReveals || []), rect]);
          }
          return null;
        });
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      return;
    }

    // Outil selection : rectangle de selection multiple.
    if (!e.shiftKey) onSelectionChange([]);
    setMarquee({ x: point.x, y: point.y, w: 0, h: 0 });
    const onMove = (ev) => {
      const p = toScene(ev.clientX, ev.clientY);
      setMarquee((m) => (m ? { ...m, w: p.x - m.x, h: p.y - m.y } : m));
    };
    const onUp = () => {
      setMarquee((m) => {
        if (m && (Math.abs(m.w) > 6 || Math.abs(m.h) > 6)) {
          const box = {
            x1: Math.min(m.x, m.x + m.w),
            y1: Math.min(m.y, m.y + m.h),
            x2: Math.max(m.x, m.x + m.w),
            y2: Math.max(m.y, m.y + m.h),
          };
          const hits = tokens
            .filter((t) => t.x + t.width > box.x1 && t.x < box.x2 && t.y + t.height > box.y1 && t.y < box.y2)
            .map((t) => t.id);
          onSelectionChange(hits);
        }
        return null;
      });
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const onTokenPointerDown = (clicked) => (e) => {
    // Hors outil selection (mesure, dessin, ping...), le clic sur un pion est
    // traite comme un clic sur la carte : on peut mesurer depuis un pion.
    if (e.button !== 0 || tool !== 'select' || e.altKey) return;
    e.stopPropagation();
    let token = clicked;
    if (!canMoveToken(token)) {
      // Un pion qu'on ne peut pas bouger (celui du MJ, d'un autre joueur) peut
      // recouvrir le sien : on attrape alors le pion deplacable juste dessous.
      const p = toScene(e.clientX, e.clientY);
      token = [...tokens]
        .sort((a, b) => (b.zIndex ?? 0) - (a.zIndex ?? 0))
        .find(
          (t) =>
            t.id !== clicked.id &&
            canMoveToken(t) &&
            p.x >= t.x && p.x <= t.x + t.width && p.y >= t.y && p.y <= t.y + t.height,
        );
      if (!token) return;
    }

    const nextSelection = e.shiftKey
      ? selection.includes(token.id)
        ? selection.filter((id) => id !== token.id)
        : [...selection, token.id]
      : selection.includes(token.id)
        ? selection
        : [token.id];
    onSelectionChange(nextSelection);

    const start = toScene(e.clientX, e.clientY);
    // Un joueur peut selectionner une zone, mais ne deplace que ses propres
    // pions : les autres pions selectionnes restent en place. Le MJ deplace
    // tout le groupe.
    const moving = tokens.filter((t) => nextSelection.includes(t.id) && canMoveToken(t));
    dragState.current = {
      start,
      origins: moving.map((t) => ({ id: t.id, x: t.x, y: t.y, width: t.width })),
      moved: false,
    };

    const onMove = (ev) => {
      const state = dragState.current;
      if (!state) return;
      const p = toScene(ev.clientX, ev.clientY);
      const dx = p.x - state.start.x;
      const dy = p.y - state.start.y;
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) state.moved = true;
      state.positions = state.origins.map((o) => ({
        id: o.id,
        x: Math.round(o.x + dx),
        y: Math.round(o.y + dy),
      }));
      for (const pos of state.positions) dragToken(pos.id, pos.x, pos.y);
      setLocalDrag({ ...Object.fromEntries(state.positions.map((p2) => [p2.id, p2])) });
    };

    const onUp = async () => {
      const state = dragState.current;
      dragState.current = null;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      setLocalDrag({});
      if (state?.moved && state.positions?.length) {
        await moveTokens(state.positions).catch(() => {});
      }
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  /* --- Rendu --------------------------------------------------------------- */

  const strokes = useMemo(
    () => [
      ...(scene?.drawings || []).filter((d) => !erasing?.has(d.id)),
      ...(strokeDraft ? [strokeDraft] : []),
    ],
    [scene?.drawings, strokeDraft, erasing],
  );

  /** Cercle de portee max (vitesse de deplacement) affiche autour du pion seul
   *  selectionne. Le joueur le voit sur ses propres pions ; le MJ le voit sur
   *  n'importe quel pion qui a une vitesse (la sienne, ou celle du personnage
   *  lie), pour arbitrer les deplacements des PNJ comme des joueurs.
   *  Le cercle reste centre sur la position enregistree pendant le glisser :
   *  il montre jusqu'ou le pion peut aller depuis son point de depart. */
  const rangeRing = useMemo(() => {
    if (selection.length !== 1) return null;
    const token = tokens.find((t) => t.id === selection[0]);
    if (!token || !(isGM || isTokenOwned(token))) return null;
    const character = characters.find((c) => c.id === token.characterId);
    const speed = token.speed ?? character?.speed;
    if (!speed) return null;
    const distance = feetToSceneUnits(speed, scene?.unitLabel);
    // La portee se mesure en cases de 5 ft (1,5 m), et une case = la largeur
    // d'un pion de taille Moyenne. Le cercle suit donc la taille du pion, pas
    // l'echelle de la carte : d'une petite a une grande carte, la meme vitesse
    // donne toujours le meme cercle autour du pion.
    const ratio = Math.min(token.width, token.height) / scalePx;
    const preset = TOKEN_SIZE_FACTORS.find((factor) => Math.abs(ratio - factor) < 0.05);
    // Pion redimensionne a la main : on le considere comme une creature Moyenne.
    const squarePx = Math.min(token.width, token.height) / (preset ?? 1);
    return {
      cx: token.x + token.width / 2,
      cy: token.y + token.height / 2,
      radius: (speed / 5) * squarePx,
      label: `${Math.round(distance * 10) / 10} ${scene?.unitLabel || 'm'}`,
    };
  }, [selection, tokens, isGM, isTokenOwned, characters, scene, scalePx]);

  const fogRects = useMemo(
    () => [...(scene?.fogReveals || []), ...(fogDraft ? [{ ...fogDraft, id: 'draft' }] : [])],
    [scene?.fogReveals, fogDraft],
  );

  /** Pions a rendre : le MJ voit tout, un joueur ne voit pas les pions d'autrui
   *  places dans une zone de brouillard non revelee (son propre pion reste visible). */
  const { belowFogTokens, aboveFogTokens } = useMemo(() => {
    if (isGM) return { belowFogTokens: tokens, aboveFogTokens: [] };
    const below = [];
    const above = [];
    for (const token of tokens) {
      // Le pion du MJ arrive toujours (il place sa voix pour le chat de
      // proximite) mais ne s'affiche que si le MJ l'a rendu visible.
      if (token.isGmPawn && !token.visible) continue;
      const owned = isTokenOwned(token);
      const fogged = isTokenFogged(token);
      if (!owned && fogged) continue;
      if (owned && fogged) above.push(token);
      else below.push(token);
    }
    return { belowFogTokens: below, aboveFogTokens: above };
  }, [tokens, isGM, isTokenOwned, isTokenFogged]);

  const renderTokenSprite = (token) => {
    const ghost = localDrag[token.id] || ghosts[token.id];
    const shown = ghost ? { ...token, x: ghost.x, y: ghost.y } : token;
    return (
      <TokenSprite
        key={token.id}
        token={shown}
        scale={view.k}
        scalePx={scalePx}
        selected={selection.includes(token.id)}
        dimmed={!token.visible}
        onPointerDown={onTokenPointerDown(token)}
        onDoubleClick={(e) => {
          e.stopPropagation();
          onOpenToken?.(token);
        }}
      />
    );
  };

  if (!scene) {
    return (
      <div className="map-host empty-map">
        <div className="empty">
          Aucune scène active.
          <br />
          {isGM ? 'Créez une carte depuis le panneau « Scènes ».' : 'Le MJ préparé la table…'}
        </div>
      </div>
    );
  }

  const measureDistance = measure
    ? Math.round(
        (Math.hypot(measure.to.x - measure.from.x, measure.to.y - measure.from.y) / scalePx) *
          (scene.scaleUnits || 1.5) *
          10,
      ) / 10
    : 0;

  return (
    <div
      ref={hostRef}
      className={`map-host tool-${tool} ${panning ? 'panning' : ''} ${calibrating ? 'calibrating' : ''}`}
      onPointerDown={onBackgroundPointerDown}
      onContextMenu={(e) => e.preventDefault()}
    >
      {calibrating && !calibration ? (
        <div className="calibrate-banner" onPointerDown={(e) => e.stopPropagation()}>
          <span>
            📏 <strong>Mise à l'échelle</strong> : glissez d'un point à l'autre d'une distance connue (un mur, une pièce…).
          </span>
          <button type="button" className="btn xs ghost" onClick={cancelCalibration}>
            Annuler
          </button>
        </div>
      ) : null}
      {/* Le portail de la fenetre remonte ses clics jusqu'a la carte : on les arrete. */}
      <span onPointerDown={(e) => e.stopPropagation()}>
      <Modal
        open={Boolean(calibration)}
        title="Mise à l'échelle"
        size="sm"
        onClose={cancelCalibration}
        footer={
          <>
            <button type="button" className="btn ghost" onClick={cancelCalibration}>
              Annuler
            </button>
            <button type="button" className="btn primary" onClick={applyCalibration}>
              Appliquer
            </button>
          </>
        }
      >
        {calibration ? (
          <div className="field">
            <label>Ce trait mesure combien de mètres en vrai ?</label>
            <input
              className="input"
              type="number"
              min="0"
              step="0.1"
              inputMode="decimal"
              autoFocus
              value={calibration.meters}
              onChange={(e) => setCalibration({ ...calibration, meters: e.target.value })}
              onKeyDown={(e) => e.key === 'Enter' && applyCalibration()}
              placeholder="ex. 6"
            />
            <p className="faint hint">
              Toute la carte prend cette échelle : outil de mesure, portées, voix de proximité et taille des nouveaux
              pions (une case de 1,5 m).
            </p>
          </div>
        ) : null}
      </Modal>
      </span>
      <div
        className="map-stage"
        style={{
          width: scene.width,
          height: scene.height,
          transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})`,
          background: scene.backgroundColor,
        }}
      >
        {scene.backgroundUrl ? (
          <img className="map-bg" src={scene.backgroundUrl} alt="" draggable={false} />
        ) : null}

        <svg className="map-layer" width={scene.width} height={scene.height} aria-hidden="true">
          {strokes
            .filter((s) => isGM || s.layer !== 'GM')
            .map((stroke) => (
              <StrokeShape key={stroke.id} stroke={stroke} gm={stroke.layer === 'GM'} />
            ))}
        </svg>

        <div className="token-layer">{belowFogTokens.map(renderTokenSprite)}</div>

        {scene.fogEnabled ? (
          <svg className="map-layer fog" width={scene.width} height={scene.height} aria-hidden="true">
            <defs>
              <mask id="fog-mask">
                <rect width="100%" height="100%" fill="white" />
                {fogRects.map((r) => (
                  <rect
                    key={r.id}
                    x={Math.min(r.x, r.x + (r.w ?? 0))}
                    y={Math.min(r.y, r.y + (r.h ?? 0))}
                    width={Math.abs(r.w ?? 0)}
                    height={Math.abs(r.h ?? 0)}
                    fill={r.mode === 'hide' ? 'white' : 'black'}
                  />
                ))}
              </mask>
            </defs>
            <rect
              width="100%"
              height="100%"
              fill="#05070a"
              opacity={isGM ? 0.62 : 1}
              mask="url(#fog-mask)"
            />
          </svg>
        ) : null}

        {aboveFogTokens.length ? (
          <div className="token-layer">{aboveFogTokens.map(renderTokenSprite)}</div>
        ) : null}

        {rangeRing ? (
          <svg className="map-layer range-ring" width={scene.width} height={scene.height} aria-hidden="true">
            <circle
              cx={rangeRing.cx}
              cy={rangeRing.cy}
              r={rangeRing.radius}
              fill="rgba(224, 167, 92, 0.08)"
              stroke="#e0a75c"
              strokeWidth={2 / view.k}
              strokeDasharray={`${6 / view.k} ${5 / view.k}`}
            />
            <text
              x={rangeRing.cx}
              y={rangeRing.cy - rangeRing.radius - 6 / view.k}
              textAnchor="middle"
              fontSize={12 / view.k}
              fontWeight="700"
              fill="#e0a75c"
              stroke="rgba(5, 7, 10, 0.85)"
              strokeWidth={3 / view.k}
              paintOrder="stroke"
            >
              {rangeRing.label}
            </text>
          </svg>
        ) : null}

        {marquee ? (
          <div
            className="marquee"
            style={{
              left: Math.min(marquee.x, marquee.x + marquee.w),
              top: Math.min(marquee.y, marquee.y + marquee.h),
              width: Math.abs(marquee.w),
              height: Math.abs(marquee.h),
            }}
          />
        ) : null}

        {fogDraft ? (
          <div
            className={`fog-draft ${fogDraft.mode}`}
            style={{
              left: Math.min(fogDraft.x, fogDraft.x + fogDraft.w),
              top: Math.min(fogDraft.y, fogDraft.y + fogDraft.h),
              width: Math.abs(fogDraft.w),
              height: Math.abs(fogDraft.h),
            }}
          />
        ) : null}

        {measure ? (
          <svg className="map-layer measure" style={{ overflow: 'visible' }} width={scene.width} height={scene.height}>
            <line
              x1={measure.from.x}
              y1={measure.from.y}
              x2={measure.to.x}
              y2={measure.to.y}
              stroke="#e0a75c"
              strokeWidth={3 / view.k}
              strokeDasharray={`${8 / view.k} ${6 / view.k}`}
            />
            <circle cx={measure.from.x} cy={measure.from.y} r={5 / view.k} fill="#e0a75c" />
            <text
              x={(measure.from.x + measure.to.x) / 2}
              y={(measure.from.y + measure.to.y) / 2 - 12 / view.k}
              fill="#ede0c8"
              fontSize={16 / view.k}
              textAnchor="middle"
              style={{ paintOrder: 'stroke', stroke: '#05070a', strokeWidth: 4 / view.k }}
            >
              {measureDistance} {scene.unitLabel || 'm'}
            </text>
          </svg>
        ) : null}

        {reactions.map((r) => {
          const token = tokens.find((t) => t.id === r.tokenId);
          if (!token) return null;
          if (!isGM && !isTokenOwned(token) && isTokenFogged(token)) return null;
          const ghost = localDrag[token.id] || ghosts[token.id];
          const x = (ghost?.x ?? token.x) + (token.width || scalePx) / 2;
          const y = ghost?.y ?? token.y;
          return (
            <span
              key={r.id}
              className="map-reaction"
              style={{ left: x, top: y, fontSize: Math.max((token.width || scalePx) * 0.55, 26 / view.k) }}
            >
              {r.emoji}
            </span>
          );
        })}

        {pings.map((p) => (
          <span key={p.id} className="map-ping" style={{ left: p.x, top: p.y }}>
            <span className="map-ping-ring" />
            <span className="map-ping-label" style={{ fontSize: 12 / view.k }}>
              {p.username}
            </span>
          </span>
        ))}
      </div>

      <div className="zoom-hud">
        <button type="button" className="btn icon sm" onClick={() => setView((v) => ({ ...v, k: clamp(v.k / 1.25, MIN_SCALE, MAX_SCALE) }))} title="Dézoomer">
          −
        </button>
        <span className="mono">{Math.round(view.k * 100)}%</span>
        <button type="button" className="btn icon sm" onClick={() => setView((v) => ({ ...v, k: clamp(v.k * 1.25, MIN_SCALE, MAX_SCALE) }))} title="Zoomer">
          +
        </button>
        <button type="button" className="btn sm" onClick={fitToScreen} title="Ajuster à l'écran">
          Ajuster
        </button>
      </div>
    </div>
  );
}

/** Distance d'un point au trace d'un dessin, en pixels de scene (pour la gomme). */
function strokeDistance(stroke, p) {
  const pts = stroke.points || [];
  const [x1, y1, x2, y2] = pts;
  if (stroke.tool === 'circle') {
    return Math.abs(Math.hypot(p.x - x1, p.y - y1) - Math.hypot(x2 - x1, y2 - y1));
  }
  if (stroke.tool === 'rect') {
    const corners = [x1, y1, x2, y1, x2, y2, x1, y2, x1, y1];
    return polylineDistance(corners, p);
  }
  return polylineDistance(pts, p);
}

function polylineDistance(pts, p) {
  if (pts.length < 2) return Infinity;
  let best = Math.hypot(p.x - pts[0], p.y - pts[1]);
  for (let i = 0; i + 3 < pts.length; i += 2) {
    const [ax, ay, bx, by] = [pts[i], pts[i + 1], pts[i + 2], pts[i + 3]];
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    const t = len2 ? clamp(((p.x - ax) * dx + (p.y - ay) * dy) / len2, 0, 1) : 0;
    best = Math.min(best, Math.hypot(p.x - (ax + t * dx), p.y - (ay + t * dy)));
  }
  return best;
}

function StrokeShape({ stroke, gm }) {
  const common = {
    stroke: stroke.color,
    strokeWidth: stroke.width,
    fill: 'none',
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    opacity: gm ? 0.75 : 1,
    strokeDasharray: gm ? `${stroke.width * 3} ${stroke.width * 2}` : undefined,
  };
  const [x1, y1, x2, y2] = stroke.points;

  if (stroke.tool === 'rect') {
    return (
      <rect
        {...common}
        x={Math.min(x1, x2)}
        y={Math.min(y1, y2)}
        width={Math.abs(x2 - x1)}
        height={Math.abs(y2 - y1)}
      />
    );
  }
  if (stroke.tool === 'circle') {
    return <circle {...common} cx={x1} cy={y1} r={Math.hypot(x2 - x1, y2 - y1)} />;
  }
  if (stroke.tool === 'line') {
    return <line {...common} x1={x1} y1={y1} x2={x2} y2={y2} />;
  }
  const d = stroke.points.reduce(
    (acc, value, index) => (index % 2 === 0 ? `${acc} ${index === 0 ? 'M' : 'L'} ${value}` : `${acc} ${value}`),
    '',
  );
  return <path {...common} d={d} />;
}
