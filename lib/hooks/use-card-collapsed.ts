'use client';

import { useCallback, useState, useEffect } from 'react';
import { useUserSettings } from '@/components/user-settings-provider';

/**
 * Hook to manage the collapsed/expanded state of a card.
 * Persists the state to the user settings database.
 *
 * @param cardId - Unique identifier for the card (e.g., 'netWorthSummary', 'incomeExpenseChart')
 * @returns [isCollapsed, setIsCollapsed] - Current collapsed state and setter function
 */
export function useCardCollapsed(
  cardId: string,
  defaultCollapsed: boolean = false
): [boolean, (collapsed: boolean) => void] {
  const context = useUserSettings();
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);
  const [isLoaded, setIsLoaded] = useState(false);

  // Load initial state from context
  useEffect(() => {
    if (context) {
      const cardCollapsedStates = context.settings?.cardCollapsedStates || {};
      if (cardCollapsedStates[cardId] !== undefined) {
        setIsCollapsed(cardCollapsedStates[cardId] === true);
      } else {
        setIsCollapsed(defaultCollapsed);
      }
      setIsLoaded(true);
    }
  }, [context, cardId, defaultCollapsed]);

  // Listen for changes in the context (e.g., from other tabs/components)
  useEffect(() => {
    if (context && isLoaded) {
      const cardCollapsedStates = context.settings?.cardCollapsedStates || {};
      if (cardCollapsedStates[cardId] !== undefined) {
        setIsCollapsed(cardCollapsedStates[cardId] === true);
      }
    }
  }, [context?.settings?.cardCollapsedStates, cardId, isLoaded]);

  const toggleCollapsed = useCallback(
    (collapsed: boolean) => {
      setIsCollapsed(collapsed);
      context?.updateSetting('cardCollapsedStates', { [cardId]: collapsed });
    },
    [cardId, context]
  );

  return [isCollapsed, toggleCollapsed];
}
