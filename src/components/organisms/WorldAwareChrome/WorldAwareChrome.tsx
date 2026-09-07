'use client';

import { usePathname } from 'next/navigation';
import { ROOT_ROUTES } from '@/app/routes';
import { Fab } from '@/molecules/Fab/Fab';
import { Header } from '@/organisms/Header/Header';

/** The world owns its HUD; the rest of Pubky keeps its usual navigation. */
export function WorldAwareChrome({ placement }: { placement: 'header' | 'fab' }) {
  const pathname = usePathname();
  if (pathname === ROOT_ROUTES) return null;
  return placement === 'header' ? <Header /> : <Fab />;
}
