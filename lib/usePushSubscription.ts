'use client';

import { useState, useEffect, useCallback } from 'react';

function isIos() {
  if (typeof window === 'undefined') return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

function isInStandaloneMode() {
  if (typeof window === 'undefined') return false;
  return ('standalone' in navigator && (navigator as any).standalone === true) ||
    window.matchMedia('(display-mode: standalone)').matches;
}

export function usePushSubscription() {
  const [permission, setPermission] = useState<NotificationPermission | null>(null);
  const [needsPrompt, setNeedsPrompt] = useState(false);
  const [iosNotInstalled, setIosNotInstalled] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;

    if (isIos() && !isInStandaloneMode()) {
      setIosNotInstalled(true);
      return;
    }

    const current = Notification.permission;
    setPermission(current);

    if (current === 'granted') {
      doSubscribe();
    } else if (current === 'default') {
      setNeedsPrompt(true);
    }
  }, []);

  async function doSubscribe() {
    try {
      const reg = await navigator.serviceWorker.ready;
      const existing = await reg.pushManager.getSubscription();
      if (existing) return;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
      });
      await fetch('/api/push-subscription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sub),
      });
    } catch {
      // silently fail
    }
  }

  const requestPermission = useCallback(async () => {
    const result = await Notification.requestPermission();
    setPermission(result);
    setNeedsPrompt(false);
    if (result === 'granted') await doSubscribe();
  }, []);

  return { permission, needsPrompt, iosNotInstalled, requestPermission };
}
