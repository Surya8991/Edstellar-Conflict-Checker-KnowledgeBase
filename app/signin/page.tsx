import { redirect } from "next/navigation";
import { signIn, auth } from "@/auth";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ returnTo?: string; error?: string }>;
}

/**
 * Sign-in page. Server component — submits a form action that calls
 * NextAuth's signIn server function. Restricted to the Edstellar Google
 * Workspace (or whatever AUTH_ALLOWED_DOMAINS is set to).
 */
export default async function SignInPage({ searchParams }: PageProps) {
  const { returnTo = "/", error } = await searchParams;
  // Already signed in? Bounce straight to the destination.
  const session = await auth().catch(() => null);
  if (session?.user) redirect(returnTo);

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="mb-6 flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/brand/edstellar-primary.svg"
            alt="Edstellar"
            className="h-9 w-auto"
          />
          <div className="border-l border-slate-200 pl-3">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Internal tool</div>
            <div className="text-base font-semibold text-slate-900">Conflict Checker</div>
          </div>
        </div>

        <h1 className="text-xl font-semibold text-slate-900">Sign in</h1>
        <p className="mt-1 text-sm text-slate-500">
          Use your Edstellar Google account. Other accounts are blocked.
        </p>

        {error && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error === "AccessDenied"
              ? "That Google account isn't on the allow-list. Sign in with your Edstellar email."
              : "Sign-in failed. Try again, or contact an admin if it persists."}
          </div>
        )}

        <form
          action={async () => {
            "use server";
            await signIn("google", { redirectTo: returnTo });
          }}
          className="mt-6"
        >
          <button
            type="submit"
            className="inline-flex w-full items-center justify-center gap-3 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
              <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.6-6 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.2 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/>
              <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.6 16 18.9 13 24 13c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.2 29.3 4 24 4 16.3 4 9.6 8.3 6.3 14.7z"/>
              <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2c-2 1.5-4.5 2.4-7.2 2.4-5.3 0-9.8-3.4-11.4-8.1l-6.5 5C9.5 39.6 16.2 44 24 44z"/>
              <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.7 2.1-2.1 4-3.9 5.3l6.2 5.2c-.4.4 6.6-4.8 6.6-14.5 0-1.3-.1-2.4-.6-3.5z"/>
            </svg>
            Continue with Google
          </button>
        </form>

        <p className="mt-6 text-xs text-slate-400">
          By signing in you agree to the team's internal-tool acceptable use policy.
        </p>
      </div>
    </div>
  );
}
