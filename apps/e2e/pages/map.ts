import { expect, type Locator, type Page } from '@playwright/test';

/**
 * A Leaflet map, wherever one is drawn. A component object rather than a page object, like
 * `SearchBox`: every map in the app is the same `MapView` from the kit, so a page that renders one
 * should only have to say *which* one — and the awkward parts below are the map's, not the page's.
 *
 * Scope it with `within` when more than one map can be on screen at once. The create-location dialog
 * carries its own, and an unscoped locator resolves to whichever Leaflet mounted first.
 */
export class MapCanvas {
  private clip: { height: number; width: number; x: number; y: number } | null = null;

  constructor(
    private readonly page: Page,
    private readonly within?: Locator
  ) {}

  get container() {
    return (this.within ?? this.page).locator('.leaflet-container').first();
  }

  /**
   * Clicks the map, which is how a pin is dropped. The coordinates it lands on are whatever the
   * viewport happens to show, and that is the point — what a spec proves this way is that a click
   * produces a pin, not that it produces a particular latitude.
   */
  async click(position = { x: 160, y: 120 }) {
    await expect(this.container).toBeVisible();
    await this.container.click({ position });
  }

  /** Waits for the tile CDN to answer. A spec that needs this is a spec that needs the internet. */
  async waitForTiles() {
    await expect(this.container.locator('.leaflet-tile-loaded').first()).toBeVisible();
  }

  /**
   * A shot of the map's zoom button, taken from the same coordinates every time. Comparing two of
   * them is how a spec asks whether anything is drawn over the map: a dialog's overlay dims whatever
   * it covers, so the button darkens — and a map that paints over that overlay leaves it
   * pixel-identical. The button rather than the map itself because it is ours and opaque: tiles
   * arrive from a CDN, and a spec that waits for one is a spec that needs the internet.
   *
   * Asking the DOM instead does not work. Leaflet numbers its panes and control corners in the
   * hundreds, so unless the container opens a stacking context they outrank every Radix layer at
   * z-50 — but Radix also sets `pointer-events: none` on the page while a modal is open, and
   * Chromium's hit testing then stops reporting the map whether or not the map is what you see.
   * `elementFromPoint` and CDP's `getNodeForLocation` both answer "overlay" over a map that is
   * visibly on top of the dialog. The compositor is the only witness, so this reads pixels.
   */
  async settledControlShot() {
    // Until a tile has painted there is nothing over the overlay to measure — the map mounts lazily
    // and an empty one sits below the dialog quite correctly.
    await this.waitForTiles();

    let previous = await this.captureControl();

    for (let attempt = 0; attempt < 25; attempt++) {
      await this.page.waitForTimeout(200);
      const next = await this.captureControl();

      if (next.equals(previous)) {
        return next;
      }

      previous = next;
    }

    throw new Error('The map never stopped changing, so two shots of it prove nothing.');
  }

  private async captureControl() {
    // By attribute rather than by role: an open dialog `aria-hidden`s everything behind it, and a
    // role query would stop finding the very button whose look is the thing being measured.
    const box = await this.container.locator('[aria-label="Zoom in"]').boundingBox();

    if (!box) {
      throw new Error('The map is not on the page.');
    }

    // Inset, so the clip holds the button's own fill and nothing of the map behind its edges.
    const clip = {
      height: Math.round(box.height) - 6,
      width: Math.round(box.width) - 6,
      x: Math.round(box.x) + 3,
      y: Math.round(box.y) + 3,
    };

    if (this.clip && JSON.stringify(clip) !== JSON.stringify(this.clip)) {
      throw new Error('The map moved between shots, so comparing them proves nothing.');
    }

    this.clip = clip;

    return this.page.screenshot({ animations: 'disabled', clip });
  }
}
