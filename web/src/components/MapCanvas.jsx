import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth, useTable } from '../lib/store.js';
import { TokenSprite } from './TokenSprite.jsx';

const MIN_SCALE = 0.12;
const MAX_SCALE = 4;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const uid = () => Math.random().toString(36).slice(2, 10);

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
  const isGM = useTable((s) => s.isGM);
  const me = useAuth((s) => s.user);
  const moveTokens = useTable((s) => s.moveTokens);
  const dragToken = useTable((s) => s.dragToken);
  const ping = useTable((s) => s.ping);
  const updateFog = useTable((s) => s.updateFog);
  const updateDrawings = useTable((s) => s.updateDrawings);

  const hostRef = useRef(null);
  const [view, setView] = useState({ x: 0, y: 0, k: 1 });
  const [panning, setPanning] = useState(false);
  const [marquee, setMarquee] = useState(null);
  const [measure, setMeasure] = useState(null);
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

  const toScene = useCallback(
    (clientX, clientY) => {
      const rect = hostRef.current.getBoundingClientRect();
      return {
        x: (clientX - rect.left - view.x) / view.k,
        y: (clientY - rect.top - view.y) / view.k,
      };
    },
    [view],
  );

  /** Recentre la carte dans la fenetre. */
  const fitToScreen = useCallback(() => {
    if (!scene || !hostRef.current) return;
    const rect = hostRef.current.getBoundingClientRect();
    const k = clamp(Math.min(rect.width / scene.width, rect.height / scene.height) * 0.94, MIN_SCALE, MAX_SCALE);
    setView({ k, x: (rect.width - scene.width * k) / 2, y: (rect.height - scene.height * k) / 2 });
  }, [scene]);

  useEffect(() => {
    fitToScreen();
  }, [scene?.id, fitToScreen]);

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
    if (tool === 'measure') {
      setMeasure({ from: point, to: point });
      const onMove = (ev) => setMeasure((m) => (m ? { ...m, to: toScene(ev.clientX, ev.clientY) } : m));
      const onUp = () => {
        setTimeout(() => setMeasure(null), 1200);
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      return;
    }
    if (tool === 'draw') {
      const stroke = {
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
            updateDrawings([...(scene.drawings || []), s]);
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

  const onTokenPointerDown = (token) => (e) => {
    if (e.button !== 0 || tool === 'pan' || e.altKey) return;
    e.stopPropagation();
    if (!canMoveToken(token)) return;

    const nextSelection = e.shiftKey
      ? selection.includes(token.id)
        ? selection.filter((id) => id !== token.id)
        : [...selection, token.id]
      : selection.includes(token.id)
        ? selection
        : [token.id];
    onSelectionChange(nextSelection);

    if (tool !== 'select') return;

    const start = toScene(e.clientX, e.clientY);
    const moving = tokens.filter((t) => nextSelection.includes(t.id));
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
    () => [...(scene?.drawings || []), ...(strokeDraft ? [strokeDraft] : [])],
    [scene?.drawings, strokeDraft],
  );

  /** Cercle de portee max (vitesse de deplacement) affiche autour du pion seul
   *  selectionne. Le joueur le voit sur ses propres pions ; le MJ le voit sur
   *  n'importe quel pion lie a un personnage, pour arbitrer les deplacements. */
  const rangeRing = useMemo(() => {
    if (selection.length !== 1) return null;
    const token = tokens.find((t) => t.id === selection[0]);
    if (!token || !(isGM || isTokenOwned(token))) return null;
    const character = characters.find((c) => c.id === token.characterId);
    if (!character?.speed) return null;
    const ghost = localDrag[token.id] || ghosts[token.id];
    return {
      cx: (ghost ? ghost.x : token.x) + token.width / 2,
      cy: (ghost ? ghost.y : token.y) + token.height / 2,
      radius: (character.speed / 5) * scalePx,
    };
  }, [selection, tokens, isGM, isTokenOwned, characters, localDrag, ghosts, scalePx]);

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
          (scene.scaleUnits || 1.5),
      )
    : 0;

  return (
    <div
      ref={hostRef}
      className={`map-host tool-${tool} ${panning ? 'panning' : ''}`}
      onPointerDown={onBackgroundPointerDown}
      onContextMenu={(e) => e.preventDefault()}
    >
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
          <svg className="map-layer measure" width={scene.width} height={scene.height}>
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
