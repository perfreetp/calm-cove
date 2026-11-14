import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export function Modal({
  title,
  subtitle,
  children,
  footer,
  onClose,
  width,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  onClose: () => void;
  width?: number;
}) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);
  return createPortal(
    <div className="modal-back" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" style={{ width: width ?? 560 }} role="dialog" aria-modal>
        <div className="modal-head">
          <div style={{ flex: 1 }}>
            <h2>{title}</h2>
            {subtitle && <div className="tiny dim" style={{ marginTop: 4 }}>{subtitle}</div>}
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="关闭">
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
              <path d="M6.5 6.5 17.5 17.5M17.5 6.5 6.5 17.5" />
            </svg>
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

let toastSeq = 0;
const listeners = new Set<(t: Toast) => void>();
interface Toast {
  id: number;
  msg: string;
  type: 'ok' | 'err' | 'info';
}

export function toast(msg: string, type: 'ok' | 'err' | 'info' = 'ok') {
  const t = { id: ++toastSeq, msg, type };
  listeners.forEach((l) => l(t));
}

export function ToastHost() {
  const [items, setItems] = useState<Toast[]>([]);
  const timers = useRef<Map<number, number>>(new Map());
  useEffect(() => {
    const l = (t: Toast) => {
      setItems((prev) => [...prev.slice(-3), t]);
      const id = window.setTimeout(() => {
        setItems((prev) => prev.filter((x) => x.id !== t.id));
        timers.current.delete(t.id);
      }, 2600);
      timers.current.set(t.id, id);
    };
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);
  return createPortal(
    <div className="toast-wrap">
      {items.map((t) => (
        <div key={t.id} className={`toast ${t.type}`}>
          <span
            className="dot"
            style={{
              background: t.type === 'ok' ? '#4fd1c5' : t.type === 'err' ? '#e8624f' : '#6aa6e8',
              boxShadow: `0 0 8px ${t.type === 'ok' ? '#4fd1c5' : t.type === 'err' ? '#e8624f' : '#6aa6e8'}`,
            }}
          />
          {t.msg}
        </div>
      ))}
    </div>,
    document.body,
  );
}

export function Seg<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (v: T) => void;
}) {
  return (
    <div className="seg">
      {options.map((o) => (
        <button key={o.value} className={o.value === value ? 'on' : ''} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="field">
      <label>{label}</label>
      {children}
      {hint && <div className="hint">{hint}</div>}
    </div>
  );
}

export function Stat({
  label,
  value,
  unit,
  sub,
  accent,
}: {
  label: string;
  value: React.ReactNode;
  unit?: string;
  sub?: React.ReactNode;
  accent?: string;
}) {
  return (
    <div className="stat">
      <div className="lbl">{label}</div>
      <div className="val" style={accent ? { color: accent } : undefined}>
        {value}
        {unit && <small>{unit}</small>}
      </div>
      {sub && <div className="sub">{sub}</div>}
    </div>
  );
}
