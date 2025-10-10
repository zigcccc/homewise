import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/_authenticated')({
  async beforeLoad({ context: _ }) {
    // const session = await context.queryClient.ensureQueryData(getSessionQueryOptions());
    // if (!session?.data) {
    //   throw redirect({ to: '/login', search: { redirect: location.href } });
    // }
    // return session.data;
  },
});
