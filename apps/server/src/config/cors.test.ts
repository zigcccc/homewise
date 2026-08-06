import { describe, expect, it } from 'vitest';

import { isAllowedOrigin } from '#config/cors';

describe('isAllowedOrigin', () => {
  it.each(['http://localhost:3000', 'https://home-wise.app', 'https://www.home-wise.app'])(
    'allows %s in every environment',
    (origin) => {
      expect(isAllowedOrigin(origin)).toBe(true);
    }
  );

  it.each([
    ['a missing origin', undefined],
    ['a null origin', null],
    ['an empty origin', ''],
  ])('refuses %s', (_what, origin) => {
    expect(isAllowedOrigin(origin)).toBe(false);
  });

  it('refuses another PR’s preview', () => {
    // The whole reason the allowance is an exact origin injected per deployment rather than a
    // *.vercel.app pattern: a pattern would trust every other preview in the account.
    expect(isAllowedOrigin('https://homewise-web-pr-99.vercel.app')).toBe(false);
  });

  it('refuses a lookalike of an allowed origin', () => {
    expect(isAllowedOrigin('https://home-wise.app.evil.com')).toBe(false);
    expect(isAllowedOrigin('https://evil-home-wise.app')).toBe(false);
    expect(isAllowedOrigin('http://home-wise.app')).toBe(false);
  });

  it('refuses an allowed host on a different port', () => {
    expect(isAllowedOrigin('http://localhost:3001')).toBe(false);
  });

  it('refuses a trailing slash', () => {
    // Browsers never send one, so anything that has one was assembled by hand.
    expect(isAllowedOrigin('https://home-wise.app/')).toBe(false);
  });
});
