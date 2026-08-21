import { describe, expect, it } from 'vitest';

import { isAllowedOrigin } from '#config/cors';

describe('isAllowedOrigin', () => {
  it.each([
    'http://localhost:3000',
    'https://dashboard.home-wise.app',
    'https://home-wise.app',
    'https://www.home-wise.app',
  ])('should allow %s in every environment', (origin) => {
    expect(isAllowedOrigin(origin)).toBe(true);
  });

  it.each([
    ['a missing origin', undefined],
    ['a null origin', null],
    ['an empty origin', ''],
  ])('should refuse %s', (_what, origin) => {
    expect(isAllowedOrigin(origin)).toBe(false);
  });

  it('should refuse another PR’s preview', () => {
    // The allowance is one exact origin injected per deployment, because a *.vercel.app pattern
    // would trust every other preview in the account.
    expect(isAllowedOrigin('https://homewise-web-pr-99.vercel.app')).toBe(false);
  });

  it.each([
    ['a suffix attack', 'https://home-wise.app.evil.com'],
    ['a prefix attack', 'https://evil-home-wise.app'],
    ['the wrong scheme', 'http://home-wise.app'],
    // The list holds a subdomain now, so a suffix match would start letting these through.
    ['a deeper subdomain', 'https://evil.dashboard.home-wise.app'],
    ['an unlisted subdomain', 'https://staging.home-wise.app'],
  ])('should refuse %s', (_what, origin) => {
    expect(isAllowedOrigin(origin)).toBe(false);
  });

  it('should refuse an allowed host on a different port', () => {
    expect(isAllowedOrigin('http://localhost:3001')).toBe(false);
  });

  it('should refuse a trailing slash', () => {
    // Browsers never send one, so anything that has one was assembled by hand.
    expect(isAllowedOrigin('https://home-wise.app/')).toBe(false);
  });
});
