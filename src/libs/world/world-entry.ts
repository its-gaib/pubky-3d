// A one-use navigation hint, never an authentication signal or persisted account state.
let enterAfterSignIn = false;

export function requestWorldEntry(): void {
  if (typeof window !== 'undefined') enterAfterSignIn = true;
}

export function consumeWorldEntry(): boolean {
  const requested = enterAfterSignIn;
  enterAfterSignIn = false;
  return requested;
}
