import { useEffect, useRef } from 'react';
import { isFmedaProfilingEnabled, logFmedaProfile } from '../utils/devProfiling';

export const useDevRenderProfile = (
  label: string,
  details: Record<string, unknown>
): void => {
  const commitCountRef = useRef(0);
  const renderStartedAt = typeof performance !== 'undefined' ? performance.now() : 0;

  useEffect(() => {
    if (!isFmedaProfilingEnabled()) {
      return;
    }

    commitCountRef.current += 1;
    logFmedaProfile('render', label, {
      commitCount: commitCountRef.current,
      renderMs: Number((performance.now() - renderStartedAt).toFixed(2)),
      ...details,
    });
  });
};
