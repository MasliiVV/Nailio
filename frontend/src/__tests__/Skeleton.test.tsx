import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { Skeleton, SkeletonCard, SkeletonList } from '../components/ui/Skeleton/Skeleton';

describe('Skeleton', () => {
  it('renders with default dimensions', () => {
    const { container } = render(<Skeleton />);
    const el = container.firstChild as HTMLElement;
    expect(el.style.width).toBe('100%');
    expect(el.style.height).toBe('16px');
  });

  it('accepts custom dimensions', () => {
    const { container } = render(<Skeleton width={200} height={40} />);
    const el = container.firstChild as HTMLElement;
    expect(el.style.width).toBe('200px');
    expect(el.style.height).toBe('40px');
  });

  it('accepts custom border radius', () => {
    const { container } = render(<Skeleton borderRadius="50%" />);
    const el = container.firstChild as HTMLElement;
    expect(el.style.borderRadius).toBe('50%');
  });

  it('applies custom className', () => {
    const { container } = render(<Skeleton className="my-skeleton" />);
    expect((container.firstChild as HTMLElement).className).toContain('my-skeleton');
  });
});

describe('SkeletonCard', () => {
  it('renders card skeleton structure', () => {
    const { container } = render(<SkeletonCard />);
    expect(container.querySelector('[class*="card"]')).toBeTruthy();
    expect(container.querySelector('[class*="cardRow"]')).toBeTruthy();
  });
});

describe('SkeletonList', () => {
  it('renders default 3 skeleton cards', () => {
    const { container } = render(<SkeletonList />);
    const cards = container.querySelectorAll('[class*="card"]');
    // Each SkeletonCard has the card class, default count=3
    expect(cards.length).toBeGreaterThanOrEqual(3);
  });

  it('renders custom count of skeleton cards', () => {
    const { container } = render(<SkeletonList count={5} />);
    const rows = container.querySelectorAll('[class*="cardRow"]');
    expect(rows).toHaveLength(5);
  });
});
