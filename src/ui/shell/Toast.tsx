import { useEffect, useState } from 'react';
import { useViewer } from '../../state/store';

export function Toast() {
  const toast = useViewer((s) => s.toast);
  const toastNonce = useViewer((s) => s.toastNonce);
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (toastNonce === 0) return;
    setShow(true);
    const id = setTimeout(() => setShow(false), 1500);
    return () => clearTimeout(id);
  }, [toastNonce]);

  return <div className={`toast ${show ? 'show' : ''}`}>{toast}</div>;
}
