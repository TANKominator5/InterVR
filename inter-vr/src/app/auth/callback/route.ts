import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'

export async function GET(request: Request) {
    const { searchParams, origin } = new URL(request.url)
    const code = searchParams.get('code')
    // if "next" is in param, use it as the redirect URL
    const next = searchParams.get('next') ?? '/dashboard'

    if (code) {
        const supabase = await createClient()
        const { error } = await supabase.auth.exchangeCodeForSession(code)

        if (!error) {
            // successful login, but we should redirect to onboarding or dashboard
            // depending on their profile state. Let's do that cleanly:

            const { data: { user } } = await supabase.auth.getUser()

            if (user) {
                const { data: userDetails } = await supabase
                    .from('users')
                    .select('onboarding_completed')
                    .eq('id', user.id)
                    .single()

                if (userDetails?.onboarding_completed) {
                    return NextResponse.redirect(`${origin}/dashboard`)
                } else {
                    return NextResponse.redirect(`${origin}/onboarding`)
                }
            }

            return NextResponse.redirect(`${origin}${next}`)
        }
    }

    // return the user to an error page with instructions
    return NextResponse.redirect(`${origin}/login?error=auth-callback-failed`)
}
