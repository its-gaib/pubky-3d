'use client';

import * as React from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { LogIn } from 'lucide-react';
import { AUTH_ROUTES } from '@/app/routes';
import { Button } from '@/atoms/Button/Button';

export function HeaderButtonSignIn({ ...props }: React.HTMLAttributes<HTMLButtonElement>) {
  const router = useRouter();
  const pathname = usePathname();
  const isSignInPage = pathname === AUTH_ROUTES.SIGN_IN;

  if (isSignInPage) {
    return (
      <div className="max-w-40 text-right text-xs">
        <a
          id="header-sign-in-btn"
          data-testid="header-sign-in-btn"
          data-cy="header-sign-in-btn"
          href="https://pubky.app/"
          target="_blank"
          rel="noopener noreferrer"
          className="font-semibold underline underline-offset-4"
        >
          Join Pubky
        </a>
        <p className="mt-1 text-[10px] text-muted-foreground">Open an account on pubky.app, then sign in here.</p>
      </div>
    );
  }

  const handleClick = () => {
    router.push(AUTH_ROUTES.SIGN_IN);
  };

  return (
    <Button
      id="header-sign-in-btn"
      data-testid="header-sign-in-btn"
      data-cy="header-sign-in-btn"
      variant="secondary"
      onClick={handleClick}
      className="gap-2"
      {...props}
    >
      <LogIn className="size-4" />
      {'Sign in'}
    </Button>
  );
}
