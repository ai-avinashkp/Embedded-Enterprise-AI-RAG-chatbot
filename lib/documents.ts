import { and, eq, lt, ne, type SQL } from "drizzle-orm";
import { rm } from "fs/promises";

import { db } from "@/lib/db";
import { documents, platformSettings, tenants } from "@/lib/db/schema";
import { getOrCreateDemoTenant } from "@/lib/demo";

// How long a tenant's document session lasts before its documents are
// cleared and have to be re-ingested.
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

const SETTINGS_ID = "global";

/**
 * Deletes matching documents (chunks go with them via cascade) and their
 * local stub blobs. Remote blob URLs are left alone until real storage
 * exists (see lib/blob.ts).
 */
async function deleteDocumentsWhere(where: SQL | undefined): Promise<number> {
  const deleted = await db
    .delete(documents)
    .where(where)
    .returning({ blobUrl: documents.blobUrl });

  await Promise.all(
    deleted.map(({ blobUrl }) =>
      blobUrl?.startsWith("local://")
        ? rm(blobUrl.slice("local://".length), { force: true })
        : undefined
    )
  );
  return deleted.length;
}

/**
 * If the tenant's 24h session has run out, clears all of its documents and
 * starts a fresh session. The demo tenant is exempt — its documents power
 * the public homepage and are managed by the admin.
 */
export async function expireStaleSession(tenantId: string): Promise<void> {
  const demoTenant = await getOrCreateDemoTenant();
  if (tenantId === demoTenant.id) return;

  const cutoff = new Date(Date.now() - SESSION_TTL_MS);
  const [expired] = await db
    .update(tenants)
    .set({ sessionStartedAt: new Date() })
    .where(and(eq(tenants.id, tenantId), lt(tenants.sessionStartedAt, cutoff)))
    .returning({ id: tenants.id });

  if (expired) {
    await deleteDocumentsWhere(eq(documents.tenantId, tenantId));
  }
}

export async function getClearOtherTenantsOnUpload(): Promise<boolean> {
  const [settings] = await db
    .select({ value: platformSettings.clearOtherTenantsOnUpload })
    .from(platformSettings)
    .where(eq(platformSettings.id, SETTINGS_ID));
  return settings?.value ?? false;
}

export async function setClearOtherTenantsOnUpload(value: boolean): Promise<void> {
  await db
    .insert(platformSettings)
    .values({ id: SETTINGS_ID, clearOtherTenantsOnUpload: value })
    .onConflictDoUpdate({
      target: platformSettings.id,
      set: { clearOtherTenantsOnUpload: value },
    });
}

/**
 * Runs after a successful upload. Switch ON: clears every other tenant's
 * documents (never the demo tenant's). Switch OFF: clears the uploader's
 * own older documents, so only the newly uploaded one remains.
 */
export async function clearDocumentsAfterUpload(params: {
  tenantId: string;
  keepDocumentId: string;
}): Promise<void> {
  const { tenantId, keepDocumentId } = params;

  if (await getClearOtherTenantsOnUpload()) {
    const demoTenant = await getOrCreateDemoTenant();
    await deleteDocumentsWhere(
      and(ne(documents.tenantId, tenantId), ne(documents.tenantId, demoTenant.id))
    );
  } else {
    await deleteDocumentsWhere(
      and(eq(documents.tenantId, tenantId), ne(documents.id, keepDocumentId))
    );
  }
}
