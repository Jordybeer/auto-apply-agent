'use client';
import { useEffect } from 'react';

export default function PageLogger({ page, source = 'page' }: { page: string; source?: string }) {
  useEffect(() => {
    fetch('/api/log-event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source, message: `Pagina bezocht: ${page}` }),
    }).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}
