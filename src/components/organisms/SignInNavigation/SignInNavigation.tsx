'use client';

import { Container } from '@/atoms/Container/Container';
import { useSignInStore } from '@/stores/signIn/signIn.store';
import { DialogRestoreEncryptedFile } from '../DialogRestoreEncryptedFile/DialogRestoreEncryptedFile';
import { DialogRestoreRecoveryPhrase } from '../DialogRestoreRecoveryPhrase/DialogRestoreRecoveryPhrase';

export const SignInNavigation = () => {
  const authUrlResolved = useSignInStore((state) => state.authUrlResolved);

  if (authUrlResolved) return null;

  return (
    <Container className="flex-col-reverse justify-start gap-3 md:flex-row lg:gap-6">
      <Container className="mx-0 w-auto flex-col items-start justify-start gap-3 sm:mx-auto sm:w-full sm:flex-row">
        {/* RouteGuard owns completed sign-in navigation, including accounts that still need a profile. */}
        <DialogRestoreRecoveryPhrase />
        <DialogRestoreEncryptedFile onRestore={() => undefined} />
      </Container>
    </Container>
  );
};
