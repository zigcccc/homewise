import { type Locator, type Page } from '@playwright/test';

/**
 * The pointer path for a dnd-kit drag, shared by every page that has one. A component object rather
 * than a page object — like {@link ../pages/search-box.ts SearchBox}, it's owned by whichever page
 * renders a draggable and knows nothing about that page's semantics.
 *
 * Worth sharing because none of this is obvious, and each piece of it has already cost a bug:
 *
 * - The raw `mouse` API works in **absolute viewport coordinates** and does no scrolling of its own,
 *   so every box has to be read after the scroll has settled. Measure mid-scroll and `mouse.down()`
 *   lands beside the handle rather than on it — and the drag then never starts, silently.
 * - dnd-kit activates on **measured pointer travel**, so the pointer has to move in steps. A single
 *   `mouse.move` to the destination is a teleport it never sees.
 * - dnd-kit resolves the drop target on its **own frame**, so a release that follows the last move
 *   immediately can land before the target is known — and the drop goes back where it came from with
 *   nothing to show for it.
 *
 * Keep pointer drags alongside whatever keyboard or menu path does the same job: the two share no
 * application code, so a broken drag sails straight past a menu-driven spec.
 */
export class Drag {
  constructor(private readonly page: Page) {}

  /** Drags `handle` onto the centre of `target`. */
  async onto(handle: Locator, target: Locator) {
    const [from, to] = await this.stableBoxes(handle, target);

    await this.travel(
      { x: from.x + from.width / 2, y: from.y + from.height / 2 },
      { x: to.x + to.width / 2, y: to.y + to.height / 2 }
    );
  }

  /**
   * Drags `handle` by a displacement the caller worked out from its own layout.
   *
   * For a sortable where landing *on* the target's centre would be wrong — one row pitch keeps the
   * pointer at the same offset within the destination row, while the target's centre would also drag
   * it sideways across the row.
   */
  async by(handle: Locator, offset: { x?: number; y: number }) {
    const from = await this.stableBox(handle);
    const x = from.x + from.width / 2;
    const y = from.y + from.height / 2;

    await this.travel({ x, y }, { x: x + (offset.x ?? 0), y: y + offset.y });
  }

  /**
   * Scrolls `locator` into view and returns its box once it has stopped moving — two identical reads
   * in a row. `scrollIntoViewIfNeeded` resolves before the scroll has settled, so a box read straight
   * afterwards can already be stale by the time it's used.
   */
  /**
   * Two boxes in one coordinate space.
   *
   * `stableBox` scrolls its own locator into view, so reading one box and then the other can leave
   * the first describing a scroll position the second no longer shares — and anything derived from
   * the pair, a row pitch above all, is then off by however far the page moved in between. Settle
   * both first, re-read both after.
   */
  async stableBoxes(first: Locator, second: Locator) {
    await this.stableBox(first);
    await this.stableBox(second);

    const [a, b] = [await first.boundingBox(), await second.boundingBox()];

    if (!a || !b) {
      throw new Error('One of the two elements has no bounding box.');
    }

    return [a, b] as const;
  }

  async stableBox(locator: Locator) {
    await locator.scrollIntoViewIfNeeded();

    let previous = await locator.boundingBox();

    for (let attempt = 0; attempt < 20; attempt += 1) {
      await this.page.waitForTimeout(50);
      const current = await locator.boundingBox();

      if (previous && current && previous.x === current.x && previous.y === current.y) {
        return current;
      }

      previous = current;
    }

    throw new Error('Bounding box never settled.');
  }

  private async travel(from: { x: number; y: number }, to: { x: number; y: number }) {
    await this.page.mouse.move(from.x, from.y);
    await this.page.mouse.down();

    for (const fraction of [0.05, 0.2, 0.4, 0.6, 0.8, 0.95, 1]) {
      await this.page.mouse.move(from.x + (to.x - from.x) * fraction, from.y + (to.y - from.y) * fraction);
    }

    await this.page.waitForTimeout(200);
    await this.page.mouse.up();
  }
}
