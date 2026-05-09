import { useState, useCallback, useRef } from 'react';

export type ToastVariant = 'success' | 'error' | 'info';

export interface Toast {
  id: number;
  message: string;
  variant: ToastVariant;
}

export function useToast(durationMs = 3500) {
  const [toast, setToast] = useState<Toast | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const counter = useRef(0);

  const show = useCallback(
    (message: string, variant: ToastVariant = 'success') => {
      if (timerRef.current) clearTimeout(timerRef.current);
      setToast({ id: ++counter.current, message, variant });
      timerRef.current = setTimeout(() => setToast(null), durationMs);
    },
    [durationMs],
  );

  const dismiss = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setToast(null);
  }, []);

  return { toast, show, dismiss } as const;
}
