import Link from "next/link";
import { primaryButtonClass, secondaryButtonClass } from "@/components/pricing-admin-ui";
import { QuoteStatusButton } from "@/components/quote-status-button";
import type { ServiceStageId } from "@/lib/projects";

// The primary action button on a service-call project card's footer. The
// only manual action on a service call is "Mark scheduled" (writes
// status "scheduled"); the billed / paid stages are derived from the invoice
// + email-log, so those render contextual links to the invoicing page instead.
// When the job is complete (activeStageId null) nothing renders (the page
// shows a "Completed" pill instead). Mirrors ProjectAdvanceButton for new
// builds but with the simpler service lifecycle.

type Props = {
  quoteId: string;
  activeStageId: ServiceStageId | null;
};

export function ServiceProjectAdvanceButton({ quoteId, activeStageId }: Props) {
  if (activeStageId === null) return null;

  // Accepted: advance by writing status "scheduled". (The "scheduled" stage
  // is the first not-done stage when the quote is accepted but not yet
  // scheduled, so this is the button that appears at that point.)
  if (activeStageId === "scheduled") {
    return (
      <QuoteStatusButton
        quoteId={quoteId}
        newStatus="scheduled"
        label="Mark scheduled"
        variant="primary"
        size="md"
      />
    );
  }

  // Scheduled but not yet billed: set up / send the service invoice.
  if (activeStageId === "billed") {
    return (
      <Link href={`/quotes/${quoteId}/invoices`} className={primaryButtonClass}>
        Set up &amp; send invoice
      </Link>
    );
  }

  // Billed but not yet paid: invoice sent, waiting for payment.
  if (activeStageId === "paid") {
    return (
      <Link href={`/quotes/${quoteId}/invoices`} className={secondaryButtonClass}>
        Awaiting payment
      </Link>
    );
  }

  // "quote" / "accepted" active: the quote is not yet accepted, which the
  // /projects filter excludes; nothing to render here.
  return null;
}