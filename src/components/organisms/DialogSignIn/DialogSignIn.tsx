'use client';

import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { AUTH_ROUTES } from '@/app/routes';
import { Button } from '@/atoms/Button/Button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/atoms/Dialog/Dialog';
import { useAuthStore } from '@/stores/auth/auth.store';

/** Shared sign-in prompt; new accounts are created on the official Pubky site. */
export function DialogSignIn() {
  const showSignInDialog = useAuthStore((state) => state.showSignInDialog);
  const setShowSignInDialog = useAuthStore((state) => state.setShowSignInDialog);
  const handleClose = () => setShowSignInDialog(false);
  return (
    <Dialog open={showSignInDialog} onOpenChange={setShowSignInDialog}>
      <DialogContent className="w-[440px] gap-6">
        <DialogHeader className="gap-2">
          <DialogTitle>Sign in to Pubky World</DialogTitle>
          <DialogDescription>
            Bring your people into the world. Sign in here with your existing Pubky account.
          </DialogDescription>
        </DialogHeader>
        <Image src="/images/sign-in.webp" alt="" width={202} height={202} className="mx-auto h-32 w-auto" />
        <Button asChild className="w-full gap-2 font-bold">
          <Link href={AUTH_ROUTES.SIGN_IN} onClick={handleClose}>
            Sign In
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </Button>
        <div className="text-sm leading-6 text-muted-foreground">
          <a
            href="https://pubky.app/"
            target="_blank"
            rel="noopener noreferrer"
            onClick={handleClose}
            className="font-semibold text-foreground underline underline-offset-4"
          >
            Join Pubky
          </a>
          <p>Open an account on pubky.app, then return here to sign in.</p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
