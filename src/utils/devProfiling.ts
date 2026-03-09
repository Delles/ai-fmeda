const isBrowser = typeof window !== 'undefined' && typeof navigator !== 'undefined';

export const isFmedaProfilingEnabled = (): boolean => {
  if (!import.meta.env.DEV || !isBrowser || typeof performance === 'undefined') {
    return false;
  }

  if (/jsdom/i.test(navigator.userAgent)) {
    return false;
  }

  return (
    window.location.search.includes('fmedaProfile=1') ||
    window.localStorage.getItem('fmeda-profile') === '1'
  );
};

export const logFmedaProfile = (
  scope: 'render' | 'store',
  label: string,
  details: Record<string, unknown>
): void => {
  if (!isFmedaProfilingEnabled()) {
    return;
  }

  console.debug(`[fmeda-${scope}] ${label}`, details);
};
