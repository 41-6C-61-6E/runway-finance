'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useUserSettings } from '@/components/user-settings-provider';

export interface PersistentStateOptions<T> {
  serialize?: (val: T) => string;
  deserialize?: (raw: string) => T;
}

export function usePersistentState<T>(
  key: string,
  defaultValue: T,
  options?: PersistentStateOptions<T>
): [T, (val: T | ((prev: T) => T)) => void, boolean] {
  const context = useUserSettings();
  const [state, setState] = useState<T>(defaultValue);
  const [isLoaded, setIsLoaded] = useState(false);
  const loadedFromDb = useRef(false);

  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    // If user settings context is available and finished loading, try initializing from DB
    if (context && !context.loading && !loadedFromDb.current) {
      loadedFromDb.current = true;
      const dbValue = context.settings.chartSelections?.[key];
      if (dbValue !== undefined) {
        setState(dbValue);
        setIsLoaded(true);
        return;
      }
    }

    // Only fallback to localStorage once DB load is completed (or if context is not available)
    if (!context || !context.loading) {
      try {
        const stored = localStorage.getItem(key);
        if (stored !== null) {
          const deserialize = optionsRef.current?.deserialize ?? JSON.parse;
          setState(deserialize(stored));
        }
      } catch (e) {
        console.warn(`Error reading localStorage key "${key}":`, e);
      } finally {
        setIsLoaded(true);
      }
    }
  }, [key, context?.loading]);

  const setPersistentState = useCallback((value: T | ((prev: T) => T)) => {
    setState((prev) => {
      const newValue = value instanceof Function ? value(prev) : value;
      
      // Persist to local storage
      try {
        const serialize = optionsRef.current?.serialize ?? JSON.stringify;
        localStorage.setItem(key, serialize(newValue));
      } catch (e) {
        console.warn(`Error writing localStorage key "${key}":`, e);
      }

      // Persist to database via context
      if (context) {
        context.updateSetting('chartSelections', { [key]: newValue });
      }

      return newValue;
    });
  }, [key, context]);

  return [state, setPersistentState, isLoaded];
}
