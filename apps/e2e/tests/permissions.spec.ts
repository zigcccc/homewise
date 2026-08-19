import { API_URL } from '../playwright.config';
import { type APIRequestContext, expect, request, test } from '../support/test';

/**
 * What each read-only role may and may not call, asserted straight at the API.
 *
 * The UI gating is a courtesy; this is the boundary. Driven as raw requests rather than through the
 * browser on purpose — a hidden button proves nothing about what happens when someone asks anyway,
 * and this is the assertion that catches a sub-app mounted without its permission area.
 */

/** A request that must be refused, named so a failure reads as the hole it is. */
type Call = { body?: object; method: 'get' | 'post' | 'patch' | 'delete'; path: string };

const WRITES: Call[] = [
  { method: 'post', path: '/recipes', body: { title: 'Nope' } },
  { method: 'patch', path: '/recipes/1', body: { title: 'Nope' } },
  { method: 'delete', path: '/recipes/1' },
  { method: 'post', path: '/contacts', body: { name: 'Nope', type: 'other' } },
  { method: 'patch', path: '/contacts/1', body: { name: 'Nope' } },
  { method: 'delete', path: '/contacts/1' },
  { method: 'post', path: '/expenses', body: { title: 'Nope', amount: '1.00', recordedAt: '2026-01-01' } },
  { method: 'delete', path: '/expenses/1' },
  { method: 'post', path: '/expense-categories', body: { name: 'Nope' } },
  { method: 'post', path: '/shopping-lists', body: {} },
  { method: 'delete', path: '/shopping-lists/1' },
  { method: 'post', path: '/meal-plan/meals', body: { day: '2026-01-01', label: 'Nope' } },
  { method: 'delete', path: '/meal-plan/meals/1' },
  { method: 'post', path: '/storage-locations', body: { name: 'Nope' } },
  { method: 'delete', path: '/storage-locations/1' },
  { method: 'delete', path: '/storage-items/1' },
  { method: 'post', path: '/stores', body: { name: 'Nope' } },
  { method: 'post', path: '/ingredients', body: { name: 'Nope', category: 'other' } },
  { method: 'post', path: '/child-profiles', body: { memberId: 1 } },
  { method: 'delete', path: '/child-profiles/1' },
  { method: 'post', path: '/pet-profiles', body: { memberId: 1 } },
  { method: 'delete', path: '/pet-profiles/1' },
  { method: 'patch', path: '/medical-info/1', body: { medicalIdNumber: '1' } },
  { method: 'post', path: '/households/my/members', body: { members: [{ name: 'Nope', role: 'child' }] } },
  { method: 'delete', path: '/households/my/members/1' },
  { method: 'patch', path: '/households/my', body: { name: 'Nope' } },
];

/** Everything an external must not even be able to look at. */
const EXTERNAL_FORBIDDEN_READS: string[] = [
  '/contacts',
  '/expenses',
  '/expense-categories',
  '/shopping-lists',
  '/meal-plan?from=2026-01-01&to=2026-01-07',
  '/storage-locations',
  '/storage-items',
  '/stores',
  '/ingredients',
  '/activity',
  '/realtime/channel',
  '/realtime/auth',
  '/households/my/invites/active',
];

/** What each role is allowed to read, so the spec can't pass by refusing everything. */
const ALLOWED_READS = {
  child: ['/recipes', '/contacts', '/expenses', '/shopping-lists', '/storage-items', '/activity', '/households/my'],
  external: ['/recipes', '/child-profiles', '/pet-profiles', '/households/my'],
} as const;

async function call(api: APIRequestContext, { body, method, path }: Call) {
  return await api[method](`${API_URL}${path}`, body ? { data: body } : undefined);
}

for (const role of ['child', 'external'] as const) {
  test.describe(`${role} permissions`, () => {
    let api: APIRequestContext;

    test.beforeAll(async ({ household }) => {
      api = await request.newContext({ storageState: await household.sessionFor(role) });
    });

    test.afterAll(async () => {
      await api.dispose();
    });

    test(`refuses every write for a ${role}`, async () => {
      for (const write of WRITES) {
        const response = await call(api, write);

        expect(response.status(), `${write.method.toUpperCase()} ${write.path} should be refused for a ${role}`).toBe(
          403
        );
      }
    });

    test(`lets a ${role} read what it is meant to`, async () => {
      for (const path of ALLOWED_READS[role]) {
        const response = await call(api, { method: 'get', path });

        expect(response.status(), `GET ${path} should be readable by a ${role}`).toBe(200);
      }
    });
  });
}

test.describe('external permissions', () => {
  let api: APIRequestContext;

  test.beforeAll(async ({ household }) => {
    api = await request.newContext({ storageState: await household.sessionFor('external') });
  });

  test.afterAll(async () => {
    await api.dispose();
  });

  test('refuses the domains an external has no business in', async () => {
    for (const path of EXTERNAL_FORBIDDEN_READS) {
      const response = await call(api, { method: 'get', path });

      expect(response.status(), `GET ${path} should be refused for an external`).toBe(403);
    }
  });
});
