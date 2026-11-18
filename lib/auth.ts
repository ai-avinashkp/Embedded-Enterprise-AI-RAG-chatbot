import { eq } from "drizzle-orm";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";

import { authConfig } from "@/lib/auth.config";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { getOrCreateDemoTenant } from "@/lib/demo";
import { expireStaleSession } from "@/lib/documents";
import { safeEqual, verifyPassword } from "@/lib/password";

export const ADMIN_USERNAME = "admin";
const ADMIN_EMAIL = "admin@internal";

// One login form for everyone. Username "admin" + ADMIN_LOGIN_ID signs in
// the site owner, who manages the demo tenant (the public homepage widget).
// Anyone else signs in with the email + password they registered at
// /signup, which gave them their own tenant.
const credentialsProvider = Credentials({
  id: "credentials",
  name: "Username and password",
  credentials: {
    username: { label: "Username or email", type: "text" },
    password: { label: "Password", type: "password" },
  },
  async authorize(credentials) {
    const username =
      typeof credentials?.username === "string" ? credentials.username.trim().toLowerCase() : "";
    const password = typeof credentials?.password === "string" ? credentials.password : "";
    if (!username || !password) return null;

    if (username === ADMIN_USERNAME) return authorizeAdmin(password);

    const [user] = await db.select().from(users).where(eq(users.email, username));
    if (!user?.passwordHash || !(await verifyPassword(password, user.passwordHash))) {
      return null;
    }
    if (user.tenantId) await expireStaleSession(user.tenantId);

    return { id: user.id, name: user.name, email: user.email };
  },
});

async function authorizeAdmin(password: string) {
  const expected = process.env.ADMIN_LOGIN_ID;
  if (!expected || !safeEqual(password, expected)) return null;

  const demoTenant = await getOrCreateDemoTenant();
  const email = ADMIN_EMAIL;

  let [user] = await db.select().from(users).where(eq(users.email, email));
  if (!user) {
    [user] = await db
      .insert(users)
      .values({ email, name: "Admin", tenantId: demoTenant.id, role: "owner" })
      .returning();
  } else if (user.tenantId !== demoTenant.id) {
    [user] = await db
      .update(users)
      .set({ tenantId: demoTenant.id, role: "owner" })
      .where(eq(users.id, user.id))
      .returning();
  }

  return { id: user.id, name: user.name, email: user.email };
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [credentialsProvider],
  session: { strategy: "jwt" },
  secret: process.env.NEXTAUTH_SECRET ?? process.env.AUTH_SECRET,
  trustHost: true,
  callbacks: {
    ...authConfig.callbacks,
    async jwt({ token, user }) {
      if (user?.id) {
        const [dbUser] = await db
          .select({ tenantId: users.tenantId, role: users.role, email: users.email })
          .from(users)
          .where(eq(users.id, user.id));
        token.tenantId = dbUser?.tenantId ?? null;
        token.role = dbUser?.role ?? null;
        token.isAdmin = dbUser?.email === ADMIN_EMAIL;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.tenantId = token.tenantId as string | null;
        session.user.role = token.role as string | null;
        session.user.isAdmin = token.isAdmin === true;
      }
      return session;
    },
  },
});
