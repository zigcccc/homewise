import { Button } from '@homewise/ui/core/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@homewise/ui/core/card';
import { Checkbox } from '@homewise/ui/core/checkbox';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@homewise/ui/core/form';
import { Input } from '@homewise/ui/core/input';
import { Separator } from '@homewise/ui/core/separator';
import { Tooltip, TooltipContent, TooltipTrigger } from '@homewise/ui/core/tooltip';
import { zodResolver } from '@hookform/resolvers/zod';
import { createFileRoute, Link, redirect } from '@tanstack/react-router';
import { type SubmitHandler, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import * as z from 'zod';

import { authClient } from '@/auth/client';

const signinFormModel = z.object({
  email: z.email({ error: 'Not a valid email address' }),
  password: z.string().trim().min(4, { error: 'Too short' }),
  rememberMe: z.boolean(),
});

export const Route = createFileRoute('/login')({
  validateSearch: z.object({ redirect: z.string().optional() }),
  async beforeLoad({ search }) {
    const session = await authClient.getSession();
    if (session?.data) {
      throw redirect({ to: search.redirect ?? '/', from: '/login' });
    }
  },
  component: LoginRoute,
});

function LoginRoute() {
  const navigate = Route.useNavigate();
  const { redirect } = Route.useSearch();

  const form = useForm({
    resolver: zodResolver(signinFormModel),
    defaultValues: {
      email: '',
      password: '',
      rememberMe: false,
    },
  });

  const {
    formState: { errors, isSubmitting },
  } = form;

  const onSubmit: SubmitHandler<z.infer<typeof signinFormModel>> = async (data) => {
    try {
      await authClient.signIn.email(
        { ...data, callbackURL: redirect ?? window.location.origin },
        {
          onError: ({ error }) => {
            if (error.status === 403 && error.code === 'EMAIL_NOT_VERIFIED') {
              navigate({ to: '/verify-email', search: { email: data.email }, from: '/login' });
              return;
            }

            form.setError('root', { message: error.message });
          },
          onSuccess: () => {
            toast.success('Success', { richColors: true });
          },
        }
      );
    } catch (err) {
      // shouldn't happen :melting-face:
      console.log(err);
    }
  };

  return (
    <main className="flex h-screen w-screen items-center justify-center">
      <div className="w-[450px] max-w-full">
        <form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
          <Card className="w-full max-w-sm">
            <CardHeader>
              <CardTitle>Login to your account</CardTitle>
              <CardDescription>Enter your email below to login to your account</CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...form}>
                <div className="space-y-4">
                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email</FormLabel>
                        <FormControl>
                          <Input placeholder="your.name@email.com" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="password"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Password</FormLabel>
                        <FormControl>
                          <Input placeholder="••••••••" type="password" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="rememberMe"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center gap-2">
                        <FormControl>
                          <Checkbox
                            ref={field.ref}
                            checked={field.value}
                            name={field.name}
                            onBlur={field.onBlur}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                        <FormLabel className="text-sm font-normal">Remember me?</FormLabel>
                      </FormItem>
                    )}
                  />

                  {errors.root && (
                    <div className="rounded-md bg-red-100 px-4 py-3">
                      <span className="text-sm text-red-600">{errors.root.message}</span>
                    </div>
                  )}
                </div>
              </Form>
            </CardContent>
            <CardFooter className="flex-col gap-2">
              <Button className="w-full" loading={isSubmitting} type="submit">
                Login
              </Button>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button className="w-full" disabled variant="outline">
                    Login with Google
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Not supported just yet, stay tuned!</TooltipContent>
              </Tooltip>
            </CardFooter>
            <Separator />
            <CardContent>
              <span className="text-muted-foreground text-sm">
                Don't have an account?{' '}
                <Button asChild className="px-1" variant="link">
                  <Link preload={false} search={{ redirect }} to="/signup">
                    Sign up
                  </Link>
                </Button>
              </span>
            </CardContent>
          </Card>
        </form>
      </div>
    </main>
  );
}
