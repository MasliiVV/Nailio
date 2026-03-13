import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BottomSheet } from '../components/ui/BottomSheet/BottomSheet';

describe('BottomSheet', () => {
  it('renders nothing when closed', () => {
    const { container } = render(
      <BottomSheet open={false} onClose={() => {}}>
        Content
      </BottomSheet>,
    );
    expect(container.innerHTML).toBe('');
  });

  it('renders content when open', () => {
    render(
      <BottomSheet open={true} onClose={() => {}}>
        Sheet Content
      </BottomSheet>,
    );
    expect(screen.getByText('Sheet Content')).toBeInTheDocument();
  });

  it('renders title when provided', () => {
    render(
      <BottomSheet open={true} onClose={() => {}} title="My Title">
        Content
      </BottomSheet>,
    );
    expect(screen.getByText('My Title')).toBeInTheDocument();
  });

  it('calls onClose when backdrop clicked', () => {
    const onClose = vi.fn();
    render(
      <BottomSheet open={true} onClose={onClose}>
        Content
      </BottomSheet>,
    );
    // Backdrop is the first element
    const backdrop = document.querySelector('[class*="backdrop"]');
    if (backdrop) fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose on Escape key', () => {
    const onClose = vi.fn();
    render(
      <BottomSheet open={true} onClose={onClose}>
        Content
      </BottomSheet>,
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('locks body scroll when open', () => {
    render(
      <BottomSheet open={true} onClose={() => {}}>
        Content
      </BottomSheet>,
    );
    expect(document.body.style.overflow).toBe('hidden');
  });

  it('restores body scroll when closed', async () => {
    const { rerender } = render(
      <BottomSheet open={true} onClose={() => {}}>
        Content
      </BottomSheet>,
    );
    expect(document.body.style.overflow).toBe('hidden');

    rerender(
      <BottomSheet open={false} onClose={() => {}}>
        Content
      </BottomSheet>,
    );
    expect(document.body.style.overflow).toBe('');
  });

  it('renders handle element', () => {
    render(
      <BottomSheet open={true} onClose={() => {}}>
        Content
      </BottomSheet>,
    );
    expect(document.querySelector('[class*="handle"]')).toBeTruthy();
  });
});
