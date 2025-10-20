export type Quarter = {
  id: string;
  year: number;
  number: 1 | 2 | 3 | 4;
  name: string;
  startDate: string; // ISO YYYY-MM-DD
  endDate: string; // ISO YYYY-MM-DD
};

export type Sprint = {
  id: string;
  quarterId: string;
  name: string;
  startDate: string; // ISO
  endDate: string; // ISO
  workingDays: number;
  order: number;
};

export type Participant = {
  id: string;
  fullName: string;
  role: string;
  rate: number; // 0..1
};

// run + отпуск (нормированный) на спринт
export type RunVacation = {
  participantId: string;
  sprintId: string;
  runDays: number;
  vacationNormDays: number;
};

// Ячейка ёмкости
export type CapacityCell = {
  participantId: string;
  sprintId: string;
  workingDays: number;
  rate: number;
  normFactor: number;
  baseCapacity: number; // workingDays * rate * normFactor, округлено
  runDays: number;
  vacationNormDays: number;
  availableDays: number; // base - run - vacation - tasks (округлено)
};

export type CapacityRow = {
  participant: Participant;
  cells: CapacityCell[];
  totalQuarterAvailable: number;
};

// -------- Backlog --------
export type TaskPriority = 1 | 2 | 3;

export type BacklogItem = {
  id: string;
  title: string;
  dod: string;
  priority: TaskPriority;
  customer: string;
  stream: string;
  participantIds: string[];
  // суммарная нагрузка задачи по спринту (для совместимости)
  loads: Record<string, number>; // sprintId -> days
  // распределение по участникам и спринтам
  allocations?: Record<string, Record<string, number>>; // participantId -> (sprintId -> days)
  releaseDate?: string; // ISO
  releaseSprintId?: string; // sprintId
  createdAt: string; // ISO date (YYYY-MM-DD)
  updatedAt: string; // ISO date
};
