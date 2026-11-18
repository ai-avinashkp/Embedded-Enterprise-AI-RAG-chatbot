import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { rateLimitConfig, usageLogs } from "@/lib/db/schema";

import { checkIpRateLimit, checkTenantRateLimit } from "./rate-limit";
import { moderateText } from "./moderation";

const DEFAULT_REQUESTS_PER_MINUTE = 20;
const DEFAULT_REQUESTS_PER_HOUR = 10;
const DEFAULT_REQUESTS_PER_DAY = 1000;

export type SafetyCheckResult =
  | { allowed: true }
  | { allowed: false; reason: "rate_limited" | "flagged"; message: string };

/**
 * Sequential, deterministic checks run before any LLM call — cheapest and
 * least-trusted-input-dependent first. Every rejection is logged to
 * usage_logs with its reason, and returns a clean message, never a raw
 * error dump, since this runs on the public widget-facing endpoint.
 */
export async function runSafetyChecks(params: {
  tenantId: string;
  ip: string;
  query: string;
  /** Demo tenant: skip the hourly tenant cap (it has a per-IP trial cap). */
  isDemoTenant?: boolean;
}): Promise<SafetyCheckResult> {
  const { tenantId, ip, query, isDemoTenant = false } = params;

  const ipOk = await checkIpRateLimit(ip);
  if (!ipOk) {
    await logRejection(tenantId, query, "rate_limited");
    return {
      allowed: false,
      reason: "rate_limited",
      message: "Too many requests — please slow down and try again shortly.",
    };
  }

  const [config] = await db
    .select()
    .from(rateLimitConfig)
    .where(eq(rateLimitConfig.tenantId, tenantId));

  const tenantResult = await checkTenantRateLimit({
    tenantId,
    requestsPerMinute: config?.requestsPerMinute ?? DEFAULT_REQUESTS_PER_MINUTE,
    requestsPerHour: isDemoTenant
      ? null
      : (config?.requestsPerHour ?? DEFAULT_REQUESTS_PER_HOUR),
    requestsPerDay: config?.requestsPerDay ?? DEFAULT_REQUESTS_PER_DAY,
  });
  if (!tenantResult.ok) {
    await logRejection(tenantId, query, "rate_limited");
    return {
      allowed: false,
      reason: "rate_limited",
      message: RATE_LIMIT_MESSAGES[tenantResult.window],
    };
  }

  const moderation = await moderateText(query);
  if (moderation.flagged) {
    await logRejection(tenantId, query, "flagged");
    return {
      allowed: false,
      reason: "flagged",
      message: "This message couldn't be processed. Please rephrase your question.",
    };
  }

  return { allowed: true };
}

const RATE_LIMIT_MESSAGES = {
  minute: "This chatbot is receiving too many requests right now — please try again in a minute.",
  hour: "This chatbot has reached its hourly question limit — please try again in an hour.",
  day: "This chatbot has reached its daily usage limit — please try again tomorrow.",
} as const;

async function logRejection(
  tenantId: string,
  query: string,
  reason: "rate_limited" | "flagged"
): Promise<void> {
  await db.insert(usageLogs).values({ tenantId, query, rejectedReason: reason });
}
