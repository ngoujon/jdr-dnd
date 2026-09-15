import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/* ------------------------------------------------------------- Notices --- */

const ToastContext = createContext(() => {});
export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const push = useCallback((message, tone = 'info') => {
    const id = Math.random().toString(36).slice(2);
    setToasts((list) => [...list, { id, message, tone }]);
    setTimeout(() => setToasts((list) => list.filter((t) => t.id !== id)), 4200);
  }, []);

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="toast-stack">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast ${toast.tone}`} role="status">
            {toast.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/* --------------------------------------------------------------- Modal --- */

export function Modal({ open, title, onClose, children, footer, size = 'md' }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return createPortal(
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className={`modal ${size}`} role="dialog" aria-modal="true" aria-label={title}>
        <header className="modal-head">
          <h3>{title}</h3>
          <button type="button" className="btn ghost icon" onClick={onClose} aria-label="Fermer">
            ✕
          </button>
        </header>
        <div className="modal-body scroll">{children}</div>
        {footer ? <footer className="modal-foot">{footer}</footer> : null}
      </div>
    </div>,
    document.body,
  );
}

/** Demande de confirmation, en remplacement de window.confirm. */
export function useConfirm() {
  const [request, setRequest] = useState(null);

  const confirm = useCallback(
    (options) => new Promise((resolve) => setRequest({ ...options, resolve })),
    [],
  );

  const node = request ? (
    <Modal
      open
      size="sm"
      title={request.title || 'Confirmer'}
      onClose={() => {
        request.resolve(false);
        setRequest(null);
      }}
      footer={
        <>
          <button
            type="button"
            className="btn ghost"
            onClick={() => {
              request.resolve(false);
              setRequest(null);
            }}
          >
            Annuler
          </button>
          <button
            type="button"
            className={`btn ${request.danger ? 'danger' : 'primary'}`}
            onClick={() => {
              request.resolve(true);
              setRequest(null);
            }}
          >
            {request.confirmLabel || 'Confirmer'}
          </button>
        </>
      }
    >
      <p className="muted" style={{ margin: 0 }}>
        {request.message}
      </p>
    </Modal>
  ) : null;

  return [confirm, node];
}

/* -------------------------------------------------------------- Divers --- */

const AVATAR_HUES = ['#b5443a', '#4f8a52', '#4a6fbd', '#c9a441', '#7a5fd0', '#c56ba0', '#3f8f8a', '#c47a3f'];

export function Avatar({ name = '?', url, size = 32, ring }) {
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
  const hue = AVATAR_HUES[[...name].reduce((a, c) => a + c.charCodeAt(0), 0) % AVATAR_HUES.length];
  return (
    <span
      className="avatar"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.4,
        background: url ? `center/cover url(${url})` : hue,
        boxShadow: ring ? `0 0 0 2px ${ring}` : undefined,
      }}
      title={name}
    >
      {url ? '' : initials}
    </span>
  );
}

export function Tabs({ tabs, value, onChange, compact }) {
  return (
    <div className={`tabs ${compact ? 'compact' : ''}`} role="tablist">
      {tabs.map((tab) => (
        <button
          key={tab.key}
          type="button"
          role="tab"
          aria-selected={value === tab.key}
          className={`tab ${value === tab.key ? 'active' : ''}`}
          onClick={() => onChange(tab.key)}
        >
          {tab.icon ? <span className="tab-icon">{tab.icon}</span> : null}
          <span>{tab.label}</span>
          {tab.badge ? <span className="tab-badge">{tab.badge}</span> : null}
        </button>
      ))}
    </div>
  );
}

/** Champ qui ne remonte la valeur qu'à la validation (évite un aller-retour réseau par frappe). */
export function LazyInput({ value, onCommit, as = 'input', className = 'input', ...rest }) {
  const [draft, setDraft] = useState(value ?? '');
  const touched = useRef(false);

  useEffect(() => {
    if (!touched.current) setDraft(value ?? '');
  }, [value]);

  const commit = () => {
    touched.current = false;
    if ((draft ?? '') !== (value ?? '')) onCommit(draft);
  };

  const Component = as;
  return (
    <Component
      {...rest}
      className={className}
      value={draft}
      onChange={(e) => {
        touched.current = true;
        setDraft(e.target.value);
      }}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && as !== 'textarea') e.currentTarget.blur();
        if (e.key === 'Escape') {
          touched.current = false;
          setDraft(value ?? '');
          e.currentTarget.blur();
        }
        rest.onKeyDown?.(e);
      }}
    />
  );
}

export function NumberStepper({ value, onChange, min = -99, max = 999, className = '' }) {
  return (
    <div className={`stepper ${className}`}>
      <button type="button" className="btn xs" onClick={() => onChange(Math.max(min, value - 1))}>
        −
      </button>
      <input
        className="input sm center"
        type="number"
        value={value}
        onChange={(e) => onChange(Math.max(min, Math.min(max, Number(e.target.value) || 0)))}
      />
      <button type="button" className="btn xs" onClick={() => onChange(Math.min(max, value + 1))}>
        +
      </button>
    </div>
  );
}

export function Spinner({ label = 'Chargement…' }) {
  return (
    <div className="spinner-wrap">
      <span className="spinner" aria-hidden="true" />
      <span className="muted">{label}</span>
    </div>
  );
}

/** Rendu minimal de Markdown (titres, gras, italique, listes, liens). */
export function RichText({ text = '' }) {
  const html = useMemo(() => {
    const escape = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
    return escape(text)
      .replace(/^### (.+)$/gm, '<h4>$1</h4>')
      .replace(/^## (.+)$/gm, '<h3>$1</h3>')
      .replace(/^# (.+)$/gm, '<h2>$1</h2>')
      .replace(/^\s*[-*] (.+)$/gm, '<li>$1</li>')
      .replace(/(<li>[\s\S]*?<\/li>)(?!\s*<li>)/g, '<ul>$1</ul>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|\W)\*([^*\n]+)\*/g, '$1<em>$2</em>')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
      .replace(/\n{2,}/g, '<br/><br/>')
      .replace(/\n/g, '<br/>');
  }, [text]);
  return <div className="rich" dangerouslySetInnerHTML={{ __html: html }} />;
}
