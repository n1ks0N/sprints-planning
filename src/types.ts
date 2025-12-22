export type Quarter = {
  id: string;
  year: number;
  number: 1 | 2 | 3 | 4;
  name: string;
  startDate: string;
  endDate: string;
};

export type Sprint = {
  id: string;
  quarterId: string;
  name: string;
  startDate: string;
  endDate: string;
  workingDays: number;
  order: number;
};

export type Participant = {
  id: string;
  fullName: string;
  role: string;
  rate: number;
  userStreams: string[];
};

export type CapacityCell = {
  participantId: string;
  sprintId: string;
  workingDays: number;
  rate: number;
  normFactor: number;
  baseCapacity: number;
  runDays: number;
  vacationNormDays: number;
  availableDays: number;
  workloadDays: number;
};

export type CapacityRow = {
  participant: Participant;
  cells: CapacityCell[];
  totalQuarterAvailable: number;
  totalQuarterWorkload: number;
};

export type TaskPriority = 1 | 2 | 3;

export type TaskStatus =
  | "inprogress"
  | "done"
  | "notdone"
  | "canceled"
  | "partial";

export type BacklogItem = {
  id: string;
  title: string;
  description: string;
  dod: string;
  priority: TaskPriority;
  status: TaskStatus;
  customer: string;
  stream: string;
  participantIds: string[];
  loads: Record<string, number>;
  allocations?: Record<string, Record<string, number>>;
  notes?: Record<string, string>;
  quarterIds?: string[];
  releaseDate?: string;
  releaseSprintId?: string;
  leaderId?: string | null;
  order?: number;
  createdAt: string;
  updatedAt: string;
};

export type PageInfo = {
  size: number;
  number: number;
  totalElements: number;
  totalPages: number;
};

export type Page<T> = {
  content: T[];
  page: PageInfo;
  numberOfElements?: number;
  first?: boolean;
  last?: boolean;
  empty?: boolean;
  _links?: Record<string, unknown>;
};

/** Релиз и ключевые этапы */
export type Release = {
  id: string;
  name?: string;

  promDate: string;       // ПРОМ (обязателен)
  psiDate?: string;       // ПСИ (prom - 1)

  opsStart?: string;      // OPS 3 дня (начало)
  opsEnd?: string;        // OPS (конец)

  regressStart?: string;  // Регресс 4 дня (начало = opsStart - 4)
  regressEnd?: string;    // Регресс (конец)

  ffDate?: string;        // FF = regressStart - 1
  ffInnerDate?: string;   // FF InnerSource = ffDate - 3

  iftStart?: string;      // ИФТ 5 дней (начало = ffInnerDate - 5)
  iftEnd?: string;        // ИФТ (конец)

  buildDate?: string;     // Сборка = iftStart - 1
  crDate?: string;        // CR = buildDate - 1

  devStart?: string;      // Разработка 7 дней (начало = crDate - 7)
  devEnd?: string;        // Разработка (конец)

  stDate?: string;        // СТ = devStart - 1

  createdAt: string;
  updatedAt: string;
};

export type ApiHistoryAction = {
  id: string;
  sessionId: string;
  userName: string;
  action: string;
  path: string;
  httpMethod: string;
  statusCode: number;
  createdAt: string;
};

export type ApiSessionHistory = {
  sessionId: string;
  userName: string;
  lastActionAt: string;
  actions: ApiHistoryAction[];
};

export type Team = {
  key: string;
  name: string;
};
