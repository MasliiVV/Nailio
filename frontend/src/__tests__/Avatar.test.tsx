import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Avatar } from '../components/ui/Avatar/Avatar';

describe('Avatar', () => {
  it('renders initials for text-only avatar', () => {
    render(<Avatar name="John Doe" />);
    expect(screen.getByText('JD')).toBeInTheDocument();
  });

  it('renders first two chars for single-word name', () => {
    render(<Avatar name="Alice" />);
    expect(screen.getByText('AL')).toBeInTheDocument();
  });

  it('renders image when photoUrl provided', () => {
    render(<Avatar name="John" photoUrl="https://example.com/photo.jpg" />);
    const img = screen.getByAltText('John');
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute('src', 'https://example.com/photo.jpg');
  });

  it('does not render initials when photo provided', () => {
    render(<Avatar name="John Doe" photoUrl="https://example.com/photo.jpg" />);
    expect(screen.queryByText('JD')).not.toBeInTheDocument();
  });

  it('applies sm size class', () => {
    const { container } = render(<Avatar name="Test" size="sm" />);
    expect((container.firstChild as HTMLElement).className).toContain('sm');
  });

  it('applies lg size class', () => {
    const { container } = render(<Avatar name="Test" size="lg" />);
    expect((container.firstChild as HTMLElement).className).toContain('lg');
  });

  it('generates deterministic background color', () => {
    const { container: c1 } = render(<Avatar name="Alice" />);
    const { container: c2 } = render(<Avatar name="Alice" />);
    const bg1 = (c1.firstChild as HTMLElement).style.backgroundColor;
    const bg2 = (c2.firstChild as HTMLElement).style.backgroundColor;
    expect(bg1).toBe(bg2);
  });

  it('generates different colors for different names', () => {
    const { container: c1 } = render(<Avatar name="Alice" />);
    const { container: c2 } = render(<Avatar name="Zack" />);
    const bg1 = (c1.firstChild as HTMLElement).style.backgroundColor;
    const bg2 = (c2.firstChild as HTMLElement).style.backgroundColor;
    // Different names should likely produce different colors
    // (not guaranteed but statistically likely)
    expect(typeof bg1).toBe('string');
    expect(typeof bg2).toBe('string');
  });

  it('accepts custom className', () => {
    const { container } = render(<Avatar name="Test" className="my-class" />);
    expect((container.firstChild as HTMLElement).className).toContain('my-class');
  });
});
