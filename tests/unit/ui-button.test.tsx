// @vitest-environment jsdom
import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import '@testing-library/jest-dom';
import { Button } from '@/components/ui/button';

describe('Button Primitive', () => {
  it('renders a default button with children', () => {
    render(<Button>Click me</Button>);
    const btn = screen.getByRole('button', { name: 'Click me' });
    expect(btn).toBeInTheDocument();
  });

  it('renders a loading spinner when loading is true', () => {
    render(<Button loading>Saving</Button>);
    const btn = screen.getByRole('button', { name: 'Saving' });
    expect(btn).toBeInTheDocument();
    expect(btn.querySelector('svg')).toBeInTheDocument();
  });

  it('renders with asChild onto a link element without slotting errors', () => {
    render(
      <Button asChild size="sm" className="mt-2 text-xs">
        <a href="/settings">Set up an AI provider</a>
      </Button>
    );
    const link = screen.getByRole('link', { name: 'Set up an AI provider' });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', '/settings');
    expect(link.className).toContain('mt-2');
  });

  it('renders with asChild when disabled is set', () => {
    render(
      <Button asChild disabled>
        <a href="/dashboard">Dashboard</a>
      </Button>
    );
    const link = screen.getByRole('link', { name: 'Dashboard' });
    expect(link).toBeInTheDocument();
  });
});

