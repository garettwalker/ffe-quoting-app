import fs from "fs";
import path from "path";

// Server-only helper. Reads the brand logo from /public and returns it as a
// base64 data URI so react-pdf's <Image> can embed it with no network fetch
// (works the same locally and on Vercel). Returns null if the file is missing
// so callers can simply omit the logo instead of breaking the whole PDF.
export function getLogoDataUri(): string | null {
  try {
    const file = path.join(process.cwd(), "public", "ffe-logo.png");
    const b64 = fs.readFileSync(file).toString("base64");
    return `data:image/png;base64,${b64}`;
  } catch {
    return null;
  }
}