import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DialogSignIn } from './DialogSignIn';

const mockShowSignInDialog = vi.hoisted(() => ({ value: false }));
const mockSetShowSignInDialog = vi.hoisted(() => vi.fn());

// Mock auth store
vi.mock('@/stores/auth/auth.store', () => ({
  useAuthStore: (
    selector: (state: { showSignInDialog: boolean; setShowSignInDialog: typeof mockSetShowSignInDialog }) => unknown,
  ) => selector({ showSignInDialog: mockShowSignInDialog.value, setShowSignInDialog: mockSetShowSignInDialog }),
}));

// Mock next/link
vi.mock('next/link', () => ({
  default: ({ children, href, onClick }: { children: React.ReactNode; href: string; onClick?: () => void }) => (
    <a data-testid={`link-${href.replace(/\//g, '-')}`} href={href} onClick={onClick}>
      {children}
    </a>
  ),
}));

describe('DialogSignIn', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockShowSignInDialog.value = false;
  });

  describe('rendering', () => {
    it('renders nothing when store has showSignInDialog=false', () => {
      mockShowSignInDialog.value = false;
      render(<DialogSignIn />);

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('renders dialog content when store has showSignInDialog=true', () => {
      mockShowSignInDialog.value = true;
      render(<DialogSignIn />);

      expect(screen.getByRole('dialog')).toBeInTheDocument();
      // Title appears in dialog header
      expect(screen.getByRole('heading', { name: 'Sign in to Pubky World' })).toBeInTheDocument();
      expect(
        screen.getByText('Bring your people into the world. Sign in here with your existing Pubky account.'),
      ).toBeInTheDocument();
    });

    it('explains where to create an account and where to sign in', () => {
      mockShowSignInDialog.value = true;
      render(<DialogSignIn />);

      expect(screen.getByText('Open an account on pubky.app, then return here to sign in.')).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Sign In' })).toBeInTheDocument();
    });

    it('renders Join Pubky as a plain external link to official account creation', () => {
      mockShowSignInDialog.value = true;
      render(<DialogSignIn />);

      const joinLink = screen.getByRole('link', { name: 'Join Pubky' });
      expect(joinLink).toHaveAttribute('href', 'https://pubky.app/');
      expect(joinLink).toHaveAttribute('target', '_blank');
      expect(joinLink).toHaveAttribute('rel', 'noopener noreferrer');
      expect(screen.queryByRole('button', { name: 'Join Pubky' })).not.toBeInTheDocument();
      expect(joinLink).toHaveTextContent('Join Pubky');
    });

    it('renders Sign In link pointing to /sign-in', () => {
      mockShowSignInDialog.value = true;
      render(<DialogSignIn />);

      const signInLink = screen.getByTestId('link--sign-in');
      expect(signInLink).toHaveAttribute('href', '/sign-in');
      expect(signInLink).toHaveTextContent('Sign In');
    });

    it('keeps one clear sign-in action and a decorative illustration', () => {
      mockShowSignInDialog.value = true;
      render(<DialogSignIn />);

      const dialog = screen.getByRole('dialog');
      expect(dialog.querySelectorAll('.lucide-arrow-right')).toHaveLength(1);
      expect(screen.getByAltText('').getAttribute('src')).toContain('sign-in.webp');
    });
  });

  describe('interactions', () => {
    it('calls setShowSignInDialog(false) when Join Pubky link is clicked', () => {
      mockShowSignInDialog.value = true;
      render(<DialogSignIn />);

      const joinLink = screen.getByRole('link', { name: 'Join Pubky' });
      fireEvent.click(joinLink);

      expect(mockSetShowSignInDialog).toHaveBeenCalledWith(false);
    });

    it('calls setShowSignInDialog(false) when Sign In link is clicked', () => {
      mockShowSignInDialog.value = true;
      render(<DialogSignIn />);

      const signInLink = screen.getByTestId('link--sign-in');
      fireEvent.click(signInLink);

      expect(mockSetShowSignInDialog).toHaveBeenCalledWith(false);
    });
  });

  describe('accessibility', () => {
    it('has a visible title for screen readers', () => {
      mockShowSignInDialog.value = true;
      render(<DialogSignIn />);

      // The DialogTitle provides accessibility for screen readers
      expect(screen.getByRole('heading', { name: 'Sign in to Pubky World' })).toBeInTheDocument();
    });
  });
});

describe('DialogSignIn - Snapshots', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('matches snapshot when open', () => {
    mockShowSignInDialog.value = true;
    render(<DialogSignIn />);

    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog?.parentElement).toMatchSnapshot();
  });

  it('matches snapshot when closed', () => {
    mockShowSignInDialog.value = false;
    const { container } = render(<DialogSignIn />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
