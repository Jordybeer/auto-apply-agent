'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/** @deprecated Redirect to /admin */
export default function DebugRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace('/admin'); }, [router]);
  return null;
}
