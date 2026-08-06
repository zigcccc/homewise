import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

/**
 * Unmounts whatever a test rendered.
 *
 * React Testing Library does this itself only when `afterEach` is a global, and `globals` is off —
 * so without this every rendered tree stays mounted for the rest of the file, and a hook that
 * subscribes to something keeps reacting to it while the next test runs.
 */
afterEach(cleanup);
