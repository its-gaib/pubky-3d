'use client';

import { useEffect } from 'react';
import { ChevronDown, LoaderCircle, LogOut } from 'lucide-react';
import { Button } from '@/atoms/Button/Button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/atoms/DropdownMenu/DropdownMenu';
import { useWorldAccount } from '@/hooks/useWorldAccount/useWorldAccount';
import { AvatarWithFallback } from '@/organisms/AvatarWithFallback/AvatarWithFallback';
import styles from './World.module.css';

export function WorldAccountMenu({
  personaColor,
  onOpenChange,
}: {
  personaColor: string;
  onOpenChange: (open: boolean) => void;
}) {
  const account = useWorldAccount();
  useEffect(() => {
    onOpenChange(account.open || account.isSigningOut);
  }, [account.open, account.isSigningOut, onOpenChange]);
  useEffect(() => () => onOpenChange(false), [onOpenChange]);

  if (!account.identity) {
    return (
      <div className={styles.identity} role={account.isSigningOut ? 'status' : undefined}>
        {account.isSigningOut ? (
          <LoaderCircle size={20} className={styles.spin} aria-hidden="true" />
        ) : (
          <span className={styles.identityFace} style={{ background: personaColor }} aria-hidden="true">
            ••
          </span>
        )}
        <div>
          <strong>
            {account.isSigningOut ? 'Logging out…' : account.isRestoring ? 'Restoring session…' : 'Curious explorer'}
          </strong>
          {!account.isSigningOut && !account.isRestoring && <span>Guest persona</span>}
        </div>
      </div>
    );
  }

  const { id, name, avatarUrl } = account.identity;
  return (
    <DropdownMenu open={account.open} onOpenChange={account.setOpen}>
      <DropdownMenuTrigger asChild>
        <Button overrideDefaults className={styles.accountTrigger} aria-label={`Account menu for ${name}`}>
          <AvatarWithFallback
            avatarUrl={avatarUrl}
            name={name}
            fallbackSeed={id}
            alt={`${name}’s profile picture`}
            className={styles.accountAvatar}
          />
          <strong className={styles.accountName}>{name}</strong>
          <ChevronDown size={14} aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={8} className={styles.accountMenu}>
        <DropdownMenuItem disabled={account.isSigningOut} onSelect={() => void account.signOut()}>
          <LogOut size={16} aria-hidden="true" />
          Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
