import { AuthError } from "next-auth";
import Link from "next/link";
import { redirect } from "next/navigation";

import { auth, signIn } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string; error?: string }>;
}) {
  const session = await auth();
  const { callbackUrl, error } = await searchParams;
  const redirectTo = callbackUrl ?? "/dashboard/settings";

  if (session) {
    redirect(redirectTo);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm border-2 border-border-strong shadow-hard">
        <CardHeader>
          <CardTitle className="text-2xl">Sign in</CardTitle>
          <CardDescription>Use the email and password you signed up with.</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            action={async (formData: FormData) => {
              "use server";
              try {
                await signIn("credentials", formData);
              } catch (error) {
                // signIn() signals success by throwing a redirect — only
                // swallow the auth failure, never that.
                if (error instanceof AuthError) {
                  redirect(`/login?error=invalid&callbackUrl=${encodeURIComponent(redirectTo)}`);
                }
                throw error;
              }
            }}
            className="space-y-3"
          >
            <input type="hidden" name="redirectTo" value={redirectTo} />
            <div className="space-y-1.5">
              <Label htmlFor="username">Email</Label>
              <Input id="username" name="username" required autoComplete="username" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                name="password"
                type="password"
                required
                autoComplete="current-password"
              />
            </div>
            {error ? (
              <p className="text-sm text-destructive">Wrong email or password.</p>
            ) : null}
            <Button type="submit" className="w-full" size="lg">
              Sign in
            </Button>
          </form>
          <p className="mt-4 text-center text-sm text-muted-foreground">
            No account?{" "}
            <Link href="/signup" className="font-medium text-foreground underline">
              Sign up
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
