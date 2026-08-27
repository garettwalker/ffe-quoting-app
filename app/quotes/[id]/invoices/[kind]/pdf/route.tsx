import { renderToBuffer } from "@react-pdf/renderer";
import { NextResponse } from "next/server";
import { InvoicePdfDocument } from "@/components/pdf/invoice-document";
import { ServiceInvoicePdfDocument } from "@/components/pdf/service-invoice-document";
import { loadInvoicePdfInput } from "@/lib/invoice-pdf";
import { fetchQuoteType } from "@/lib/service-quote-pdf";
import { loadServiceInvoicePdfInput } from "@/lib/service-invoice-pdf";
import type { InvoiceKind } from "@/lib/types";

// Server-side PDF generation for a printable invoice. The preview page links
// here; clicking Download PDF hits this route, which renders the react-pdf
// document to a buffer on the server and streams it back as a file download.
// This keeps react-pdf entirely out of the browser bundle (no client-side
// render, so no blank-screen risk). Mirrors the Detailed Quote and Summary
// Quote PDF routes.
//
// Dispatch is by QUOTE TYPE: a service call (unsplit kind "service", or split
// kinds "initial" deposit + "finish" final) routes ALL of its invoice kinds to
// the purpose-built service invoice document (Description / Qty / Amount
// lines, no rough-in/finish split, no scope block, optional previously-invoiced
// block on the final); a new build routes initial/finish to the existing
// new-build invoice document.

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: { id: string; kind: string } }
) {
  const quoteType = await fetchQuoteType(params.id);

  if (quoteType === "service_call") {
    const input = await loadServiceInvoicePdfInput(
      params.id,
      params.kind as InvoiceKind
    );
    if (!input) {
      return new NextResponse("Invoice not found.", { status: 404 });
    }
    const buffer = await renderToBuffer(
      <ServiceInvoicePdfDocument {...input.pdfProps} />
    );
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${input.fileName}"`,
        "Cache-Control": "no-store"
      }
    });
  }

  const input = await loadInvoicePdfInput(params.id, params.kind);
  if (!input) {
    return new NextResponse("Invoice not found.", { status: 404 });
  }

  const buffer = await renderToBuffer(<InvoicePdfDocument {...input.pdfProps} />);

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${input.fileName}"`,
      "Cache-Control": "no-store"
    }
  });
}