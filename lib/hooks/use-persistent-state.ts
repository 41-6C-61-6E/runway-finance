'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

export interface PersistentStateOptions<T> {
  serialize?: (val: T) => string;
  deserialize?: (raw: string) => T;
}

export function usePersistentState<T>(
  key: string,
  defaultValue: T,
  options?: PersistentStateOptions<T>
): [T, (val: T | ((prev: T) => T)) => void, boolean] {
  const [state, setState] = useState<T>(defaultValue);
  const [isLoaded, setIsLoaded] = useState(false);

  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
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
  }, [key]);

  const setPersistentState = useCallback((value: T | ((prev: T) => T)) => {
    setState((prev) => {
      const newValue = value instanceof Function ? value(prev) : value;
      try {
        const serialize = optionsRef.current?.serialize ?? JSON.stringify;
        localStorage.setItem(key, serialize(newValue));
      } catch (e) {
        console.warn(`Error writing localStorage key "${key}":`, e);
      }
      return newValue;
    });
  }, [key]);

  return [state, setPersistentState, isLoaded];
}
