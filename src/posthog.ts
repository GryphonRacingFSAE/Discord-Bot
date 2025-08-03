import { PostHog } from "posthog-node";
import { config } from "dotenv";

// Load environment variables
config();

const POSTHOG_API_KEY = Deno.env.get("POSTHOG_API_KEY");

// Initialize PostHog client only if API key is available
let posthog: PostHog | undefined;

if (!POSTHOG_API_KEY) {
  console.warn("PostHog API key not found - analytics features will be disabled");
  posthog = undefined;
} else {
  posthog = new PostHog(POSTHOG_API_KEY, {
    host: "https://us.i.posthog.com",
  });
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
  if (!POSTHOG_API_KEY) {
    return {}; // Return empty flags if no API key
  }

  const body = {
    api_key: POSTHOG_API_KEY,
    distinct_id: "global_instance", // Use a global identifier
  };

  const resp = await fetch(`https://us.i.posthog.com/flags?v=2`, {
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

// Store bot startup time and bot ID for uptime tracking
let botStartTime: number | null = null;
let botId: string | null = null;

/**
 * Track bot startup event with PostHog
 */
function trackBotStartup(botUserId: string): Promise<void> {
  if (!posthog) return Promise.resolve(); // Skip if PostHog is not available
  
  botStartTime = Date.now();
  botId = botUserId;
  
  return posthog.captureImmediate({
    distinctId: botUserId,
    event: "bot_startup",
    properties: {
      startup_time: new Date().toISOString()
    },
  });
}

/**
 * Track bot shutdown event and calculate uptime
 */
function trackBotShutdown(): Promise<void> {
  if (!posthog || !botStartTime || !botId) return Promise.resolve(); // Skip if PostHog is not available or not tracking

  const uptime = Date.now() - botStartTime;
  
  return posthog.captureImmediate({
    distinctId: botId,
    event: "bot_shutdown",
    properties: {
      shutdown_time: new Date().toISOString(),
      uptime_ms: uptime,
      uptime_hours: uptime / (1000 * 60 * 60)
    },
  });
}

/**
 * Send periodic uptime heartbeat events
 */
function sendUptimeHeartbeat(): void {
  if (!posthog || !botStartTime || !botId) return; // Skip if PostHog is not available or not tracking
  
  const uptime = Date.now() - botStartTime;
  
  posthog.capture({
    distinctId: botId,
    event: "bot_uptime_heartbeat",
    properties: {
      current_uptime_ms: uptime,
      current_uptime_hours: uptime / (1000 * 60 * 60),
      heartbeat_time: new Date().toISOString(),
      environment: Deno.env.get("NODE_ENV") || "production",
    },
  });
}

/**
 * Start uptime tracking for the bot
 */
async function startUptimeTracking(botUserId: string): Promise<void> {
  await trackBotStartup(botUserId);
  
  // Send heartbeat every 5 minutes
  setInterval(sendUptimeHeartbeat, 5 * 60 * 1000);
}

/**
 * Cleanup PostHog and track shutdown
 */
async function cleanup(): Promise<void> {
  if (!posthog) return; // Skip if PostHog is not available
  
  await trackBotShutdown();
  await posthog.shutdown();
}

export {
  isFeatureEnabled,
  startUptimeTracking,
  cleanup,
  posthog, // Now exported as PostHog | undefined
  type Flag,
  type FlagsResponse,
};
