import { RefObject, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

interface UseVirtualWindowOptions {
  count: number;
  estimateSize: number;
  overscan?: number;
  scrollRef: RefObject<HTMLElement | null>;
  enabled?: boolean;
}

export interface VirtualItem {
  index: number;
  start: number;
  size: number;
  end: number;
}

const findNearestIndex = (offsets: number[], sizes: number[], value: number): number => {
  let low = 0;
  let high = offsets.length - 1;
  let nearest = 0;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const start = offsets[mid];
    const end = start + sizes[mid];

    if (value < start) {
      high = mid - 1;
    } else if (value >= end) {
      nearest = mid;
      low = mid + 1;
    } else {
      return mid;
    }
  }

  return nearest;
};

export const useVirtualWindow = ({
  count,
  estimateSize,
  overscan = 6,
  scrollRef,
  enabled = true,
}: UseVirtualWindowOptions) => {
  const sizeCacheRef = useRef<Map<number, number>>(new Map());
  const observerCacheRef = useRef<Map<number, ResizeObserver>>(new Map());
  const [viewportHeight, setViewportHeight] = useState(0);
  const [scrollTop, setScrollTop] = useState(0);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const sizeCache = sizeCacheRef.current;
    const observerCache = observerCacheRef.current;

    Array.from(sizeCache.keys()).forEach((index) => {
      if (index >= count) {
        sizeCache.delete(index);
      }
    });

    Array.from(observerCache.entries()).forEach(([index, observer]) => {
      if (index >= count) {
        observer.disconnect();
        observerCache.delete(index);
      }
    });
  }, [count]);

  useLayoutEffect(() => {
    const element = scrollRef.current;
    if (!enabled || !element) {
      setViewportHeight(0);
      setScrollTop(0);
      return;
    }

    const syncMetrics = () => {
      setViewportHeight(element.clientHeight);
      setScrollTop(element.scrollTop);
    };

    syncMetrics();

    const resizeObserver = new ResizeObserver(syncMetrics);
    resizeObserver.observe(element);
    element.addEventListener('scroll', syncMetrics, { passive: true });

    return () => {
      resizeObserver.disconnect();
      element.removeEventListener('scroll', syncMetrics);
    };
  }, [enabled, scrollRef]);

  useEffect(() => {
    const observerCache = observerCacheRef.current;

    return () => {
      observerCache.forEach((observer) => observer.disconnect());
      observerCache.clear();
    };
  }, []);

  const layout = (() => {
    const offsets: number[] = [];
    const sizes: number[] = [];
    let totalSize = 0;

    for (let index = 0; index < count; index += 1) {
      const size = sizeCacheRef.current.get(index) ?? estimateSize;
      offsets.push(totalSize);
      sizes.push(size);
      totalSize += size;
    }

    return { offsets, sizes, totalSize, version };
  })();

  const visibleRange = useMemo(() => {
    if (count === 0) {
      return { startIndex: 0, endIndex: -1 };
    }

    if (!enabled) {
      return { startIndex: 0, endIndex: count - 1 };
    }

    const maxOffset = Math.max(scrollTop + viewportHeight, 0);
    const rawStart = findNearestIndex(layout.offsets, layout.sizes, Math.max(scrollTop, 0));
    const rawEnd = findNearestIndex(layout.offsets, layout.sizes, maxOffset);

    return {
      startIndex: Math.max(0, rawStart - overscan),
      endIndex: Math.min(count - 1, rawEnd + overscan),
    };
  }, [count, enabled, layout.offsets, layout.sizes, overscan, scrollTop, viewportHeight]);

  const virtualItems = useMemo<VirtualItem[]>(() => {
    if (count === 0 || visibleRange.endIndex < visibleRange.startIndex) {
      return [];
    }

    const items: VirtualItem[] = [];
    for (let index = visibleRange.startIndex; index <= visibleRange.endIndex; index += 1) {
      const start = layout.offsets[index] ?? 0;
      const size = layout.sizes[index] ?? estimateSize;
      items.push({
        index,
        start,
        size,
        end: start + size,
      });
    }

    return items;
  }, [count, estimateSize, layout.offsets, layout.sizes, visibleRange.endIndex, visibleRange.startIndex]);

  const registerItem = useCallback((index: number, element: HTMLElement | null) => {
    const existingObserver = observerCacheRef.current.get(index);
    if (existingObserver) {
      existingObserver.disconnect();
      observerCacheRef.current.delete(index);
    }

    if (!enabled || !element) {
      return;
    }

    const syncHeight = () => {
      const nextSize = Math.ceil(element.getBoundingClientRect().height) || estimateSize;
      const previousSize = sizeCacheRef.current.get(index);

      if (previousSize !== nextSize) {
        sizeCacheRef.current.set(index, nextSize);
        setVersion((current) => current + 1);
      }
    };

    syncHeight();

    const observer = new ResizeObserver(syncHeight);
    observer.observe(element);
    observerCacheRef.current.set(index, observer);
  }, [enabled, estimateSize]);

  const scrollToIndex = useCallback((index: number) => {
    const element = scrollRef.current;
    if (!element || index < 0 || index >= count) {
      return;
    }

    const rowStart = layout.offsets[index] ?? 0;
    const rowSize = layout.sizes[index] ?? estimateSize;
    const rowEnd = rowStart + rowSize;
    const viewportStart = element.scrollTop;
    const viewportEnd = viewportStart + element.clientHeight;

    if (rowStart < viewportStart) {
      element.scrollTo({ top: rowStart });
      return;
    }

    if (rowEnd > viewportEnd) {
      element.scrollTo({ top: Math.max(0, rowEnd - element.clientHeight) });
    }
  }, [count, estimateSize, layout.offsets, layout.sizes, scrollRef]);

  return {
    totalSize: layout.totalSize,
    virtualItems,
    registerItem,
    scrollToIndex,
  };
};
