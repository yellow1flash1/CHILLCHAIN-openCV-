import { createFileRoute } from "@tanstack/react-router";
import { useIsRestoring } from "@tanstack/react-query";
import { CloudOff, Loader2 } from "lucide-react";
import { StoreProvider, useStore } from "@/lib/store";
import { useMe } from "@/lib/data";
import { useOnline } from "@/lib/net";
import { Auth } from "@/components/fg/Auth";
import { Shell } from "@/components/fg/Shell";
import { BuyerShell } from "@/components/fg/BuyerShell";
import { OwnerShell } from "@/components/fg/OwnerShell";
import { TransporterShell } from "@/components/fg/TransporterShell";
import { Onboarding } from "@/components/fg/Onboarding";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "ChillChain — every hour counts" },
      {
        name: "description",
        content:
          "Grade, cool, move and sell exotic fruit, short-life fruit, flowers and mushrooms before the clock runs out: AI grading, sell-by clock, pre-cooling by the hour, shared reefer trucks, buyer pre-orders and escrow.",
      },
      { property: "og:title", content: "ChillChain — every hour counts" },
      {
        property: "og:description",
        content: "Cold-chain marketplace for short-shelf-life, high-value produce in India.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Loading() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );
}

/** Offline before anything was saved on this phone: sign-in and first load need the network. */
function NeedsNetwork({ signedIn }: { signedIn: boolean }) {
  const { t } = useStore();
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center">
      <CloudOff className="h-10 w-10 text-muted-foreground" strokeWidth={1.5} />
      <h1 className="text-[22px] font-bold">{t("You're offline", "आप ऑफ़लाइन हैं")}</h1>
      <p className="max-w-sm text-[15px] text-muted-foreground">
        {signedIn
          ? t(
              "Your account isn't saved on this phone yet. Open ChillChain once with internet; after that it opens offline too.",
              "आपका खाता अभी इस फ़ोन में सेव नहीं है। एक बार इंटरनेट के साथ ChillChain खोलें; उसके बाद यह बिना इंटरनेट भी खुलेगा।",
            )
          : t(
              "Sign in once with internet. After that ChillChain opens offline too, with your last saved data.",
              "एक बार इंटरनेट के साथ साइन इन करें। उसके बाद ChillChain बिना इंटरनेट भी आपकी आख़िरी सेव जानकारी के साथ खुलेगा।",
            )}
      </p>
    </div>
  );
}

function App() {
  const { session, authReady } = useStore();
  const online = useOnline();
  const me = useMe();
  const restoring = useIsRestoring(); // saved data is still being read from the phone
  if (restoring) return <Loading />;
  if (!session && !online) return <NeedsNetwork signedIn={false} />;
  if (!authReady) return <Loading />;
  if (!session) return <Auth />;
  if (!me.data && !online && !me.isFetching) return <NeedsNetwork signedIn />;
  if (me.isLoading || !me.data) return <Loading />;
  const { profile, role } = me.data;
  const complete =
    role === "farmer"
      ? !!(profile?.village && profile?.upi_id && profile?.phone)
      : role === "transporter"
        ? !!(profile?.upi_id && profile?.phone)
        : role === "buyer" || role === "owner"
          ? !!(profile?.org_name && profile?.phone)
          : false;
  if (!complete) return <Onboarding profile={profile ?? null} role={role} />;
  if (role === "buyer") return <BuyerShell />;
  if (role === "owner") return <OwnerShell />;
  if (role === "transporter") return <TransporterShell />;
  return <Shell />;
}

function Index() {
  return (
    <StoreProvider>
      <App />
    </StoreProvider>
  );
}
