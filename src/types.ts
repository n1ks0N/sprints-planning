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
  jiraLogin?: string | null;
};

export type JiraIssueLink = {
  participantId: string;
  planningSprintId?: string | null;
  jiraIssueId: string;
  jiraIssueKey: string;
  jiraIssueUrl: string;
  jiraProjectKey: string;
  jiraSprintId?: number | null;
  storyPoints?: number | null;
  createdAt?: string | null;
};

export type JiraIssueRequestPreview = {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
};

export type CapacityCell = {
  participantId: string;
  sprintId: string;
  workingDays: number;
  rate: number;
  normFactor: number;
  capacityFactor: number;
  baseCapacity: number;
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
  | "partial"
  | "backlog";

export type PlanningDemandKind = "ROLE" | "PARTICIPANT";

export type PlanningDemand = {
  kind: PlanningDemandKind;
  role?: string | null;
  participantId?: string | null;
  stream?: string | null;
  days: number;
};

export type PlanningWorkbenchItem = {
  id: string;
  title: string;
  description: string;
  dod: string;
  priority: TaskPriority;
  customers: string[];
  streams: string[];
  estimateDays: number;
  planningDemands: PlanningDemand[];
  planningQuarterIds: string[];
  planningSprintIds: string[];
  loads: Record<string, number>;
  allocations: Record<string, Record<string, number>>;
  releaseDateId?: string | null;
  initialQuarterId?: string | null;
  order?: number;
  createdAt: string;
  updatedAt: string;
};

export type BacklogItem = {
  id: string;
  title: string;
  description: string;
  dod: string;
  priority: TaskPriority;
  status: TaskStatus;
  customers: string[];
  streams: string[];
  participantIds: string[];
  planningQuarterIds?: string[];
  planningSprintIds?: string[];
  loads: Record<string, number>;
  allocations?: Record<string, Record<string, number>>;
  notes?: Record<string, string>;
  jiraIssues?: Record<string, Record<string, JiraIssueLink>>;
  quarterIds?: string[];
  releaseDateId?: string | null;
  initialQuarterId?: string | null;
  releaseSprintId?: string;
  leaderId?: string | null;
  order?: number;
  createdAt: string;
  updatedAt: string;
};

export type Allocations = Record<
  string,
  Record<string, Record<string, number>>
>;

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

export type ReleaseAnchorField =
  | "stDate"
  | "devStart"
  | "devEnd"
  | "crDate"
  | "buildDate"
  | "iftStart"
  | "iftEnd"
  | "ffInnerDate"
  | "ffDate"
  | "regressStart"
  | "regressEnd"
  | "opsStart"
  | "opsEnd"
  | "psiDate"
  | "promDate";

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

export type TaskHistoryChange = {
  field: string;
  label: string;
  before: unknown;
  after: unknown;
};

export type TaskHistoryItem = {
  id: string;
  taskId: string | null;
  eventType: string | null;
  action: string;
  userName: string;
  sessionId: string;
  statusCode: number;
  createdAt: string;
  changes: TaskHistoryChange[];
  meta: Record<string, unknown>;
};

export type JiraExportBatchItem = {
  itemId: string;
  taskJiraIssueId?: string | null;
  taskId: string;
  taskTitle?: string | null;
  planningSprintId?: string | null;
  planningSprintName?: string | null;
  participantId?: string | null;
  participantName?: string | null;
  status:
    | "PENDING"
    | "IN_PROGRESS"
    | "CREATED"
    | "FAILED"
    | "SKIPPED"
    | "MANUAL_CHECK_REQUIRED";
  manualActionRequired?: boolean;
  message?: string | null;
  jiraIssueId?: string | null;
  jiraIssueKey?: string | null;
  jiraIssueUrl?: string | null;
  jiraRequest?: JiraIssueRequestPreview | null;
};

export type JiraExportBatchStartResponse = {
  batchId: string;
  status: string;
  totalItems: number;
};

export type JiraExportBatchStatus = {
  batchId: string;
  status: string;
  totalItems: number;
  processedItems: number;
  createdItems: number;
  failedItems: number;
  skippedItems: number;
  manualCheckItems: number;
  items: JiraExportBatchItem[];
};

export type PlanningParticipantLoadCell = {
  participantId: string;
  sprintId: string;
  capacity: number;
  committed: number;
  draft: number;
  total: number;
  overload: number;
  free: number;
};

export type PlanningParticipantLoadRow = {
  participant: Participant;
  cells: PlanningParticipantLoadCell[];
  totalCapacity: number;
  totalCommitted: number;
  totalDraft: number;
  totalLoad: number;
  totalOverload: number;
  totalFree: number;
};

export type PlanningSolveSummary = {
  taskCount: number;
  participantCount: number;
  plannedDays: number;
  unplannedDays: number;
  overloadedCells: number;
};

export type PlanningWorkbenchPreview = {
  selectedItemIds: string[];
  sprintIds: string[];
  summary: PlanningSolveSummary;
  warnings: string[];
  items: PlanningWorkbenchItem[];
  participantSummary: PlanningParticipantLoadRow[];
  canApply: boolean;
};

export type Team = {
  key: string;
  name: string;
};

export type FiltersData = {
  quarters: { id: string; name: string }[];
  statuses: string[];
  priorities: number[];
  streams: string[];
  customers: string[];
  releases: { id: string; promDate: string }[];
  participantRoles: string[];
  participantStreams: string[];
};
