import { For, Show, createSignal } from 'solid-js';
import { Portal } from 'solid-js/web';

export interface ToastItem {
  id: number;
  text: string;
  tone: 'info' | 'ok' | 'error';
}

const [toasts, setToasts] = createSignal<ToastItem[]>([]);
let seq = 0;

export function toast(text: string, tone: ToastItem['tone'] = 'info', ms = 3600): void {
  const id = ++seq;
  setToasts((list) => [...list, { id, text, tone }]);
  setTimeout(() => {
    setToasts((list) => list.filter((t) => t.id !== id));
  }, ms);
}

export function ToastHost() {
  return (
    <div class="toast-wrap">
      <For each={toasts()}>
        {(t) => (
          <div class={`toast ${t.tone}`} onClick={() => setToasts((list) => list.filter((x) => x.id !== t.id))}>
            {t.text}
          </div>
        )}
      </For>
    </div>
  );
}

export interface ModalProps {
  title: string;
  wide?: boolean;
  onClose: () => void;
  children: unknown;
  footer?: unknown;
}

export function Modal(props: ModalProps) {
  return (
    <Portal>
      <div
        class="modal-backdrop"
        onClick={(e) => {
          if (e.target === e.currentTarget) props.onClose();
        }}
      >
        <div class={`modal ${props.wide ? 'wide' : ''}`} role="dialog" aria-label={props.title}>
          <div class="modal-head">
            <h2 style={{ flex: 1 }}>{props.title}</h2>
            <button class="ghost icon" onClick={props.onClose} title="关闭">
              ✕
            </button>
          </div>
          <div class="modal-body">{props.children as never}</div>
          <Show when={props.footer}>
            <div class="modal-foot">{props.footer as never}</div>
          </Show>
        </div>
      </div>
    </Portal>
  );
}

export interface ConfirmOptions {
  title: string;
  body: string;
  confirmText?: string;
  tone?: 'primary' | 'danger';
}

export function ConfirmDialog(props: ConfirmOptions & { onResolve: (ok: boolean) => void }) {
  return (
    <Modal
      title={props.title}
      onClose={() => props.onResolve(false)}
      footer={
        <>
          <button onClick={() => props.onResolve(false)}>取消</button>
          <button class={props.tone === 'danger' ? 'danger' : 'primary'} onClick={() => props.onResolve(true)}>
            {props.confirmText ?? '确定'}
          </button>
        </>
      }
    >
      <p style={{ margin: 0, 'line-height': 1.65, color: 'var(--text-1)' }}>{props.body}</p>
    </Modal>
  );
}
