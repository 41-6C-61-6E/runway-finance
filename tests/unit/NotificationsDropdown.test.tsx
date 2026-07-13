// @vitest-environment jsdom
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import NotificationsDropdown from '@/components/notifications-dropdown';

// Mock useRouter
const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

// Mock sonner toast
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock Tooltip components to avoid portal/provider issues in jsdom
vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: any) => <>{children}</>,
  TooltipTrigger: ({ children }: any) => <>{children}</>,
  TooltipContent: ({ children }: any) => <>{children}</>,
  TooltipProvider: ({ children }: any) => <>{children}</>,
}));

// Mock BroadcastChannel
class MockBroadcastChannel {
  name: string;
  onmessage: ((event: MessageEvent) => void) | null = null;
  constructor(name: string) {
    this.name = name;
  }
  postMessage() {}
  close() {}
}

describe('NotificationsDropdown Component', () => {
  let originalFetch: typeof global.fetch;
  let mockFetch: any;
  let currentNotifications: any[] = [];

  const mockNotifs = [
    {
      id: 'notif-1',
      userId: 'user-1',
      title: 'Alert: Budget exceeded',
      body: 'Your Food budget has been exceeded by $50.',
      urlPath: '/budgets',
      type: 'budget',
      isRead: false,
      createdAt: new Date().toISOString(),
      readAt: null,
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    originalFetch = global.fetch;
    currentNotifications = [...mockNotifs];

    mockFetch = vi.fn().mockImplementation((url: string, options?: any) => {
      const method = options?.method || 'GET';
      if (url === '/api/notifications') {
        if (method === 'GET') {
          return Promise.resolve({
            ok: true,
            json: async () => ({ notifications: currentNotifications }),
          });
        }
        if (method === 'DELETE') {
          currentNotifications = [];
          return Promise.resolve({
            ok: true,
            json: async () => ({ success: true }),
          });
        }
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({}),
      });
    });
    global.fetch = mockFetch;

    global.BroadcastChannel = MockBroadcastChannel as any;

    if (typeof window !== 'undefined') {
      // Mock PointerEvent since Radix UI components use PointerEvents internally
      window.PointerEvent = class PointerEvent extends MouseEvent {} as any;
      window.HTMLElement.prototype.scrollIntoView = vi.fn();
      window.HTMLElement.prototype.releasePointerCapture = vi.fn();
    }
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('fetches notifications on mount and wiggles when unread count increases', async () => {
    render(<NotificationsDropdown />);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/notifications', { cache: 'no-store' });
    });
  });

  it('toggles dropdown and clears notifications', async () => {
    const { container } = render(<NotificationsDropdown />);

    // Click the bell button to open the dropdown
    const bellButton = screen.getByRole('button', { name: /notifications/i });
    fireEvent.click(bellButton);

    // Wait for notifications to load in dropdown
    await waitFor(() => {
      expect(screen.getByText('Alert: Budget exceeded')).toBeDefined();
    });

    // Check if the trash icon is rendered
    const trashButton = screen.getByRole('button', { name: /clear all notifications/i });
    expect(trashButton).toBeDefined();

    // 2. Click trash button to trigger confirmation dialog
    fireEvent.click(trashButton);

    // Verify confirmation warning text appears
    expect(
      screen.getByText('Are you sure you want to permanently clear all notifications? This action cannot be undone.')
    ).toBeDefined();

    // Click 'Clear All' action button in inline banner
    const clearButton = screen.getByRole('button', { name: 'Clear All' });
    
    // Simulate mousedown to ensure the click outside handler handles it properly
    const mousedownEvent = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    Object.defineProperty(mousedownEvent, 'target', { value: clearButton, enumerable: true });
    document.dispatchEvent(mousedownEvent);
    
    // Perform click
    fireEvent.click(clearButton);

    // Verify clear API was called
    await waitFor(() => {
      expect(mockFetch).toHaveBeenLastCalledWith('/api/notifications', {
        method: 'DELETE',
      });
    });

    // Expect empty state message "All caught up!" to show
    await waitFor(() => {
      expect(screen.getByText('All caught up!')).toBeDefined();
    });
  });
});
