import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/')({
  component: HomeRoute,
  pendingComponent: () => <p>Loading...</p>
});

function HomeRoute() {
  return (
    <div>
      <h1>Hello Homewise!</h1>
    </div>
  )
}