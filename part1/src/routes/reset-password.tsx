import { createFileRoute, redirect } from "@tanstack/react-router";

// Password reset is now handled inside Clerk's sign-in form ("Forgot password?"), so this old link just goes home.
export const Route = createFileRoute("/reset-password")({
  beforeLoad: () => {
    throw redirect({ to: "/" });
  },
});
