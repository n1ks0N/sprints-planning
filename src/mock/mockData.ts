import type {
  Quarter,
  Sprint,
  Participant,
  RunVacation,
  BacklogItem,
  Release,
} from "../types";

export const helpers = {
  businessDays(startISO: string, endISO: string) {
    const start = new Date(startISO);
    const end = new Date(endISO);
    let cnt = 0;
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const day = d.getDay();
      if (day !== 0 && day !== 6) cnt++;
    }
    return cnt;
  },
};

export const quarters: Quarter[] = [
  {
    id: "q1",
    year: 2025,
    number: 4,
    name: "Q4 2025",
    startDate: "2025-10-01",
    endDate: "2025-12-31",
  },
];

export const sprints: Sprint[] = [
  {
    id: "s1",
    quarterId: "q1",
    name: "Sprint 1",
    startDate: "2025-10-01",
    endDate: "2025-10-21",
    workingDays: helpers.businessDays("2025-10-01", "2025-10-21"),
    order: 1,
  },
  {
    id: "s2",
    quarterId: "q1",
    name: "Sprint 2",
    startDate: "2025-10-22",
    endDate: "2025-11-11",
    workingDays: helpers.businessDays("2025-10-22", "2025-11-11"),
    order: 2,
  },
  {
    id: "s3",
    quarterId: "q1",
    name: "Sprint 3",
    startDate: "2025-11-12",
    endDate: "2025-12-02",
    workingDays: helpers.businessDays("2025-11-12", "2025-12-02"),
    order: 3,
  },
  {
    id: "s4",
    quarterId: "q1",
    name: "Sprint 4",
    startDate: "2025-12-03",
    endDate: "2025-12-23",
    workingDays: helpers.businessDays("2025-12-03", "2025-12-23"),
    order: 4,
  },
];

export const participants: Participant[] = [
  { id: "u1", fullName: "Иванов Иван", role: "BE", rate: 1 },
  { id: "u2", fullName: "Петров Пётр", role: "FE", rate: 0.75 },
  { id: "u3", fullName: "Сидоров Сидор", role: "QA", rate: 1 },
];

export const runvac: RunVacation[] = [];

export const tasks: BacklogItem[] = [
  {
    id: "t1",
    title: "Админка Online-мониторинга",
    description: "Панель для отображения метрик и инцидентов",
    dod: "Список/фильтры/детали, автотесты",
    priority: 1,
    customer: "ЦКР",
    stream: "isu2.0",
    participantIds: ["u1", "u2", "u3"],
    loads: { s1: 5, s2: 5, s3: 0, s4: 0 },
    releaseDate: "2025-11-28",
    releaseSprintId: "s3",
    leaderId: "u1",
    createdAt: "2025-10-05",
    updatedAt: "2025-10-05",
  },
  {
    id: "t2",
    title: "Авто-логирование инцидентов",
    description: "Поток логов с автоматическими алертами",
    dod: "ELK + алерты в Ops",
    priority: 2,
    customer: "Ops",
    stream: "sm&analytics",
    participantIds: ["u3"],
    loads: { s1: 0, s2: 2, s3: 2, s4: 0 },
    releaseDate: "2025-12-20",
    releaseSprintId: "s4",
    leaderId: "u3",
    createdAt: "2025-10-10",
    updatedAt: "2025-10-10",
  },
];

export const releases: Release[] = [
  {
    id: "r1",
    name: "Релиз 1",
    promDate: "2025-12-25",
    psiDate: "2025-12-24",
    opsStart: "2025-12-21",
    opsEnd: "2025-12-23",
    regressStart: "2025-12-17",
    regressEnd: "2025-12-20",
    ffDate: "2025-12-16",
    ffInnerDate: "2025-12-13",
    iftStart: "2025-12-08",
    iftEnd: "2025-12-12",
    buildDate: "2025-12-07",
    crDate: "2025-12-06",
    devStart: "2025-11-29",
    devEnd: "2025-12-05",
    stDate: "2025-11-28",
    createdAt: "2025-10-15",
    updatedAt: "2025-10-15",
  },
];
