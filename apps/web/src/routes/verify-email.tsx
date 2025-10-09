import { Button } from '@homewise/ui/core/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@homewise/ui/core/card';
import { Separator } from '@homewise/ui/core/separator';
import { createFileRoute, redirect } from '@tanstack/react-router';
import { toast } from 'sonner';
import z from 'zod';

import { authClient } from '@/auth/client';

export const Route = createFileRoute('/verify-email')({
  validateSearch: z.object({ email: z.email() }),
  async beforeLoad() {
    const session = await authClient.getSession();

    if (session.data?.user.emailVerified) {
      throw redirect({ to: '/' });
    }
  },
  component: VerifyEmailRoute,
  onError: () => {
    throw redirect({ to: '/login' });
  },
});

function VerifyEmailRoute() {
  const { email } = Route.useSearch();

  const handleRequestNewVerificationEmail = async () => {
    const a = await authClient.sendVerificationEmail(
      { email, callbackURL: window.location.origin },
      {
        onError: () => {
          toast.error('Something went wrong');
        },
        onSuccess: () => {
          toast.success('Verification email sent');
        },
      }
    );
    console.log(a.data?.status, a.error);
  };

  return (
    <main className="flex h-screen w-screen items-center justify-center">
      <div className="w-[450px] max-w-full">
        <Card>
          <CardHeader>
            <CardTitle>Alrighty, you&apos;re almost done!</CardTitle>
            <CardDescription>Email verification is still needed.</CardDescription>
          </CardHeader>
          <CardContent>
            <span className="text-sm">
              An email has been sent to <code>{email}</code>. You&apos;ll need to verify it by clicking on link attached
              to it before you can access your account.
            </span>
          </CardContent>
          <CardContent>
            <span className="text-muted-foreground text-sm">Already verified your email in another tab/window?</span>
            <Button className="mt-2 w-full" onClick={() => window.location.reload()} variant="outline">
              Reload this page
            </Button>
          </CardContent>
          <Separator />
          <CardContent>
            <span className="text-muted-foreground text-sm">
              Didn't receive an email?{' '}
              <Button className="px-1" onClick={handleRequestNewVerificationEmail} variant="link">
                Send another
              </Button>
            </span>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
