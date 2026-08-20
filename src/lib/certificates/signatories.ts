export interface CertificateSignatory {
  name: string;
  title: string;
  assetFilename: string;
}

const DEFAULT_SIGNATORIES: CertificateSignatory[] = [
  {
    name: "Paul Velásquez",
    title: "Ponente",
    assetFilename: "paul-signature.png",
  },
];

const EVENT_SIGNATORIES: Record<string, CertificateSignatory[]> = {
  "desarrollo-estructura-curso-canaco": [
    {
      name: "Paul Velásquez",
      title: "Ponente",
      assetFilename: "paul-event-signature.png",
    },
    {
      name: "Benny Cepeda",
      title: "Ponente",
      assetFilename: "benny-signature.png",
    },
  ],
};

export function getSignatoriesForEvent(slug: string | null | undefined): CertificateSignatory[] {
  const configured = slug ? EVENT_SIGNATORIES[slug] : undefined;
  return (configured ?? DEFAULT_SIGNATORIES).map((signatory) => ({ ...signatory }));
}

export function parseSignatoriesSnapshot(value: unknown): CertificateSignatory[] | null {
  if (!Array.isArray(value)) return null;

  const signatories = value.filter(
    (entry): entry is CertificateSignatory =>
      typeof entry === "object" &&
      entry !== null &&
      typeof (entry as CertificateSignatory).name === "string" &&
      typeof (entry as CertificateSignatory).title === "string" &&
      typeof (entry as CertificateSignatory).assetFilename === "string",
  );

  return signatories.length > 0 ? signatories : null;
}
