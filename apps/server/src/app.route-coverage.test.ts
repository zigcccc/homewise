import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const SRC = import.meta.dirname;

/**
 * Route apps that are deliberately not household-scoped, with the reason they get to be.
 *
 * Anything else mounted in `app.ts` must call `withHousehold(area)` — which is the whole guard, since
 * the argument is required by its type. Forgetting the mount is the only way to end up unprotected,
 * and this is what names the module when someone does.
 */
const UNSCOPED: Record<string, string> = {
  usersApp: 'operates on the caller’s own account, which exists before any household does',
};

describe('route coverage', () => {
  const appSource = fs.readFileSync(path.join(SRC, 'app.ts'), 'utf8');

  // `import usersApp from './modules/users';` — the identifier a mount names, and the folder it lives in.
  const moduleDirByIdentifier = new Map(
    [...appSource.matchAll(/import (\w+) from '\.\/modules\/([\w-]+)'/g)].map(([, identifier, dir]) => [
      String(identifier),
      String(dir),
    ])
  );

  const mounts = [...appSource.matchAll(/\.route\('([^']+)', (\w+)\)/g)].map(([, mountPath, identifier]) => ({
    identifier: String(identifier),
    mountPath: String(mountPath),
  }));

  it('should find every mounted route app', () => {
    // A regex that silently matched nothing would make every assertion below vacuous.
    expect(mounts.length).toBeGreaterThan(15);
  });

  it.each(mounts)('should scope $mountPath to a permission area', ({ identifier, mountPath }) => {
    if (identifier in UNSCOPED) {
      return;
    }

    const dir = moduleDirByIdentifier.get(identifier);
    expect(dir, `${mountPath} is mounted from an unknown module`).toBeDefined();

    const file = path.join(SRC, 'modules', String(dir), `${dir}.app.ts`);
    expect(fs.existsSync(file), `${mountPath} has no ${dir}.app.ts`).toBe(true);

    expect(
      fs.readFileSync(file, 'utf8').includes('withHousehold('),
      `${mountPath} (${dir}) is mounted without withHousehold(area) — every household-scoped app must declare one`
    ).toBe(true);
  });
});
