import { renderToBuffer } from "@react-pdf/renderer";
import { NextResponse } from "next/server";
import { DetailedQuotePdfDocument } from "@/components/pdf/detailed-quote-document";
import { ServiceQuotePdfDocument } from "@/components/pdf/service-quote-document";
import { loadDetailedQuotePdfInput } from "@/lib/detailed-quote-pdf";
import { fetchQuoteType, loadServiceQuotePdfInput } from "@/lib/service-quote-pdf";

// Server-side PDF generation. The preview page links here; clicking Download
// PDF hits this route, which renders the react-pdf document to a buffer on the
// server and streams it back as a file download. This keeps react-pdf entirely
// out of the browser bundle (no client-side render, so no blank-screen risk)
// and is the same render path the email feature uses.
//
// We dispatch on quote_type BEFORE loading the full row so a service-call quote
// gets the purpose-built service PDF (Description / Qty / Amount, no pricing
// levers) and a new-build quote gets the existing detailed quote PDF. Old rows
// default to new_build (normalizeQuoteType), so nothing regresses.

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const quoteType = await fetchQuoteType(params.id);

  if (quoteType === "service_call") {
    const input = await loadServiceQuotePdfInput(params.id);
    if (!input) {
      return new NextResponse("Quote not found.", { status: 404 });
    }
    const buffer = await renderToBuffer(
      <ServiceQuotePdfDocument {...input.pdfProps} />
    );
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${input.fileName}"`,
        "Cache-Control": "no-store"
      }
    });
  }

  const input = await loadDetailedQuotePdfInput(params.id);
  if (!input) {
    return new NextResponse("Quote not found.", { status: 404 });
  }

  const buffer = await renderToBuffer(
    <DetailedQuotePdfDocument {...input.pdfProps} />
  );

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${input.fileName}"`,
      "Cache-Control": "no-store"
    }
  });
}