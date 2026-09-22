import { memo } from 'react';
import { CONDITIONS } from '../lib/dnd.js';

const conditionMeta = (key) => CONDITIONS.find((c) => c.key === key);

/** Pion pose sur la carte : image ou pastille generee, nom, vie, états. */
function TokenSpriteBase({ token, scale, selected, dimmed, onPointerDown, onDoubleClick, gridSize }) {
  const style = token.style || {};
  const hasImage = Boolean(token.imageUrl);
  const hpRatio =
    token.maxHp && token.maxHp > 0 ? Math.max(0, Math.min(1, (token.hp ?? 0) / token.maxHp)) : null;
  const hpColor = hpRatio === null ? '#57a866' : hpRatio > 0.5 ? '#57a866' : hpRatio > 0.25 ? '#d9a441' : '#d0574c';
  const conditions = (token.conditions || []).map(conditionMeta).filter(Boolean);

  return (
    <div
      className={`token ${selected ? 'selected' : ''} ${dimmed ? 'dimmed' : ''} ${token.visible ? '' : 'hidden-token'}`}
      style={{
        left: token.x,
        top: token.y,
        width: token.width,
        height: token.height,
        transform: `rotate(${token.rotation || 0}deg)`,
        zIndex: token.zIndex ?? 0,
      }}
      onPointerDown={onPointerDown}
      onDoubleClick={onDoubleClick}
      data-token-id={token.id}
    >
      {token.auraRadius > 0 ? (
        <span
          className="token-aura"
          style={{
            width: token.width + token.auraRadius * 2,
            height: token.height + token.auraRadius * 2,
            background: `radial-gradient(circle, ${token.auraColor}33 0%, ${token.auraColor}18 60%, transparent 72%)`,
            borderColor: `${token.auraColor}66`,
          }}
        />
      ) : null}

      <span
        className={`token-body ${style.shape === 'square' ? 'square' : ''}`}
        style={{
          background: hasImage
            ? `center/cover no-repeat url("${token.imageUrl}")`
            : style.fill || 'linear-gradient(160deg, #3d4759, #232b38)',
          borderColor: style.ring || (selected ? 'var(--brass-bright)' : 'rgba(0,0,0,0.55)'),
        }}
      >
        {!hasImage && style.glyph ? (
          <span
            className="token-glyph"
            style={{ color: style.glyphColor || '#ede0c8', fontSize: Math.min(token.width, token.height) * 0.68 }}
          >
            {style.glyph}
          </span>
        ) : null}
      </span>

      {token.showHealthBar && hpRatio !== null ? (
        <span className="token-hp">
          <span style={{ width: `${hpRatio * 100}%`, background: hpColor }} />
        </span>
      ) : null}

      {conditions.length ? (
        <span className="token-conditions">
          {conditions.slice(0, 6).map((c) => (
            <span key={c.key} title={c.label} style={{ background: c.color }}>
              {c.icon}
            </span>
          ))}
        </span>
      ) : null}

      {token.showNameplate && token.name ? (
        <span className="token-name" style={{ fontSize: Math.max(9, Math.min(14, gridSize * 0.17)) / scale }}>
          {token.name}
        </span>
      ) : null}
    </div>
  );
}

export const TokenSprite = memo(TokenSpriteBase);
