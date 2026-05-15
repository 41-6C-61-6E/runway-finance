'use client';

import { useState, useEffect, useCallback } from 'react';

export function useAccountSubheadings() {
  const [hideSubheadings, setHideSubheadings] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/user-settings', { credentials: 'include', cache: 'no-store' })
      .then((res) => res.json())
      .then((data) => {
        const val = data.hideAccountSubheadings === true;
        setHideSubheadings(val);
        applyHideSubheadings(val);
      })
      .catch(() => {
        applyHideSubheadings(false);
      })
      .finally(() => setLoading(false));
  }, []);

  const updateHideSubheadings = useCallback(async (val: boolean) => {
    setHideSubheadings(val);
    applyHideSubheadings(val);
    await fetch('/api/user-settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ hideAccountSubheadings: val }),
    });
  }, []);

  return { hideSubheadings, loading, updateHideSubheadings };
}

function applyHideSubheadings(val: boolean) {
  if (val) {
    document.documentElement.classList.add('hide-account-subheadings');
  } else {
    document.documentElement.classList.remove('hide-account-subheadings');
  }
}
