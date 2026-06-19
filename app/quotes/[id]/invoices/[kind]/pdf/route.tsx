import { renderToBuffer } from "@react-pdf/renderer";
import { NextResponse } from "next/server";
import { InvoicePdfDocument } from "@/components/pdf/invoice-document";
import { loadInvoicePdfInput } from "@/lib/invoice-pdf";

// Server-side PDF generation for a printable invoice (initial or finish). The
// preview page links here; clicking Download PDF hits this route, which
// renders the react-pdf document to a buffer on the server and streams it back
// as a file download. This keeps react-pdf entirely out of the browser bundle
// (no client-side render, so no blank-screen risk). Mirrors the Detailed Quote
// and Summary Quote PDF routes.

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: { id: string; kind: string } }
) {
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