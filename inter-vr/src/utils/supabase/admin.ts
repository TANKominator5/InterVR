import { createClient } from "@supabase/supabase-js";

/**
 * Server-side Supabase client using service_role key.
 * Bypasses RLS — use ONLY in API routes / server actions.
 * NEVER import this in client components.
 */
export function createAdminClient() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

    return createClient(supabaseUrl, serviceRoleKey, {
        auth: {
            autoRefreshToken: false,
            persistSession: false,
        },
    });
}
