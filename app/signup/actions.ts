"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";

import { ADMIN_USERNAME, signIn } from "@/lib/auth";
import { db } from "@/lib/db";
import { rateLimitConfig, tenants, users } from "@/lib/db/schema";
import { generateSecretKey, generateSiteKey } from "@/lib/keys";
import { hashPassword } from "@/lib/password";

const MIN_PASSWORD_LENGTH = 8;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function fail(error: string): never {
  redirect(`/signup?error=${encodeURIComponent(error)}`);
}

/**
 * Public signup: every account gets its own tenant (own site key, own
 * documents, own model keys), with the new user as its owner.
 */
export async function signup(formData: FormData): Promise<void> {
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!name) fail("Enter a workspace name.");
  if (!EMAIL_PATTERN.test(email) || email === ADMIN_USERNAME) fail("Enter a valid email.");
  if (password.length < MIN_PASSWORD_LENGTH) {
    fail(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  }

  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email));
  if (existing) fail("An account with this email already exists — sign in instead.");

  const passwordHash = await hashPassword(password);

  await db.transaction(async (tx) => {
    const [tenant] = await tx
      .insert(tenants)
      .values({ name, siteKey: generateSiteKey(), secretKey: generateSecretKey() })
      .returning({ id: tenants.id });
    await tx.insert(rateLimitConfig).values({ tenantId: tenant.id });
    await tx
      .insert(users)
      .values({ email, name, passwordHash, tenantId: tenant.id, role: "owner" });
  });

  await signIn("credentials", {
    username: email,
    password,
    redirectTo: "/dashboard/documents",
  });
}
