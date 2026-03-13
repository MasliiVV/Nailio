import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Card, CardRow } from '../components/ui/Card/Card';

describe('Card', () => {
  it('renders children', () => {
    render(<Card>Card content</Card>);
    expect(screen.getByText('Card content')).toBeInTheDocument();
  });

  it('renders as div when not clickable', () => {
    const { container } = render(<Card>Static</Card>);
    expect(container.querySelector('div')).toBeTruthy();
    expect(container.querySelector('button')).toBeNull();
  });

  it('renders as button when onClick provided', () => {
    render(<Card onClick={() => {}}>Clickable</Card>);
    expect(screen.getByRole('button')).toBeInTheDocument();
  });

  it('applies clickable class when onClick provided', () => {
    render(<Card onClick={() => {}}>Clickable</Card>);
    expect(screen.getByRole('button').className).toContain('clickable');
  });

  it('fires onClick handler', () => {
    const onClick = vi.fn();
    render(<Card onClick={onClick}>Click me</Card>);
    fireEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('applies padding variants', () => {
    const { rerender, container } = render(<Card padding="none">None</Card>);
    expect((container.firstChild as HTMLElement).className).toContain('padding-none');

    rerender(<Card padding="sm">Sm</Card>);
    expect((container.firstChild as HTMLElement).className).toContain('padding-sm');

    rerender(<Card padding="lg">Lg</Card>);
    expect((container.firstChild as HTMLElement).className).toContain('padding-lg');
  });

  it('applies custom style', () => {
    const { container } = render(<Card style={{ marginTop: 16 }}>Styled</Card>);
    expect((container.firstChild as HTMLElement).style.marginTop).toBe('16px');
  });
});

describe('CardRow', () => {
  it('renders title', () => {
    render(<CardRow title="Row Title" />);
    expect(screen.getByText('Row Title')).toBeInTheDocument();
  });

  it('renders subtitle', () => {
    render(<CardRow title="Title" subtitle="Subtitle" />);
    expect(screen.getByText('Subtitle')).toBeInTheDocument();
  });

  it('renders icon', () => {
    render(<CardRow title="Title" icon={<span data-testid="icon">⚡</span>} />);
    expect(screen.getByTestId('icon')).toBeInTheDocument();
  });

  it('renders right content', () => {
    render(<CardRow title="Title" right={<span data-testid="right">→</span>} />);
    expect(screen.getByTestId('right')).toBeInTheDocument();
  });

  it('renders chevron when clickable', () => {
    render(<CardRow title="Title" onClick={() => {}} />);
    expect(screen.getByText('›')).toBeInTheDocument();
  });

  it('does not render chevron when not clickable', () => {
    render(<CardRow title="Title" />);
    expect(screen.queryByText('›')).not.toBeInTheDocument();
  });

  it('fires onClick on click', () => {
    const onClick = vi.fn();
    render(<CardRow title="Click Row" onClick={onClick} />);
    fireEvent.click(screen.getByText('Click Row'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
