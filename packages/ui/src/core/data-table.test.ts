import { describe, expect, it } from 'vitest';

import { pageWindow } from './data-table';

/**
 * The page strip's arithmetic. Worth pinning rather than eyeballing: every case below is a household
 * with a specific number of pages, and reaching most of them through the UI means manufacturing
 * hundreds of rows first.
 *
 * Two properties carry the whole component — the strip is a fixed width, and it always contains the
 * page you are on — and neither is visible from any single example.
 */
describe('pageWindow', () => {
  it('should list every page while they all fit', () => {
    expect(pageWindow(3, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('should keep the run against the left edge on the first pages, with one gap on the right', () => {
    expect(pageWindow(2, 20)).toEqual([1, 2, 3, 4, 5, 'gap-after', 20]);
  });

  it('should keep the run against the right edge on the last pages, with one gap on the left', () => {
    expect(pageWindow(19, 20)).toEqual([1, 'gap-before', 16, 17, 18, 19, 20]);
  });

  it('should centre the current page between two gaps in the middle', () => {
    expect(pageWindow(10, 20)).toEqual([1, 'gap-before', 9, 10, 11, 'gap-after', 20]);
  });

  it('should still offer the first page when there is only one', () => {
    expect(pageWindow(1, 1)).toEqual([1]);
  });

  // The two edge runs are sized to spend the slot their missing gap frees, so a window that swapped
  // to the other branch one page early would come back a button short and shift the whole strip.
  it.each([8, 9, 20, 100])('should always be a fixed width once there are %i pages', (pageCount) => {
    for (let page = 1; page <= pageCount; page++) {
      expect(pageWindow(page, pageCount)).toHaveLength(7);
    }
  });

  it.each([8, 9, 20, 100])('should always contain the current page out of %i', (pageCount) => {
    for (let page = 1; page <= pageCount; page++) {
      expect(pageWindow(page, pageCount)).toContain(page);
    }
  });
});
