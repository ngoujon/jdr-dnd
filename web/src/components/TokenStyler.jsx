const PALETTE = [
  '#b5443a', '#c47a3f', '#d9a441', '#4f8a52', '#3f8f8a', '#4a6fbd',
  '#7a5fd0', '#c56ba0', '#8c3b2a', '#5c6470', '#6f7d84', '#2f3a4a',
];

const RINGS = ['#e8d9b5', '#d9a441', '#c3ccd6', '#a33b2f', '#4f8a52', '#7a5fd0', '#1b1f27'];

const GLYPHS = ['⚔︎', '❂', '➹', '✦', '☠︎', '✧', '♜', '❦', '☾︎', '✷', '◈', '♆', '⚑︎', '⚗︎', '☘︎', '✵'];

/** Petite pastille rendant le style courant (identique au pion sur la carte). */
export function StyledToken({ style = {}, imageUrl, name = '', size = 72 }) {
  return (
    <span
      className={`styled-token ${style.shape === 'square' ? 'square' : ''}`}
      style={{
        width: size,
        height: size,
        background: imageUrl
          ? `center/cover no-repeat url("${imageUrl}")`
          : style.fill || 'linear-gradient(160deg, #3d4759, #232b38)',
        borderColor: style.ring || '#e8d9b5',
        borderWidth: Math.max(2, size * 0.055),
      }}
    >
      {!imageUrl ? (
        <span style={{ color: style.glyphColor || '#ede0c8', fontSize: size * 0.42 }}>
          {style.glyph || name?.[0]?.toUpperCase() || '?'}
        </span>
      ) : null}
    </span>
  );
}

/**
 * Editeur d'apparence : forme, couleurs, emblème et images. Le meme objet
 * `style` est applique au portrait de la fiche et au pion sur la carte.
 */
export function TokenStyler({
  style,
  portraitUrl,
  tokenUrl,
  name,
  editable,
  onChange,
  onPickPortrait,
  onPickToken,
  onClearPortrait,
  onClearToken,
}) {
  const set = (patch) => editable && onChange({ ...style, ...patch });

  return (
    <div className="styler">
      <section className="card pad styler-preview">
        <div className="col" style={{ alignItems: 'center', gap: 8 }}>
          <span className="label">Portrait</span>
          <StyledToken style={style} imageUrl={portraitUrl} name={name} size={110} />
          <div className="row" style={{ gap: 6 }}>
            <button type="button" className="btn xs" onClick={onPickPortrait} disabled={!editable}>
              Choisir
            </button>
            {portraitUrl ? (
              <button type="button" className="btn xs ghost" onClick={onClearPortrait} disabled={!editable}>
                Retirer
              </button>
            ) : null}
          </div>
        </div>

        <div className="col" style={{ alignItems: 'center', gap: 8 }}>
          <span className="label">Pion sur la carte</span>
          <StyledToken style={style} imageUrl={tokenUrl || portraitUrl} name={name} size={110} />
          <div className="row" style={{ gap: 6 }}>
            <button type="button" className="btn xs" onClick={onPickToken} disabled={!editable}>
              Choisir
            </button>
            {tokenUrl ? (
              <button type="button" className="btn xs ghost" onClick={onClearToken} disabled={!editable}>
                Retirer
              </button>
            ) : null}
          </div>
        </div>
      </section>

      <section className="card pad">
        <h4 className="panel-title">Forme</h4>
        <div className="seg small">
          <button type="button" className={style.shape !== 'square' ? 'active' : ''} onClick={() => set({ shape: 'circle' })}>
            Ronde
          </button>
          <button type="button" className={style.shape === 'square' ? 'active' : ''} onClick={() => set({ shape: 'square' })}>
            Carrée
          </button>
        </div>

        <h4 className="panel-title" style={{ marginTop: 14 }}>
          Couleur de fond
        </h4>
        <div className="swatch-grid">
          {PALETTE.map((color) => {
            const fill = `radial-gradient(circle at 34% 28%, ${color}dd, ${color} 55%, #000000aa)`;
            return (
              <button
                key={color}
                type="button"
                className={`swatch ${style.fill === fill ? 'active' : ''}`}
                style={{ background: fill }}
                onClick={() => set({ fill, accent: color })}
                aria-label={`Fond ${color}`}
              />
            );
          })}
        </div>

        <h4 className="panel-title" style={{ marginTop: 14 }}>
          Bordure
        </h4>
        <div className="swatch-grid">
          {RINGS.map((color) => (
            <button
              key={color}
              type="button"
              className={`swatch ${style.ring === color ? 'active' : ''}`}
              style={{ background: color }}
              onClick={() => set({ ring: color })}
              aria-label={`Bordure ${color}`}
            />
          ))}
        </div>

        <h4 className="panel-title" style={{ marginTop: 14 }}>
          Emblème
        </h4>
        <div className="glyph-grid">
          {GLYPHS.map((glyph) => (
            <button
              key={glyph}
              type="button"
              className={`glyph-btn ${style.glyph === glyph ? 'active' : ''}`}
              onClick={() => set({ glyph: style.glyph === glyph ? '' : glyph })}
            >
              {glyph}
            </button>
          ))}
        </div>

        <div className="row" style={{ gap: 10, marginTop: 12 }}>
          <label className="field" style={{ flex: 1 }}>
            <span className="label">Couleur de l'emblème</span>
            <input
              className="input color"
              type="color"
              value={style.glyphColor || '#ede0c8'}
              onChange={(e) => set({ glyphColor: e.target.value })}
              disabled={!editable}
            />
          </label>
          <button type="button" className="btn sm" onClick={() => set({ shape: 'circle', fill: '', ring: '', glyph: '', glyphColor: '' })} disabled={!editable}>
            Réinitialiser
          </button>
        </div>
      </section>
    </div>
  );
}
