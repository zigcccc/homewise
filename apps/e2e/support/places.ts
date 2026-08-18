import { type Page } from '@playwright/test';

/**
 * Fakes Photon, the keyless OpenStreetMap geocoder behind `PlaceAutocomplete`.
 *
 * This is the one thing the suite fakes outright, and it is deliberate: Photon belongs to somebody
 * else, is free, and documents no SLA. Driving it live from every worker at once is the shape of
 * the Resend flakiness that produced `HOMEWISE_DISABLE_EMAILS` — plus the specs here are about what
 * the app does with an answer, not about whether a stranger's server has one. Every Homewise request
 * still goes to the real server.
 */

/** The parts of a Photon result the app actually reads. Everything else is filled in below. */
export type StubbedPlace = {
  name?: string;
  street?: string;
  housenumber?: string;
  city?: string;
  country?: string;
};

/**
 * Answers the place lookup from `byQuery`, matched on the search text the component sent. Anything
 * not listed comes back with no results, which is how a spec reaches the empty-list behaviour.
 */
export async function stubPlaceSearch(page: Page, byQuery: Record<string, StubbedPlace[]>) {
  await page.route(/photon\.komoot\.io/, async (route) => {
    const query = new URL(route.request().url()).searchParams.get('q') ?? '';

    await route.fulfill({
      contentType: 'application/json',
      json: {
        type: 'FeatureCollection',
        features: (byQuery[query] ?? []).map((place, index) => ({
          type: 'Feature',
          // Ljubljana, roughly. Nothing on a contact reads the coordinates back.
          geometry: { type: 'Point', coordinates: [14.505751, 46.056946] },
          properties: {
            // The component dedupes on this, so results sharing one would collapse into a single row.
            osm_id: 1_000_000 + index,
            osm_type: 'N',
            osm_key: 'place',
            osm_value: 'house',
            type: 'house',
            ...place,
          },
        })),
      },
    });
  });
}
