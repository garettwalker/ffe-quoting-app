import { renderToBuffer } from "@react-pdf/renderer";
import { NextResponse } from "next/server";
import { SummaryQuotePdfDocument } from "@/components/pdf/summary-quote-document";
import { loadSummaryQuotePdfInput } from "@/lib/summary-quote-pdf";

// Server-side PDF generation for the Summary Quote. The preview page links
// here; clicking Download PDF hits this route, which renders the react-pdf
// document to a buffer on the server and streams it back as a file download.
// This keeps react-pdf entirely out of the browser bundle (no client-side
// render, so no blank-screen risk). Mirrors the Detailed Quote PDF route.

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const input = await loadSummaryQuotePdfInput(params.id);
  if (!input) {
    return new NextResponse("Quote not found.", { status: 404 });
  }

  const buffer = await renderToBuffer(
    <SummaryQuotePdfDocument {...input.pdfProps} />
  );

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${input.fileName}"`,
      "Cache-Control": "no-store"
    }
  });
}