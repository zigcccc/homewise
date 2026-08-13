import { defineConfig } from 'vitest/config';

/**
 * The kit's own tests. Almost nothing here earns one — a component is E2E's job, and `cn` is two
 * lines over two well-tested libraries — so this project exists for the pure logic that a component
 * happens to be built on and that has edge cases a spec would have to manufacture data to reach.
 *
 * No `environment`, on purpose: the files in scope need no DOM, and node is faster.
 */
export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    include: ['src/**/*.test.{ts,tsx}'],
    name: 'ui',
  },
});
