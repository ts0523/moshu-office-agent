import { CheckCircle2, AlertTriangle, XCircle, Info, X } from 'lucide-react';
import { useStore } from '../store';

export function Toasts() {
  const toasts = useStore((s) => s.toasts);
  const dismiss = useStore((s) => s.dismissToast);

  return (
    <div className="toast-stack">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast toast-${toast.tone ?? 'default'}`}>
          <span className="toast-icon">
            {toast.tone === 'ok' ? <CheckCircle2 size={15} /> : toast.tone === 'warn' ? <AlertTriangle size={15} /> : toast.tone === 'error' ? <XCircle size={15} /> : <Info size={15} />}
          </span>
          <span className="toast-text">{toast.text}</span>
          <button onClick={() => dismiss(toast.id)}><X size={12} /></button>
        </div>
      ))}
    </div>
  );
}
