import { createFileRoute } from "@tanstack/react-router";
import { BadgeCheck, Gavel, ShieldCheck, Truck, Warehouse } from "lucide-react";
import { api } from "@/lib/api";
import { StoreProvider, useStore } from "@/lib/store";
import { useAdminData, useInvalidate, useIsAdmin } from "@/lib/data";
import { FLOWS, type FlowId } from "@/lib/krishisaakh";
import { Badge, Btn, Empty, SectionTitle, Skeleton } from "@/components/fg/ui";

export const Route = createFileRoute("/admin")({
  head: () => ({ meta: [{ title: "Admin — ChillChain" }, { name: "robots", content: "noindex" }] }),
  component: () => (
    <StoreProvider>
      <Admin />
    </StoreProvider>
  ),
});

type Driver = {
  id: string;
  name: string;
  phone: string;
  vehicle_key: string;
  vehicle_no: string | null;
  rc_number: string | null;
  licence_number: string | null;
  insurance_number: string | null;
  fitness_number: string | null;
  aadhaar_last4: string | null;
  base_district: string | null;
  capacity_kg: number;
  verified: boolean;
  docs_submitted_at: string | null;
};
type Room = {
  id: string;
  name: string;
  address: string;
  district: string;
  state: string;
  phone: string | null;
  rate_per_crate_day: number;
  total_slots: number;
  verified: boolean;
  has_owner: boolean;
};
type Dispute = {
  id: string;
  reason: string;
  status: string;
  created_at: string;
  flow: number;
  score: number;
  by_name: string | null;
};

/** Admin console: who can use it is set by ADMIN_EMAILS in the server environment. */
function Admin() {
  const { session, authReady } = useStore();
  const admin = useIsAdmin();
  const data = useAdminData(!!admin.data);
  const inv = useInvalidate();
  if (!authReady || admin.isLoading)
    return (
      <div className="mx-auto max-w-5xl p-4">
        <Skeleton rows={4} />
      </div>
    );
  if (!session || !admin.data)
    return (
      <div className="mx-auto max-w-md p-6">
        <Empty
          icon={ShieldCheck}
          title="Admins only"
          sub="Sign in with an email listed in ADMIN_EMAILS on the server."
          action={
            <a className="text-sm font-medium text-navy underline" href="/">
              Go to the app
            </a>
          }
        />
      </div>
    );
  const d = data.data as unknown as
    | { counts: Record<string, number>; drivers: Driver[]; rooms: Room[]; disputes: Dispute[] }
    | undefined;
  const act = async (p: Promise<{ error: { message: string } | null }>) => {
    const r = await p;
    if (r.error) alert(r.error.message);
    inv("admin");
  };
  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-6">
      <SectionTitle
        icon={ShieldCheck}
        title="ChillChain admin"
        sub="Verify drivers and cold rooms, and resolve rating disputes"
        right={
          <a href="/" className="text-sm font-medium text-navy underline">
            App
          </a>
        }
      />
      {!d ? (
        <Skeleton rows={4} />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {Object.entries(d.counts).map(([k, v]) => (
              <div key={k} className="card-classic p-3">
                <b className="block text-xl text-foreground">{v}</b>
                <span className="text-xs capitalize text-muted-foreground">{k}</span>
              </div>
            ))}
          </div>

          <section>
            <h3 className="mb-2 flex items-center gap-2 font-semibold">
              <Truck className="h-4 w-4 text-navy" />
              Transporters
            </h3>
            <div className="card-classic overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-secondary text-xs text-muted-foreground">
                  <tr>
                    <th className="p-2">Driver</th>
                    <th className="p-2">Vehicle</th>
                    <th className="p-2">Documents</th>
                    <th className="p-2">Status</th>
                    <th className="p-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {d.drivers.map((x) => (
                    <tr key={x.id}>
                      <td className="p-2">
                        {x.name}
                        <br />
                        <span className="text-xs text-muted-foreground">
                          {x.phone} · {x.base_district}
                        </span>
                      </td>
                      <td className="p-2 font-mono text-xs">
                        {x.vehicle_no}
                        <br />
                        {x.vehicle_key} · {x.capacity_kg} kg
                      </td>
                      <td className="p-2 text-xs">
                        {x.docs_submitted_at ? (
                          <>
                            RC {x.rc_number}
                            <br />
                            DL {x.licence_number}
                            <br />
                            Ins {x.insurance_number} · Fit {x.fitness_number}
                            <br />
                            Aadhaar ••{x.aadhaar_last4}
                          </>
                        ) : (
                          <span className="text-muted-foreground">Not submitted</span>
                        )}
                      </td>
                      <td className="p-2">
                        {x.verified ? (
                          <Badge tone="green">Verified</Badge>
                        ) : x.docs_submitted_at ? (
                          <Badge tone="amber">In review</Badge>
                        ) : (
                          <Badge tone="muted">Pending docs</Badge>
                        )}
                      </td>
                      <td className="p-2 text-right">
                        {x.docs_submitted_at && (
                          <Btn
                            v={x.verified ? "outline" : "primary"}
                            className="px-3 py-1.5 text-xs"
                            onClick={() => act(api.adminVerify("transporter", x.id, !x.verified))}
                          >
                            <BadgeCheck className="h-3.5 w-3.5" />
                            {x.verified ? "Unverify" : "Verify"}
                          </Btn>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!d.drivers.length && (
                <p className="p-4 text-sm text-muted-foreground">No transporters yet.</p>
              )}
            </div>
          </section>

          <section>
            <h3 className="mb-2 flex items-center gap-2 font-semibold">
              <Warehouse className="h-4 w-4 text-navy" />
              Cold rooms
            </h3>
            <div className="card-classic divide-y divide-border">
              {d.rooms.map((r) => (
                <div
                  key={r.id}
                  className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm"
                >
                  <div>
                    <b>{r.name}</b>{" "}
                    <span className="text-xs text-muted-foreground">
                      {r.address}, {r.district}, {r.state} · ₹{r.rate_per_crate_day}/crate/day ·{" "}
                      {r.total_slots} crates · {r.phone ?? "no phone"}
                      {r.has_owner ? "" : " · demo (no owner)"}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {r.verified ? (
                      <Badge tone="green">Verified</Badge>
                    ) : (
                      <Badge tone="amber">New listing</Badge>
                    )}
                    <Btn
                      v={r.verified ? "outline" : "primary"}
                      className="px-3 py-1.5 text-xs"
                      onClick={() => act(api.adminVerify("room", r.id, !r.verified))}
                    >
                      {r.verified ? "Unverify" : "Verify"}
                    </Btn>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section>
            <h3 className="mb-2 flex items-center gap-2 font-semibold">
              <Gavel className="h-4 w-4 text-navy" />
              Rating disputes
            </h3>
            {!d.disputes.length ? (
              <Empty icon={Gavel} title="No disputes" />
            ) : (
              <div className="card-classic divide-y divide-border">
                {d.disputes.map((x) => (
                  <div key={x.id} className="space-y-1 p-3 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span>
                        <b>{x.by_name ?? "User"}</b> · {FLOWS[x.flow as FlowId].en} · score{" "}
                        {Math.round(x.score)}/100 · {x.created_at.slice(0, 10)}
                      </span>
                      <Badge
                        tone={
                          x.status === "open" ? "amber" : x.status === "upheld" ? "green" : "muted"
                        }
                      >
                        {x.status}
                      </Badge>
                    </div>
                    <p className="text-muted-foreground">“{x.reason}”</p>
                    {x.status === "open" && (
                      <div className="flex gap-2">
                        <Btn
                          className="px-3 py-1.5 text-xs"
                          onClick={() => act(api.adminResolveDispute(x.id, true))}
                        >
                          Uphold (remove rating)
                        </Btn>
                        <Btn
                          v="outline"
                          className="px-3 py-1.5 text-xs"
                          onClick={() => act(api.adminResolveDispute(x.id, false))}
                        >
                          Dismiss
                        </Btn>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
