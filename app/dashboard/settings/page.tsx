import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";

import { auth, signOut } from "@/lib/auth";
import { db } from "@/lib/db";
import { tenants } from "@/lib/db/schema";
import { getClearOtherTenantsOnUpload } from "@/lib/documents";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

import { toggleClearOtherTenantsOnUpload } from "./actions";

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user?.tenantId) {
    redirect("/login");
  }

  const [tenant] = await db
    .select()
    .from(tenants)
    .where(eq(tenants.id, session.user.tenantId));

  if (!tenant) {
    redirect("/login");
  }

  const clearOthers = session.user.isAdmin ? await getClearOtherTenantsOnUpload() : false;

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Workspace settings</h1>
        <form
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/login" });
          }}
        >
          <Button variant="outline" type="submit">
            Sign out
          </Button>
        </form>
      </div>

      <Card className="border-2 border-border-strong shadow-hard">
        <CardHeader>
          <CardTitle>{tenant.name}</CardTitle>
          <CardDescription>
            Signed in as {session.user.email}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-muted-foreground">
              Plan
            </span>
            <Badge variant="secondary">{tenant.plan}</Badge>
          </div>
          <Separator />
          <div className="space-y-1">
            <span className="text-sm font-medium text-muted-foreground">
              Site key
            </span>
            <p className="break-all font-mono text-sm">{tenant.siteKey}</p>
          </div>
          <div className="space-y-1">
            <span className="text-sm font-medium text-muted-foreground">
              Secret key
            </span>
            <p className="break-all font-mono text-sm">
              {tenant.secretKey.slice(0, 8)}
              {"•".repeat(24)}
            </p>
          </div>
          <Separator />
          <div className="text-sm text-muted-foreground">
            Usage overview coming in Phase 9.
          </div>
        </CardContent>
      </Card>

      {session.user.isAdmin ? (
        <Card className="border-2 border-border-strong shadow-hard">
          <CardHeader>
            <CardTitle>Document clearing on upload</CardTitle>
            <CardDescription>
              {clearOthers
                ? "ON: when anyone uploads a document, every other user's documents are deleted. Demo documents are always kept."
                : "OFF: when someone uploads a document, only their own previous documents are deleted."}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex items-center justify-between">
            <Badge variant={clearOthers ? "default" : "secondary"}>
              {clearOthers ? "Clear other users" : "Clear own documents only"}
            </Badge>
            <form action={toggleClearOtherTenantsOnUpload}>
              <input type="hidden" name="enabled" value={clearOthers ? "false" : "true"} />
              <Button type="submit" variant="outline" size="sm">
                Turn {clearOthers ? "off" : "on"}
              </Button>
            </form>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
