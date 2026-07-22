import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/_authenticated/_onboarded/family/kids/$profileId/')({
  beforeLoad({ params }) {
    throw redirect({ to: '/family/kids/$profileId/general', params: { profileId: params.profileId } });
  },
});
