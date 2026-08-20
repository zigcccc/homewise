import { describe, expect, it } from 'vitest';

import { inviteHouseholdMembersQueryParamsModel } from './households.model';

describe('inviteHouseholdMembersQueryParamsModel', () => {
  // The value is embedded verbatim into the invite email, so the allowlist is the only thing
  // stopping us mailing an attacker's link from our own domain.
  it.each(['http://localhost:3000', 'https://dashboard.home-wise.app', 'https://home-wise.app'])(
    'should accept the allowed origin %s',
    (callbackUrl) => {
      expect(inviteHouseholdMembersQueryParamsModel.safeParse({ callbackUrl }).success).toBe(true);
    }
  );

  it.each([
    ['an unlisted origin', 'https://evil.com'],
    ['a lookalike subdomain', 'https://evil.dashboard.home-wise.app'],
    ['an allowed host carrying a path', 'https://dashboard.home-wise.app/evil'],
    ['a non-url', 'not-a-url'],
  ])('should refuse %s', (_what, callbackUrl) => {
    expect(inviteHouseholdMembersQueryParamsModel.safeParse({ callbackUrl }).success).toBe(false);
  });
});
