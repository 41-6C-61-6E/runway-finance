// @vitest-environment jsdom
import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect } from 'vitest';
import '@testing-library/jest-dom';
import { Plus, Play } from 'lucide-react';
import { ActionButton, AddButton, actionButtonVariants } from '@/components/ui/action-button';

// Mock Tooltip components to avoid portal/provider issues in jsdom
vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: vi.fn(({ children }: any) => <>{children}</>),
  TooltipTrigger: vi.fn(({ children }: any) => <>{children}</>),
  TooltipContent: vi.fn(({ children }: any) => <>{children}</>),
  TooltipProvider: ({ children }: any) => <>{children}</>,
}));

describe('actionButtonVariants', () => {
  it('keeps the budget-card aesthetic as the default variant/size', () => {
    const classes = actionButtonVariants({});
    // Exact match to the Budgets card Add button baseline
    expect(classes).toContain('bg-accent');
    expect(classes).toContain('hover:bg-accent/80');
    expect(classes).toContain('border-border/80');
    expect(classes).toContain('text-foreground');
    expect(classes).toContain('h-8');
    expect(classes).toContain('text-xs');
    expect(classes).toContain('rounded-lg');
    // Shared affordances
    expect(classes).toContain('inline-flex');
    expect(classes).toContain('shrink-0');
    expect(classes).toContain('cursor-pointer');
    expect(classes).toContain('disabled:opacity-50');
  });

  it('distinguishes primary, outline, and ghost variants', () => {
    expect(actionButtonVariants({ variant: 'primary' })).toContain('bg-primary');
    expect(actionButtonVariants({ variant: 'outline' })).toContain('hover:bg-accent');
    expect(actionButtonVariants({ variant: 'ghost' })).toContain('border-transparent');
  });

  it('merges a custom className over the base variants', () => {
    const classes = actionButtonVariants({ className: 'ml-auto' });
    expect(classes).toContain('ml-auto');
  });
});

describe('ActionButton', () => {
  it('renders a semantic button with label text', () => {
    render(<ActionButton>Add Recurring</ActionButton>);
    const button = screen.getByRole('button', { name: 'Add Recurring' });
    expect(button).toBeInTheDocument();
    expect(button).toHaveAttribute('type', 'button');
  });

  it('defaults the type to button (safe inside forms)', () => {
    render(<form><ActionButton>Submit</ActionButton></form>);
    expect(screen.getByRole('button')).toHaveAttribute('type', 'button');
  });

  it('renders the icon to the left of the label by default', () => {
    render(<ActionButton icon={Plus}>Add Goal</ActionButton>);
    const button = screen.getByRole('button');
    const children = Array.from(button.querySelectorAll(':scope > *'));
    expect(children[0].tagName).toBe('svg');
    expect(children[1].textContent).toBe('Add Goal');
  });

  it('supports iconPosition="right" (Budgets card `Add +` style)', () => {
    render(<ActionButton icon={Plus} iconPosition="right">Add</ActionButton>);
    const button = screen.getByRole('button');
    const children = Array.from(button.querySelectorAll(':scope > *'));
    expect(children[0].textContent).toBe('Add');
    expect(children[1].tagName).toBe('svg');
  });

  it('renders no icon by default', () => {
    render(<ActionButton>Plains</ActionButton>);
    expect(screen.getByRole('button').querySelector('svg')).not.toBeInTheDocument();
  });

  it('supports a non-Lucide icon component', () => {
    render(<ActionButton icon={Play}>Run</ActionButton>);
    expect(screen.getByRole('button').querySelector('svg')).toBeInTheDocument();
  });

  it('handles clicks', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<ActionButton onClick={onClick}>Go</ActionButton>);
    await user.click(screen.getByRole('button', { name: 'Go' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('does not fire clicks when disabled and styles disabled state', () => {
    const onClick = vi.fn();
    const { rerender } = render(<ActionButton disabled onClick={onClick}>Go</ActionButton>);
    expect(screen.getByRole('button')).toBeDisabled();

    rerender(<ActionButton disabled onClick={onClick} className="disabled:bg-red-500">Go</ActionButton>);
    expect(screen.getByRole('button')).toHaveClass('disabled:opacity-50');
    expect(screen.getByRole('button')).toHaveClass('disabled:bg-red-500');
  });

  it('applies variant and size class hooks', () => {
    const { rerender } = render(<ActionButton variant="primary">P</ActionButton>);
    expect(screen.getByRole('button')).toHaveClass('bg-primary');

    rerender(<ActionButton size="xs">X</ActionButton>);
    expect(screen.getByRole('button')).toHaveClass('h-7');
  });
});

describe('AddButton', () => {
  it('defaults to the Plus icon with the "Add" label', () => {
    render(<AddButton />);
    const button = screen.getByRole('button', { name: 'Add' });
    expect(button).toBeInTheDocument();
    expect(button.querySelector('svg')).toBeInTheDocument();
  });

  it('allows a custom label and can override the icon', () => {
    render(<AddButton icon={Play}>Add Rule</AddButton>);
    const button = screen.getByRole('button', { name: 'Add Rule' });
    expect(button.querySelector('svg')).toBeInTheDocument();
  });
});

describe('tooltip composition', () => {
  it('wraps the button in a Tooltip when the tooltip prop is provided', async () => {
    const ui = vi.mocked(await import('@/components/ui/tooltip'));
    render(
      <ActionButton tooltip="Create a custom budget item">
        Add
      </ActionButton>
    );
    // The tooltip content text flows through the mocked TooltipContent in the DOM.
    expect(screen.getByRole('button', { name: 'Add' })).toBeInTheDocument();
    expect(screen.getByText('Create a custom budget item')).toBeInTheDocument();
    expect(ui.Tooltip).toHaveBeenCalled();
    expect(ui.TooltipContent).toHaveBeenCalled();
  });

  it('does not use a Tooltip when the tooltip prop is omitted', async () => {
    const ui = vi.mocked(await import('@/components/ui/tooltip'));
    render(<ActionButton>Plain</ActionButton>);
    expect(screen.getByRole('button', { name: 'Plain' })).toBeInTheDocument();
    expect(ui.Tooltip).not.toHaveBeenCalled();
    expect(ui.TooltipContent).not.toHaveBeenCalled();
  });
});

describe('asChild composition', () => {
  it('forwards props and classes onto the child element (Link-style slot)', () => {
    render(
      <ActionButton asChild>
        <a href="/budgets">
          <Plus className="w-3.5 h-3.5 shrink-0" />
          Add Budget
        </a>
      </ActionButton>
    );
    const link = screen.getByRole('link', { name: 'Add Budget' });
    expect(link).toHaveAttribute('href', '/budgets');
    // Slot merges the computed className onto the child element
    expect(link.className).toContain('bg-accent');
    expect(link.className).toContain('h-8');
    expect(link.querySelector('svg')).toBeInTheDocument();
  });
});
