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

  const contextRef = useRef(context);
  contextRef.current = context;

  const stateRef = useRef<T>(state);
  stateRef.current = state;

  // Tracks the serialized value last written to the DB by this hook instance.
  // Initialized to the DB value on load so we never re-save what's already there.
  // Only updated when we actually call updateSetting — not during reads.
  const lastDbSavedRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    // Wait until the settings context has finished loading
    if (!context || context.loading) return;

    // Only initialize from DB/localStorage once per mount
    if (loadedFromDb.current) return;
    loadedFromDb.current = true;

    const dbValue = context.settings.chartSelections?.[key];

    if (dbValue !== undefined) {
      // DB has a value — use it and record it so we don't re-save it
      let parsed = dbValue as T;
      if (optionsRef.current?.deserialize) {
        try {
          parsed = optionsRef.current.deserialize(JSON.stringify(dbValue));
        } catch (e) {
          console.warn(`Error deserializing DB value for key "${key}":`, e);
        }
      }
      const valForDb = parsed instanceof Set ? Array.from(parsed) : parsed;
      lastDbSavedRef.current = JSON.stringify(valForDb);
      setState(parsed);
      stateRef.current = parsed;
      setIsLoaded(true);
      return;
    }

    // DB has no value — fall back to localStorage (read-only, no PATCH)
    try {
      const stored = localStorage.getItem(key);
      if (stored !== null) {
        const deserialize = optionsRef.current?.deserialize ?? JSON.parse;
        const parsed = deserialize(stored);
        setState(parsed);
        stateRef.current = parsed;
      }
    } catch (e) {
      console.warn(`Error reading localStorage key "${key}":`, e);
    } finally {
      setIsLoaded(true);
    }
  }, [key, context?.loading]);

  const setPersistentState = useCallback((value: T | ((prev: T) => T)) => {
    const prev = stateRef.current;
    const newValue = value instanceof Function ? value(prev) : value;

    stateRef.current = newValue;
    setState(newValue);

    // 1. Persist to localStorage
    try {
      const serialize = optionsRef.current?.serialize ?? JSON.stringify;
      localStorage.setItem(key, serialize(newValue));
    } catch (e) {
      console.warn(`Error writing localStorage key "${key}":`, e);
    }

    // 2. Persist to DB — only if the value actually changed from what we last saved.
    //    We use our own ref (not contextRef.current.settings) to avoid stale-closure
    //    race conditions where the context hasn't re-rendered yet after a prior PATCH.
    const currentContext = contextRef.current;
    if (currentContext && !currentContext.loading) {
      const valForDb = newValue instanceof Set ? Array.from(newValue) : newValue;
      const serialized = JSON.stringify(valForDb);
      if (lastDbSavedRef.current !== serialized) {
        lastDbSavedRef.current = serialized;
        currentContext.updateSetting('chartSelections', { [key]: valForDb });
      }
    }
  }, [key]);

  return [state, setPersistentState, isLoaded];
}
