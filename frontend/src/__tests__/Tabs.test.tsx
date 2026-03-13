import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Tabs, TabContent } from '../components/ui/Tabs/Tabs';

describe('Tabs', () => {
  const tabs = [
    { id: 'tab1', label: 'Tab 1' },
    { id: 'tab2', label: 'Tab 2' },
    { id: 'tab3', label: 'Tab 3' },
  ];

  it('renders all tab labels', () => {
    render(<Tabs tabs={tabs} activeId="tab1" onChange={() => {}} />);
    expect(screen.getByText('Tab 1')).toBeInTheDocument();
    expect(screen.getByText('Tab 2')).toBeInTheDocument();
    expect(screen.getByText('Tab 3')).toBeInTheDocument();
  });

  it('marks active tab', () => {
    render(<Tabs tabs={tabs} activeId="tab2" onChange={() => {}} />);
    expect(screen.getByText('Tab 2').className).toContain('active');
    expect(screen.getByText('Tab 1').className).not.toContain('active');
  });

  it('calls onChange with tab id on click', () => {
    const onChange = vi.fn();
    render(<Tabs tabs={tabs} activeId="tab1" onChange={onChange} />);
    fireEvent.click(screen.getByText('Tab 2'));
    expect(onChange).toHaveBeenCalledWith('tab2');
  });

  it('renders all tabs as buttons', () => {
    render(<Tabs tabs={tabs} activeId="tab1" onChange={() => {}} />);
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(3);
  });
});

describe('TabContent', () => {
  it('renders children', () => {
    render(<TabContent>Tab content here</TabContent>);
    expect(screen.getByText('Tab content here')).toBeInTheDocument();
  });
});
