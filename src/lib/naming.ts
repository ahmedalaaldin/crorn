/**
 * Aconex-style document numbering and revision codes.
 *
 * Format:
 *   [ProjectCode]-[Originator]-[Discipline]-[DocType]-[Location]-[Package/Area]-[Sequence]-[Status]-[Revision]
 * Example:
 *   R03-ABC-STR-DRG-BLDG01-FOUND-00125-IFC-R02
 */

export interface DocNumberParts {
  projectCode: string;
  originator: string;
  discipline: string;
  docType: string;
  location?: string | null;
  packageArea?: string | null;
  sequence: number;
  status: string;
  revision: string;
}

const clean = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");

export function padSequence(seq: number): string {
  return String(seq).padStart(5, "0");
}

export function formatDocumentNo(p: DocNumberParts): string {
  return [
    clean(p.projectCode),
    clean(p.originator || "NA"),
    clean(p.discipline),
    clean(p.docType),
    clean(p.location || "GEN"),
    clean(p.packageArea || "GEN"),
    padSequence(p.sequence),
    clean(p.status),
    p.revision.toUpperCase(),
  ].join("-");
}

/** First revision is R00; nextRevision("R00") -> "R01". */
export function firstRevision(): string {
  return "R00";
}

export function nextRevision(code: string): string {
  const n = parseInt(code.replace(/^R/i, ""), 10);
  const next = Number.isFinite(n) ? n + 1 : 1;
  return `R${String(next).padStart(2, "0")}`;
}
