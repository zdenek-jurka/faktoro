import { getConfigValue, setConfigValue } from '@/repositories/config-storage-repository';
import { useCallback, useEffect, useState } from 'react';

const DISMISSED_HINT_PREFIX = 'ui.dismissed_hint.';

function getDismissedHintConfigKey(hintKey: string): string {
  return `${DISMISSED_HINT_PREFIX}${hintKey.trim()}`;
}

export function useDismissibleHint(hintKey?: string) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    let isMounted = true;
    const normalizedHintKey = hintKey?.trim();

    if (!normalizedHintKey) {
      setIsVisible(false);
      return;
    }

    setIsVisible(false);

    const loadHintState = async () => {
      try {
        const dismissed = await getConfigValue(getDismissedHintConfigKey(normalizedHintKey));
        if (isMounted) setIsVisible(dismissed !== '1');
      } catch {
        if (isMounted) setIsVisible(true);
      }
    };

    void loadHintState();

    return () => {
      isMounted = false;
    };
  }, [hintKey]);

  const dismiss = useCallback(async () => {
    const normalizedHintKey = hintKey?.trim();
    setIsVisible(false);
    if (!normalizedHintKey) return;

    try {
      await setConfigValue(getDismissedHintConfigKey(normalizedHintKey), '1');
    } catch {
      // Keep the dismissal optimistic for this session even if persistence fails.
    }
  }, [hintKey]);

  return { isVisible, dismiss };
}
