import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EmptyState } from '../components/ui/EmptyState/EmptyState';

describe('EmptyState', () => {
  it('renders icon', () => {
    render(<EmptyState icon={<span data-testid="icon">📭</span>} title="Nothing" />);
    expect(screen.getByTestId('icon')).toBeInTheDocument();
  });

  it('renders title', () => {
    render(<EmptyState icon="📭" title="No items found" />);
    expect(screen.getByText('No items found')).toBeInTheDocument();
  });

  it('renders description when provided', () => {
    render(<EmptyState icon="📭" title="Empty" description="Try again later" />);
    expect(screen.getByText('Try again later')).toBeInTheDocument();
  });

  it('does not render description when not provided', () => {
    const { container } = render(<EmptyState icon="📭" title="Empty" />);
    expect(container.querySelectorAll('p')).toHaveLength(0);
  });

  it('renders action slot when provided', () => {
    render(
      <EmptyState
        icon="📭"
        title="Empty"
        action={<button data-testid="action-btn">Add Item</button>}
      />,
    );
    expect(screen.getByTestId('action-btn')).toBeInTheDocument();
  });
});
