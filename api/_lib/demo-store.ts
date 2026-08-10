export const SEVERITIES = ["Baixa", "Média", "Alta", "Crítica"] as const;
export const OCCURRENCE_STATUSES = [
  "Novo",
  "Em análise",
  "Aguardando",
  "Resolvido",
  "Cancelado",
] as const;

export type DemoSeverity = (typeof SEVERITIES)[number];
export type DemoOccurrenceStatus = (typeof OCCURRENCE_STATUSES)[number];

export type StoredOccurrence = {
  id: string;
  number: string;
  clientId: string;
  systemId: string;
  moduleId: string;
  catalogItemId?: string;
  otherError?: string;
  description: string;
  severity: DemoSeverity;
  occurredAt: string;
  status: DemoOccurrenceStatus;
  responsibleId: string;
  authorId: string;
  attachments: string[];
  createdAt: string;
  updatedAt: string;
};

export type StoredCatalogItem = {
  id: string;
  systemId: string;
  moduleId: string;
  name: string;
  normalizedName: string;
  aliases: string[];
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export function normalizeCatalogName(value: string) {
  return value.trim().toLocaleLowerCase("pt-BR").replace(/\s+/g, " ");
}
