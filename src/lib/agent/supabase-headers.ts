/** Modern Supabase keys are opaque API keys, not JWT bearer tokens. */
export function supabaseHeaders(key: string): Record<string, string> {
  return key.startsWith("sb_publishable_") || key.startsWith("sb_secret_")
    ? { apikey: key }
    : { apikey: key, Authorization: `Bearer ${key}` };
}
