"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/lib/auth";
import { setClearOtherTenantsOnUpload } from "@/lib/documents";

/** Admin only — flips the platform-wide "clear other tenants on upload" switch. */
export async function toggleClearOtherTenantsOnUpload(formData: FormData): Promise<void> {
  const session = await auth();
  if (!session?.user?.isAdmin) {
    throw new Error("Unauthorized");
  }

  await setClearOtherTenantsOnUpload(formData.get("enabled") === "true");
  revalidatePath("/dashboard/settings");
}
