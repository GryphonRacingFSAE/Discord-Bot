import { config } from "dotenv";

// Load environment variables
config();

const POSTHOG_HOST = "https://us.i.posthog.com";
const API_KEY = Deno.env.get("POSTHOG_API_KEY");

if (!API_KEY) {
  console.error("Missing POSTHOG_API_KEY in environment.");
  Deno.exit(1);
}

type Flag = {
  key: string;
  enabled: boolean;
  variant?: string;
  reason?: unknown;
  metadata: {
    id: number;
    version: number;
    payload?: string;
  };
};

interface FlagsResponse {
  flags: Record<string, Flag>;
  errorsWhileComputingFlags: boolean;
  quotaLimited?: string[];
  requestId?: string;
}

/**
 * @desc Get global feature flags from PostHog
 */
async function evaluate_global_flags(): Promise<Record<string, Flag>> {
  const body = {
    api_key: API_KEY,
    distinct_id: "global_instance", // Use a global identifier
  };

  const resp = await fetch(`${POSTHOG_HOST}/flags?v=2`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`PostHog /flags request failed: ${resp.status} ${text}`);
  }

  const data = (await resp.json()) as FlagsResponse;
  return data.flags;
}

/**
 * @desc Check if a global feature flag is enabled.
 * @returns True if the flag is enabled, false otherwise.
 */
async function isFeatureEnabled(flagKey: string): Promise<boolean> {
  try {
    const flags = await evaluate_global_flags();
    return flags[flagKey]?.enabled ?? false;
  } catch (error) {
    console.warn(`Failed to get flag ${flagKey}:`, error);
    return false;
  }
}

export {
  isFeatureEnabled,
  type Flag,
  type FlagsResponse,
};
