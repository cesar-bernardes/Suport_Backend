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

type DemoStoreGlobal = typeof globalThis & {
  __portalDemoOccurrences?: Map<string, StoredOccurrence>;
  __portalDemoCatalog?: Map<string, StoredCatalogItem>;
  __portalDemoOccurrenceSequence?: number;
};

const storeGlobal = globalThis as DemoStoreGlobal;

const CLIENT_IDS = new Set(["cl1", "cl2", "cl3", "cl4", "cl5"]);
const SYSTEM_MODULES = new Map<string, Set<string>>([
  ["s1", new Set(["m1", "m2", "m3"])],
  ["s2", new Set(["m4", "m5", "m6"])],
  ["s3", new Set(["m7", "m8", "m9"])],
]);
const GENERAL_MODULE_IDS = new Set(["m3", "m6", "m9"]);

const initialCatalog: StoredCatalogItem[] = [
  {
    id: "c1",
    systemId: "s1",
    moduleId: "m1",
    name: "Já existe missão ativa para esta placa",
    normalizedName: "já existe missão ativa para esta placa",
    aliases: ["missão ativa", "placa em missão"],
    active: true,
    createdAt: "2026-08-01T12:00:00.000Z",
    updatedAt: "2026-08-05T18:20:00.000Z",
  },
  {
    id: "c2",
    systemId: "s1",
    moduleId: "m3",
    name: "Erro Network",
    normalizedName: "erro network",
    aliases: ["network", "erro de rede"],
    active: true,
    createdAt: "2026-08-01T12:00:00.000Z",
    updatedAt: "2026-08-04T13:10:00.000Z",
  },
  {
    id: "c3",
    systemId: "s1",
    moduleId: "m1",
    name: "Falha ao carregar checklist",
    normalizedName: "falha ao carregar checklist",
    aliases: ["checklist não abre", "falha checklist"],
    active: true,
    createdAt: "2026-08-01T12:00:00.000Z",
    updatedAt: "2026-08-03T20:45:00.000Z",
  },
  {
    id: "c4",
    systemId: "s2",
    moduleId: "m4",
    name: "Dados não sincronizados",
    normalizedName: "dados não sincronizados",
    aliases: ["sem sincronizar", "sync pendente"],
    active: true,
    createdAt: "2026-08-01T12:00:00.000Z",
    updatedAt: "2026-08-02T15:05:00.000Z",
  },
  {
    id: "c5",
    systemId: "s3",
    moduleId: "m7",
    name: "Token de acesso expirado",
    normalizedName: "token de acesso expirado",
    aliases: ["sessão expirada", "token expirado"],
    active: true,
    createdAt: "2026-08-01T12:00:00.000Z",
    updatedAt: "2026-08-01T12:40:00.000Z",
  },
  {
    id: "c6",
    systemId: "s3",
    moduleId: "m8",
    name: "Boleto não disponível",
    normalizedName: "boleto não disponível",
    aliases: ["sem boleto", "boleto indisponível"],
    active: false,
    createdAt: "2026-07-20T12:00:00.000Z",
    updatedAt: "2026-07-29T14:15:00.000Z",
  },
];

export const INITIAL_STORED_OCCURRENCES: StoredOccurrence[] = [
  {
    id: "o1",
    number: "OCO-2418",
    clientId: "cl1",
    systemId: "s1",
    moduleId: "m1",
    catalogItemId: "c1",
    description: "A placa já havia concluído a rota anterior.",
    severity: "Média",
    occurredAt: "2026-08-06T11:15:00.000Z",
    status: "Em análise",
    responsibleId: "u1",
    authorId: "u1",
    attachments: ["print-missao-ativa.png"],
    createdAt: "2026-08-06T11:22:00.000Z",
    updatedAt: "2026-08-06T12:05:00.000Z",
  },
  {
    id: "o2",
    number: "OCO-2417",
    clientId: "cl2",
    systemId: "s2",
    moduleId: "m4",
    catalogItemId: "c4",
    description: "Viagens pendentes após retorno do sinal.",
    severity: "Alta",
    occurredAt: "2026-08-06T10:40:00.000Z",
    status: "Novo",
    responsibleId: "u1",
    authorId: "u2",
    attachments: ["video-sincronizacao.mp4"],
    createdAt: "2026-08-06T10:52:00.000Z",
    updatedAt: "2026-08-06T10:52:00.000Z",
  },
  {
    id: "o3",
    number: "OCO-2416",
    clientId: "cl3",
    systemId: "s1",
    moduleId: "m3",
    catalogItemId: "c2",
    description: "Intermitência ao abrir o painel de veículos.",
    severity: "Crítica",
    occurredAt: "2026-08-05T21:30:00.000Z",
    status: "Aguardando",
    responsibleId: "u2",
    authorId: "u1",
    attachments: ["erro-network.png", "console.txt"],
    createdAt: "2026-08-05T21:38:00.000Z",
    updatedAt: "2026-08-06T13:12:00.000Z",
  },
  {
    id: "o4",
    number: "OCO-2415",
    clientId: "cl4",
    systemId: "s3",
    moduleId: "m7",
    catalogItemId: "c5",
    description: "Usuários precisaram autenticar novamente durante o expediente.",
    severity: "Média",
    occurredAt: "2026-08-05T14:05:00-04:00",
    status: "Resolvido",
    responsibleId: "u1",
    authorId: "u1",
    attachments: [],
    createdAt: "2026-08-05T14:14:00-04:00",
    updatedAt: "2026-08-05T16:42:00-04:00",
  },
  {
    id: "o5",
    number: "OCO-2414",
    clientId: "cl5",
    systemId: "s1",
    moduleId: "m1",
    catalogItemId: "c3",
    description: "Checklist permanece em carregamento em dois aparelhos.",
    severity: "Alta",
    occurredAt: "2026-08-05T10:20:00-04:00",
    status: "Em análise",
    responsibleId: "u1",
    authorId: "u3",
    attachments: ["checklist-carregando.png"],
    createdAt: "2026-08-05T10:35:00-04:00",
    updatedAt: "2026-08-05T12:01:00-04:00",
  },
  {
    id: "o6",
    number: "OCO-2413",
    clientId: "cl1",
    systemId: "s1",
    moduleId: "m1",
    catalogItemId: "c1",
    description: "Bloqueio ao iniciar nova missão para o veículo 218.",
    severity: "Média",
    occurredAt: "2026-08-04T15:10:00-04:00",
    status: "Resolvido",
    responsibleId: "u2",
    authorId: "u1",
    attachments: [],
    createdAt: "2026-08-04T15:18:00-04:00",
    updatedAt: "2026-08-04T18:20:00-04:00",
  },
  {
    id: "o7",
    number: "OCO-2412",
    clientId: "cl2",
    systemId: "s2",
    moduleId: "m5",
    otherError: "Jornada duplicada após troca de aparelho",
    description: "Caso ainda não padronizado.",
    severity: "Baixa",
    occurredAt: "2026-08-04T13:25:00.000Z",
    status: "Aguardando",
    responsibleId: "u3",
    authorId: "u1",
    attachments: [],
    createdAt: "2026-08-04T13:40:00.000Z",
    updatedAt: "2026-08-04T15:25:00.000Z",
  },
  {
    id: "o8",
    number: "OCO-2411",
    clientId: "cl3",
    systemId: "s2",
    moduleId: "m4",
    catalogItemId: "c4",
    description: "Sincronização retomada após limpeza da fila local.",
    severity: "Média",
    occurredAt: "2026-08-03T16:00:00-04:00",
    status: "Resolvido",
    responsibleId: "u1",
    authorId: "u2",
    attachments: [],
    createdAt: "2026-08-03T16:12:00-04:00",
    updatedAt: "2026-08-03T17:50:00-04:00",
  },
  {
    id: "o9",
    number: "OCO-2410",
    clientId: "cl4",
    systemId: "s1",
    moduleId: "m3",
    catalogItemId: "c2",
    description: "Erro de rede registrado durante atualização do cadastro.",
    severity: "Alta",
    occurredAt: "2026-08-02T11:45:00-04:00",
    status: "Resolvido",
    responsibleId: "u1",
    authorId: "u1",
    attachments: [],
    createdAt: "2026-08-02T11:57:00-04:00",
    updatedAt: "2026-08-02T13:04:00-04:00",
  },
  {
    id: "o10",
    number: "OCO-2409",
    clientId: "cl5",
    systemId: "s3",
    moduleId: "m7",
    catalogItemId: "c5",
    description: "Sessão expirou antes do período esperado.",
    severity: "Baixa",
    occurredAt: "2026-08-01T08:15:00-04:00",
    status: "Resolvido",
    responsibleId: "u3",
    authorId: "u2",
    attachments: [],
    createdAt: "2026-08-01T08:24:00-04:00",
    updatedAt: "2026-08-01T09:32:00-04:00",
  },
  {
    id: "o11",
    number: "OCO-2408",
    clientId: "cl1",
    systemId: "s1",
    moduleId: "m1",
    catalogItemId: "c1",
    description: "Missão antiga permaneceu ativa depois da finalização.",
    severity: "Média",
    occurredAt: "2026-07-31T13:35:00-04:00",
    status: "Resolvido",
    responsibleId: "u1",
    authorId: "u1",
    attachments: [],
    createdAt: "2026-07-31T13:46:00-04:00",
    updatedAt: "2026-07-31T15:10:00-04:00",
  },
  {
    id: "o12",
    number: "OCO-2407",
    clientId: "cl2",
    systemId: "s1",
    moduleId: "m1",
    catalogItemId: "c3",
    description: "Falha ao carregar o formulário em conexão móvel.",
    severity: "Alta",
    occurredAt: "2026-07-30T18:05:00-04:00",
    status: "Cancelado",
    responsibleId: "u2",
    authorId: "u1",
    attachments: [],
    createdAt: "2026-07-30T18:16:00-04:00",
    updatedAt: "2026-07-31T08:02:00-04:00",
  },
];

export const catalogStore =
  storeGlobal.__portalDemoCatalog ??
  (storeGlobal.__portalDemoCatalog = new Map(
    initialCatalog.map((item) => [item.id, item]),
  ));

export const occurrenceStore =
  storeGlobal.__portalDemoOccurrences ??
  (storeGlobal.__portalDemoOccurrences = new Map(
    INITIAL_STORED_OCCURRENCES.map((item) => [item.id, item]),
  ));

if (!storeGlobal.__portalDemoOccurrenceSequence) {
  storeGlobal.__portalDemoOccurrenceSequence = 2418;
}

export function normalizeCatalogName(value: string) {
  return value.trim().toLocaleLowerCase("pt-BR").replace(/\s+/g, " ");
}

export function catalogKey(
  systemId: string,
  moduleId: string,
  normalizedName: string,
) {
  return `${systemId}|${moduleId}|${normalizedName}`;
}

export function findCatalogDuplicate(
  systemId: string,
  moduleId: string,
  normalizedName: string,
  ignoredId?: string,
) {
  const key = catalogKey(systemId, moduleId, normalizedName);
  return [...catalogStore.values()].find(
    (item) =>
      item.id !== ignoredId &&
      catalogKey(item.systemId, item.moduleId, item.normalizedName) === key,
  );
}

export function validClient(clientId: string) {
  return CLIENT_IDS.has(clientId);
}

export function validSystemModule(systemId: string, moduleId: string) {
  return SYSTEM_MODULES.get(systemId)?.has(moduleId) ?? false;
}

export function catalogMatchesOccurrence(
  item: StoredCatalogItem,
  systemId: string,
  moduleId: string,
) {
  return (
    item.systemId === systemId &&
    (item.moduleId === moduleId || GENERAL_MODULE_IDS.has(item.moduleId))
  );
}

export function nextOccurrenceIdentity() {
  const sequence = (storeGlobal.__portalDemoOccurrenceSequence ?? 2418) + 1;
  storeGlobal.__portalDemoOccurrenceSequence = sequence;
  return {
    id: `o-${crypto.randomUUID()}`,
    number: `OCO-${sequence}`,
  };
}
