import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { SettingsPage } from '../pages/master/SettingsPage';
import { useAuth } from '@/hooks';
import { mockNavigate } from './setup';

vi.mock('@/hooks', () => ({
  useAuth: vi.fn(),
}));

vi.mock('@/lib/prefetch', () => ({
  prefetchMasterInsights: vi.fn(),
}));

describe('SettingsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows onboarding demo preview only to the developer telegram account', () => {
    vi.mocked(useAuth).mockReturnValue({
      profile: { telegramId: '422552831' },
    } as never);

    render(<SettingsPage />);

    expect(screen.getByText('onboarding.previewShowcase')).toBeInTheDocument();
  });

  it('hides onboarding demo preview for other users', () => {
    vi.mocked(useAuth).mockReturnValue({
      profile: { telegramId: '111111111' },
    } as never);

    render(<SettingsPage />);

    expect(screen.queryByText('onboarding.previewShowcase')).not.toBeInTheDocument();
  });

  it('navigates to showcase preview for developer account', () => {
    vi.mocked(useAuth).mockReturnValue({
      profile: { telegramId: '422552831' },
    } as never);

    render(<SettingsPage />);

    fireEvent.click(screen.getByText('onboarding.previewShowcase'));

    expect(mockNavigate).toHaveBeenCalledWith('/master/showcase-preview');
  });
});