import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { formatDate } from "@/lib/currency";
import { getRecentEmailLog } from "@/lib/email-log";

// Read-only global email audit log: the most recent emails sent from the app
// (quotes + invoices) across all quotes, newest first. One row per send
// attempt, including failed sends. Pairs with the per-quote Email History
// section on /quotes/[id].

export const dynamic = "force-dynamic";

export default async function EmailLogPage() {
  const rows = await getRecentEmailLog(50);

  return (
    <AppShell>
      <div className="mb-8 flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <Link
            href="/"
            className="mb-6 inline-flex text-sm font-black text-deep-pine underline decoration-clay/40 decoration-2 underline-offset-4"
          >
            Back to dashboard
          </Link>
          <p className="mb-2 text-sm font-black uppercase tracking-[0.18em] text-clay">
            Audit
          </p>
          <h1 className="font-display text-5xl font-bold tracking-[-0.04em] text-moss md:text-6xl">
            Email Log
          </h1>
          <p className="mt-4 max-w-2xl text-lg leading-8 text-charcoal/75">
            Every quote and invoice emailed from the app, newest first. Includes
            failed send attempts.
          </p>
        </div>
      </div>

      <section className="rounded-xl2 border border-pine/10 bg-whitewarm/75 p-6 shadow-soft">
        {rows.length === 0 ? (
          <p className="rounded-soft bg-cream px-4 py-8 text-center text-sm font-bold text-charcoal/60">
            No emails sent yet. Emails you send from a quote or invoice
            printable will show up here.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead className="bg-sand text-deep-pine">
                <tr>
                  <th className="p-3 font-black">Date</th>
                  <th className="p-3 font-black">Document</th>
                  <th className="p-3 font-black">Recipient</th>
                  <th className="p-3 font-black">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-pine/10 bg-cream">
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td className="whitespace-nowrap p-3 text-charcoal/80">
                      {formatDate(row.sent_at)}
                    </td>
                    <td className="p-3">
                      <p className="font-bold text-charcoal">{row.doc_title}</p>
                      {row.reference ? (
                        <p className="text-xs text-charcoal/60">
                          {row.reference}
                        </p>
                      ) : null}
                      {row.subject ? (
                        <p className="text-xs text-charcoal/60">
                          {row.subject}
                        </p>
                      ) : null}
                    </td>
                    <td className="p-3 text-charcoal/80">{row.recipient}</td>
                    <td className="p-3">
                      {row.status === "sent" ? (
                        <span className="rounded-full bg-pine/15 px-3 py-1 text-xs font-black text-deep-pine">
                          Sent
                        </span>
                      ) : (
                        <span
                          className="rounded-full bg-clay/20 px-3 py-1 text-xs font-black text-clay"
                          title={row.error || "Send failed"}
                        >
                          Failed
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </AppShell>
  );
}