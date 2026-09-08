import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { HeaderButtonSignIn } from './HeaderButtonSignIn';

// Mock Next.js navigation
const mockPush = vi.fn();
const mockUsePathname = vi.fn(() => '/');
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
  usePathname: () => mockUsePathname(),
}));

// Mock atoms
vi.mock('@/atoms/Button/Button', () => {
  return {
    Button: ({
      children,
      onClick,
      id,
      variant,
      ...props
    }: {
      children: React.ReactNode;
      onClick?: () => void;
      id?: string;
      variant?: string;
      [key: string]: unknown;
    }) => (
      <button id={id} onClick={onClick} data-variant={variant} {...props}>
        {children}
      </button>
    ),
  };
});

// Mock app
vi.mock('@/app/routes', () => ({
  AUTH_ROUTES: {
    SIGN_IN: '/sign-in',
  },
  ONBOARDING_ROUTES: {
    HUMAN: '/onboarding/human',
  },
}));

describe('HeaderButtonSignIn', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUsePathname.mockReturnValue('/');
  });

  it('renders sign in button with icon and text', () => {
    render(<HeaderButtonSignIn />);

    const button = screen.getByRole('button', { name: /Sign in/i });
    expect(button).toBeInTheDocument();
    expect(button).toHaveAttribute('id', 'header-sign-in-btn');
    expect(button).toHaveAttribute('data-variant', 'secondary');
    expect(screen.getByTestId('header-sign-in-btn')).toBeInTheDocument();
  });

  it('navigates to sign-in when clicked', () => {
    render(<HeaderButtonSignIn />);

    const button = screen.getByRole('button', { name: /Sign in/i });
    button.click();

    expect(mockPush).toHaveBeenCalledWith('/sign-in');
  });

  it('renders a plain account creation link on the sign-in page', () => {
    mockUsePathname.mockReturnValue('/sign-in');
    render(<HeaderButtonSignIn />);

    expect(screen.getByRole('link', { name: 'Join Pubky' })).toHaveAttribute('href', 'https://pubky.app/');
    expect(screen.getByText('Open an account on pubky.app, then sign in here.')).toBeInTheDocument();
  });

  it('opens official account creation without entering the fork onboarding flow', () => {
    mockUsePathname.mockReturnValue('/sign-in');
    render(<HeaderButtonSignIn />);

    const link = screen.getByRole('link', { name: 'Join Pubky' });
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('renders sign in button on the onboarding page', () => {
    mockUsePathname.mockReturnValue('/onboarding/human');
    render(<HeaderButtonSignIn />);

    expect(screen.getByRole('button', { name: /Sign in/i })).toBeInTheDocument();
  });

  it('navigates to sign-in when clicked on the onboarding page', () => {
    mockUsePathname.mockReturnValue('/onboarding/human');
    render(<HeaderButtonSignIn />);

    screen.getByRole('button', { name: /Sign in/i }).click();

    expect(mockPush).toHaveBeenCalledWith('/sign-in');
  });

  it('passes through additional props', () => {
    render(<HeaderButtonSignIn data-testid="custom-button" className="custom-class" />);

    const button = screen.getByTestId('custom-button');
    expect(button).toHaveClass('custom-class');
  });
});

describe('HeaderButtonSignIn - Snapshots', () => {
  it('matches snapshot for default HeaderButtonSignIn', () => {
    const { container } = render(<HeaderButtonSignIn />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with custom className', () => {
    const { container } = render(<HeaderButtonSignIn className="custom-class" />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
