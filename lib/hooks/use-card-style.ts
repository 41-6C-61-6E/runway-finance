'use client';

import { useState, useEffect, useCallback } from 'react';

type CardStyle = 'rounded' | 'default' | 'square';

const CARD_STYLE_RADIUS: Record<CardStyle, string> = {
  rounded: '1rem',
  default: '0.5rem',
  square: '0.125rem',
};

export function useCardStyle() {
  const [cardStyle, setCardStyle] = useState<CardStyle>('default');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/user-settings', { credentials: 'include' })
      .then((res) => res.json())
      .then((data) => {
        const s = (data.cardStyle as CardStyle) || 'default';
        setCardStyle(s);
        applyCardStyle(s);
      })
      .catch(() => {
        applyCardStyle('default');
      })
      .finally(() => setLoading(false));
  }, []);

  const updateCardStyle = useCallback(async (style: CardStyle) => {
    setCardStyle(style);
    applyCardStyle(style);
    await fetch('/api/user-settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ cardStyle: style }),
    });
  }, []);

  return { cardStyle, loading, updateCardStyle };
}

function applyCardStyle(style: CardStyle) {
  document.documentElement.style.setProperty('--radius', CARD_STYLE_RADIUS[style]);
}
