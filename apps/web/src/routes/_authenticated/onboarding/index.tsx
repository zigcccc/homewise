import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/_authenticated/onboarding/')({
  beforeLoad() {
    throw redirect({ to: '/onboarding/create-household' });
  },
});
