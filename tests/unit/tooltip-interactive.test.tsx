// @vitest-environment jsdom
import React, { useState } from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip';

describe('Tooltip interactive children and global dismiss behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 1200 });
  });

  it('does not close tooltip on pointerdown or click when clicking an interactive link or button inside TooltipContent', () => {
    const handleButtonClick = vi.fn();
    const handleLinkClick = vi.fn((e) => e.preventDefault());

    function TestComponent() {
      const [open, setOpen] = useState(true);
      return (
        <TooltipProvider>
          <Tooltip open={open} onOpenChange={setOpen}>
            <TooltipTrigger asChild>
              <button>Trigger</button>
            </TooltipTrigger>
            <TooltipContent>
              <button onClick={handleButtonClick} data-testid="interactive-btn">
                Click Action
              </button>
              <a href="/test" onClick={handleLinkClick} data-testid="interactive-link">
                Link Action
              </a>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    }

    render(<TestComponent />);

    const button = screen.getByTestId('interactive-btn');
    const link = screen.getByTestId('interactive-link');

    // Pointer down on button should not dismiss
    fireEvent.pointerDown(button);
    expect(screen.queryByTestId('interactive-btn')).not.toBeNull();

    // Click on button should trigger click handler
    fireEvent.click(button);
    expect(handleButtonClick).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('interactive-btn')).not.toBeNull();

    // Click on link should trigger link handler
    fireEvent.pointerDown(link);
    fireEvent.click(link);
    expect(handleLinkClick).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('interactive-link')).not.toBeNull();
  });

  it('global dismiss does not close tooltip when clicking inside tooltip content', () => {
    vi.useFakeTimers();

    function TestComponent() {
      const [open, setOpen] = useState(true);
      return (
        <TooltipProvider>
          <Tooltip open={open} onOpenChange={setOpen}>
            <TooltipTrigger asChild>
              <button>Trigger</button>
            </TooltipTrigger>
            <TooltipContent>
              <div data-testid="inside-content">Inside Tooltip</div>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    }

    render(<TestComponent />);

    // Fast-forward past the 50ms timer for global dismiss listener
    act(() => {
      vi.advanceTimersByTime(100);
    });

    const insideEl = screen.getByTestId('inside-content');

    // Pointer down inside the tooltip should NOT dismiss it
    act(() => {
      window.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
    });

    vi.useRealTimers();
  });
});
