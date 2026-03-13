import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Input } from '../components/ui/Input/Input';

describe('Input', () => {
  it('renders input element', () => {
    render(<Input placeholder="Type here" />);
    expect(screen.getByPlaceholderText('Type here')).toBeInTheDocument();
  });

  it('renders label', () => {
    render(<Input label="Name" />);
    expect(screen.getByText('Name')).toBeInTheDocument();
  });

  it('renders error message', () => {
    render(<Input error="Required field" />);
    expect(screen.getByText('Required field')).toBeInTheDocument();
  });

  it('applies error class when error provided', () => {
    render(<Input error="Required" data-testid="inp" />);
    expect(screen.getByTestId('inp').className).toContain('error');
  });

  it('renders hint when no error', () => {
    render(<Input hint="Optional" />);
    expect(screen.getByText('Optional')).toBeInTheDocument();
  });

  it('does not render hint when error is present', () => {
    render(<Input error="Error!" hint="Optional" />);
    expect(screen.queryByText('Optional')).not.toBeInTheDocument();
  });

  it('handles onChange', () => {
    const onChange = vi.fn();
    render(<Input onChange={onChange} data-testid="inp" />);
    fireEvent.change(screen.getByTestId('inp'), { target: { value: 'hello' } });
    expect(onChange).toHaveBeenCalled();
  });

  it('accepts value prop', () => {
    render(<Input value="preset" readOnly data-testid="inp" />);
    expect(screen.getByTestId('inp')).toHaveValue('preset');
  });

  it('accepts type prop', () => {
    render(<Input type="number" data-testid="inp" />);
    expect(screen.getByTestId('inp')).toHaveAttribute('type', 'number');
  });

  it('forwards ref', () => {
    const ref = vi.fn();
    render(<Input ref={ref} />);
    expect(ref).toHaveBeenCalled();
  });

  it('is disabled when disabled prop set', () => {
    render(<Input disabled data-testid="inp" />);
    expect(screen.getByTestId('inp')).toBeDisabled();
  });
});
