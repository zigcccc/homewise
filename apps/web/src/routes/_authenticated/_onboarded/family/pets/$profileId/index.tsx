import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/_authenticated/_onboarded/family/pets/$profileId/')({
  beforeLoad({ params }) {
    throw redirect({ to: '/family/pets/$profileId/general', params: { profileId: params.profileId } });
  },
});
