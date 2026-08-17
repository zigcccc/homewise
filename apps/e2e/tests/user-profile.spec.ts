import path from 'node:path';

import { UserProfilePage } from '../pages/user-profile.page';
import { expect, test } from '../support/test';

const AVATAR_FIXTURE = path.resolve(import.meta.dirname, '..', 'support', 'fixtures', 'avatar.png');

// The display-name spec lives in serial-seed-mutations.spec.ts (it mutates a
// shared seed row). Uploading/removing the picture touches only this user's own
// avatar, which nothing else observes, so it runs in parallel.
test.describe('user profile', () => {
  test('uploads a profile picture and removes it', async ({ page }) => {
    const profile = new UserProfilePage(page);
    await profile.goto();

    // Seed user starts with no picture (upload control shown, no preview).
    await expect(profile.picturePreview).toBeHidden();

    await profile.uploadPicture(AVATAR_FIXTURE);
    await expect(profile.picturePreview).toBeVisible();

    await profile.removePicture();
    await expect(profile.picturePreview).toBeHidden();
  });
});
