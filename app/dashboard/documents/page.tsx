import { desc, eq } from "drizzle-orm";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { documents } from "@/lib/db/schema";
import { expireStaleSession, getClearOtherTenantsOnUpload } from "@/lib/documents";

import { clearAllDocuments, deleteDocument } from "./actions";
import { ClearAllButton } from "./clear-all-button";
import { DocumentsTable } from "./documents-table";
import { UploadForm } from "./upload-form";

export default async function DocumentsPage() {
  const session = await auth();
  if (!session?.user?.tenantId) {
    redirect("/login");
  }

  await expireStaleSession(session.user.tenantId);
  const clearOthers = await getClearOtherTenantsOnUpload();
  const retentionNote = [
    // The admin's (demo) documents are exempt from the 24h expiry.
    session.user.isAdmin ? null : "Documents are cleared 24 hours after your session starts.",
    clearOthers ? null : "Each upload replaces your previous documents.",
  ]
    .filter(Boolean)
    .join(" ");

  const tenantDocuments = await db
    .select()
    .from(documents)
    .where(eq(documents.tenantId, session.user.tenantId))
    .orderBy(desc(documents.uploadedAt));

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Documents</h1>
          <p className="text-sm text-muted-foreground">
            Upload policy, FAQ, pricing, and about docs to power the chatbot's
            retrieval. {retentionNote}
          </p>
        </div>
        {tenantDocuments.length > 0 ? <ClearAllButton onClear={clearAllDocuments} /> : null}
      </div>

      <UploadForm />

      <DocumentsTable documents={tenantDocuments} onDelete={deleteDocument} />
    </div>
  );
}
