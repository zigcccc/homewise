import { zodResolver } from '@hookform/resolvers/zod';
import { createFileRoute, Link, redirect } from '@tanstack/react-router';
import { type SubmitHandler, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import * as z from 'zod';

import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Checkbox,
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  Input,
  Separator,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@homewise/ui/core';

import { authClient } from '@/auth/client';

const signupFormModel = z
  .object({
    email: z.email({ error: 'Not a valid email address' }),
    password: z
      .string()
      .min(8, { error: 'Must be at least 8 characters long' })
      .max(125, { error: 'Must be at most 125 characters long' }),
    passwordRepeat: z.string(),
    name: z.string().trim().min(3, { error: 'Too short' }).max(125, 'Too long'),
    rememberMe: z.boolean(),
  })
  .superRefine(({ password, passwordRepeat }, ctx) => {
    if (password !== passwordRepeat) {
      ctx.addIssue({
        path: ['passwordRepeat'],
        code: 'custom',
        message: 'Passwords should match',
      });
    }

    if (!/[a-z]/.test(password)) {
      ctx.addIssue({
        path: ['password'],
        code: 'custom',
        message: 'Must contain at least one lowercase letter',
      });
    }

    if (!/[A-Z]/.test(password)) {
      ctx.addIssue({
        path: ['password'],
        code: 'custom',
        message: 'Must contain at least one uppercase letter',
      });
    }

    if (!/\d/.test(password)) {
      ctx.addIssue({
        path: ['password'],
        code: 'custom',
        message: 'Must contain at least one number',
      });
    }

    if (!/[^A-Za-z0-9]/.test(password)) {
      ctx.addIssue({
        path: ['password'],
        code: 'custom',
        message: 'Must contain at least one special character',
      });
    }
  });

export const Route = createFileRoute('/signup')({
  validateSearch: z.object({ redirect: z.string().optional() }),
  async beforeLoad() {
    const session = await authClient.getSession();
    if (session?.data) {
      throw redirect({ to: '/', from: '/signup' });
    }
  },
  component: SignupRoute,
});

function SignupRoute() {
  const navigate = Route.useNavigate();
  const search = Route.useSearch();

  const form = useForm({
    resolver: zodResolver(signupFormModel),
    defaultValues: {
      email: '',
      password: '',
      passwordRepeat: '',
      name: '',
      rememberMe: false,
    },
  });

  const {
    formState: { errors, isSubmitting },
  } = form;

  const onSubmit: SubmitHandler<z.infer<typeof signupFormModel>> = async ({ passwordRepeat: _, ...data }) => {
    try {
      await authClient.signUp.email(
        { ...data, callbackURL: search?.redirect ?? window.location.origin },
        {
          onError: ({ error }) => {
            if (error.code === 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL') {
              form.setError('email', { message: error.message });
            } else {
              form.setError('root', { message: error.message });
            }
          },
          onSuccess: async () => {
            toast.success('Success', { richColors: true });
            navigate({
              to: '/verify-email',
              search: { email: data.email, redirect: search.redirect },
              from: '/signup',
            });
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
      <div className="w-112.5 max-w-full">
        <form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
          <Card className="w-full max-w-sm">
            <CardHeader>
              <CardTitle>Create an account</CardTitle>
              <CardDescription>Enter your details below to create to your account</CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...form}>
                <div className="space-y-4">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Full name</FormLabel>
                        <FormControl>
                          <Input placeholder="John Doe" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
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
                    name="passwordRepeat"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Repeat password</FormLabel>
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
                    render={({ field }) => {
                      return (
                        <FormItem className="flex flex-row items-center gap-2">
                          <FormControl>
                            <Checkbox
                              checked={field.value}
                              name={field.name}
                              onBlur={field.onBlur}
                              onCheckedChange={field.onChange}
                              ref={field.ref}
                            />
                          </FormControl>
                          <FormLabel className="font-normal text-sm">Remember me?</FormLabel>
                        </FormItem>
                      );
                    }}
                  />

                  {errors.root && (
                    <div className="rounded-md bg-red-100 px-4 py-3">
                      <span className="text-red-600 text-sm">{errors.root.message}</span>
                    </div>
                  )}
                </div>
              </Form>
            </CardContent>
            <CardFooter className="flex-col gap-2">
              <Button className="w-full" loading={isSubmitting} type="submit">
                Sign up
              </Button>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button className="w-full" disabled variant="outline">
                    Sign up with Google
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Not supported just yet, stay tuned!</TooltipContent>
              </Tooltip>
            </CardFooter>
            <Separator />
            <CardContent>
              <span className="text-muted-foreground text-sm">
                Already have an account?{' '}
                <Button asChild className="px-1" variant="link">
                  <Link preload={false} search={{ redirect: search.redirect }} to="/login">
                    Sign in
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
