import type { BaseQueryFn } from "@reduxjs/toolkit/query";
import type {
  Quarter,
  Sprint,
  Participant,
  RunVacation,
  CapacityRow,
  CapacityCell,
  BacklogItem,
  Release,
} from "../types";
import {
  quarters,
  sprints,
  participants,
  runvac,
  tasks,
  releases,
  helpers,
} from "./mockData";

const normFactor = 0.75;

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v));
}

function addDaysISO(iso: string, days: number): string {
  const d = new Date(iso);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function ensureRunVac(participantId: string, sprintId: string): RunVacation {
  let rv = runvac.find(
    (r) => r.participantId === participantId && r.sprintId === sprintId
  );
  if (!rv) {
    rv = { participantId, sprintId, runDays: 0, vacationNormDays: 0 };
    runvac.push(rv);
  }
  return rv;
}

function ensureTaskLoadsForSprint(sprintId: string) {
  for (const t of tasks) {
    if (!(sprintId in t.loads)) t.loads[sprintId] = 0;
  }
}

function ensureTaskLoadsForAllSprints(item: BacklogItem) {
  for (const s of sprints) {
    if (!(s.id in item.loads)) item.loads[s.id] = 0;
  }
}

function computeReleaseFromProm(promDate: string) {
  const psiDate = addDaysISO(promDate, -1);
  const opsStart = addDaysISO(psiDate, -3);
  const opsEnd = addDaysISO(opsStart, 2);

  const regressStart = addDaysISO(opsStart, -4);
  const regressEnd = addDaysISO(regressStart, 3);

  const ffDate = addDaysISO(regressStart, -1);
  const ffInnerDate = addDaysISO(ffDate, -3);

  const iftStart = addDaysISO(ffInnerDate, -5);
  const iftEnd = addDaysISO(iftStart, 4);

  const buildDate = addDaysISO(iftStart, -1);
  const crDate = addDaysISO(buildDate, -1);

  const devStart = addDaysISO(crDate, -7);
  const devEnd = addDaysISO(devStart, 6);

  const stDate = addDaysISO(devStart, -1);

  return {
    psiDate,
    opsStart,
    opsEnd,
    regressStart,
    regressEnd,
    ffDate,
    ffInnerDate,
    iftStart,
    iftEnd,
    buildDate,
    crDate,
    devStart,
    devEnd,
    stDate,
  };
}

export const mockBaseQuery: BaseQueryFn<
  { url: string; method?: string; body?: any; params?: Record<string, any> },
  unknown,
  unknown
> = async (args) => {
  const { url, method = "GET", body, params } = args || {};
  await new Promise((r) => setTimeout(r, 80));

  try {
    // QUARTERS
    if (url === "/quarters" && method === "GET") {
      return { data: clone(quarters) as Quarter[] };
    }
    if (url === "/quarters" && method === "POST") {
      const id = "q" + (quarters.length + 1);
      const year = body.year ?? new Date().getFullYear();
      const number = body.number ?? 1;
      const name = body.name ?? `Q${number} ${year}`;
      const startDate = body.startDate;
      const endDate = body.endDate;
      const q: Quarter = { id, year, number, name, startDate, endDate };
      quarters.push(q);
      return { data: clone(q) };
    }
    if (url === "/quarters/update" && method === "POST") {
      const { id, ...patch } = body || {};
      const idx = quarters.findIndex((q) => q.id === id);
      if (idx < 0) return { error: { status: 404, data: "Quarter not found" } as any };
      quarters[idx] = { ...quarters[idx], ...patch };
      return { data: clone(quarters[idx]) };
    }
    if (url === "/quarters/delete" && method === "POST") {
      const { id } = body || {};
      const idx = quarters.findIndex((q) => q.id === id);
      if (idx < 0) return { error: { status: 404, data: "Quarter not found" } as any };
      const deleted = quarters.splice(idx, 1)[0];
      for (let i = sprints.length - 1; i >= 0; i--) {
        if (sprints[i].quarterId === id) sprints.splice(i, 1);
      }
      return { data: clone(deleted) };
    }

    // SPRINTS
    if (url === "/sprints" && method === "GET") {
      let list = sprints;
      if (params?.quarterId)
        list = sprints.filter((s) => s.quarterId === params.quarterId);
      return { data: clone(list) as Sprint[] };
    }
    if (url === "/sprints" && method === "POST") {
      const id = "s" + (sprints.length + 1);
      const startDate = body.startDate;
      const endDate = body.endDate;
      const workingDays =
        body.workingDays ?? helpers.businessDays(startDate, endDate);
      const s: Sprint = {
        id,
        quarterId: body.quarterId,
        name: body.name ?? `Sprint ${id}`,
        startDate,
        endDate,
        workingDays,
        order:
          body.order ??
          sprints.filter((x) => x.quarterId === body.quarterId).length + 1,
      };
      sprints.push(s);
      ensureTaskLoadsForSprint(id);
      return { data: clone(s) };
    }
    if (url === "/sprints/update" && method === "POST") {
      const { id, ...patch } = body || {};
      const idx = sprints.findIndex((s) => s.id === id);
      if (idx < 0) return { error: { status: 404, data: "Sprint not found" } as any };
      const prev = sprints[idx];
      const startDate = patch.startDate ?? prev.startDate;
      const endDate = patch.endDate ?? prev.endDate;
      const workingDays =
        patch.workingDays ?? helpers.businessDays(startDate, endDate);
      sprints[idx] = { ...prev, ...patch, startDate, endDate, workingDays };
      return { data: clone(sprints[idx]) };
    }
    if (url === "/sprints/delete" && method === "POST") {
      const { id } = body || {};
      const idx = sprints.findIndex((s) => s.id === id);
      if (idx < 0) return { error: { status: 404, data: "Sprint not found" } as any };
      const deleted = sprints.splice(idx, 1)[0];
      return { data: clone(deleted) };
    }

    // PARTICIPANTS
    if (url === "/participants" && method === "GET") {
      return { data: clone(participants) as Participant[] };
    }
    if (url === "/participants" && method === "POST") {
      const id = "u" + (participants.length + 1);
      const p: Participant = {
        id,
        fullName: body.fullName,
        role: body.role,
        rate: body.rate,
      };
      participants.push(p);
      return { data: clone(p) };
    }
    if (url === "/participants/update" && method === "POST") {
      const { id, ...patch } = body || {};
      const idx = participants.findIndex((p) => p.id === id);
      if (idx < 0) return { error: { status: 404, data: "Participant not found" } as any };
      participants[idx] = { ...participants[idx], ...patch };
      return { data: clone(participants[idx]) };
    }
    if (url === "/participants/delete" && method === "POST") {
      const { id } = body || {};
      const idx = participants.findIndex((p) => p.id === id);
      if (idx < 0) return { error: { status: 404, data: "Participant not found" } as any };
      const deleted = participants.splice(idx, 1)[0];
      return { data: clone(deleted) };
    }
    if (url === "/participants/reorder" && method === "POST") {
      const { orders } = body || {};
      const orderMap = new Map<string, number>();
      for (const o of orders || []) orderMap.set(o.id, o.order);
      participants.sort(
        (a, b) => (orderMap.get(a.id) ?? 0) - (orderMap.get(b.id) ?? 0)
      );
      return { data: { ok: true } as any };
    }

    // RUN/VACATION
    if (url === "/runvac" && method === "GET") {
      const qid = params?.quarterId as string;
      const sList = sprints.filter((s) => s.quarterId === qid).map((s) => s.id);
      const list = runvac.filter((rv) => sList.includes(rv.sprintId));
      return { data: clone(list) as RunVacation[] };
    }
    if (url === "/runvac" && method === "POST") {
      const {
        participantId,
        sprintId,
        runDays = 0,
        vacationNormDays = 0,
      } = body;
      const rv = ensureRunVac(participantId, sprintId);
      rv.runDays = Math.max(0, Math.round(Number(runDays) || 0));
      rv.vacationNormDays = Math.max(
        0,
        Math.round(Number(vacationNormDays) || 0)
      );
      return { data: clone(rv) };
    }
    if (url === "/runvac/bulk" && method === "POST") {
      const {
        quarterId,
        roles,
        daysPerSprint = 0,
        multiplyByRate = true,
      } = body || {};
      const sprintIds = sprints
        .filter((s) => s.quarterId === quarterId)
        .map((s) => s.id);
      const roleSet = roles?.length ? new Set<string>(roles) : null;

      for (const p of participants) {
        if (roleSet && !roleSet.has(p.role)) continue;
        for (const sid of sprintIds) {
          const rv = ensureRunVac(p.id, sid);
          const base = Number(daysPerSprint) || 0;
          const value = multiplyByRate
            ? Math.round(base * p.rate)
            : Math.round(base);
          rv.runDays = Math.max(0, value);
        }
      }
      return { data: { ok: true } as any };
    }

    // CAPACITY
    if (url === "/capacity" && method === "GET") {
      const qid = params?.quarterId as string;
      const sList = sprints
        .filter((s) => s.quarterId === qid)
        .sort((a, b) => a.order - b.order);
      const rows: CapacityRow[] = participants.map((p) => {
        const cells: CapacityCell[] = sList.map((s) => {
          const rv = ensureRunVac(p.id, s.id);
          const baseCapacity = Math.round(s.workingDays * p.rate * normFactor);
          const available = Math.max(
            0,
            baseCapacity - rv.runDays - rv.vacationNormDays
          );
          return {
            participantId: p.id,
            sprintId: s.id,
            workingDays: s.workingDays,
            rate: p.rate,
            normFactor,
            baseCapacity,
            runDays: rv.runDays,
            vacationNormDays: rv.vacationNormDays,
            availableDays: Math.round(available),
          };
        });
        const total = cells.reduce((a, c) => a + c.availableDays, 0);
        return {
          participant: p,
          cells,
          totalQuarterAvailable: Math.round(total),
        };
      });
      return { data: clone(rows) as CapacityRow[] };
    }

    // BACKLOG
    if (url === "/tasks" && method === "GET") {
      const qid: string | undefined = params?.quarterId;
      if (!qid) {
        return { data: clone(tasks) as BacklogItem[] };
      }
      const sprintIds = new Set(
        sprints.filter((s) => s.quarterId === qid).map((s) => s.id)
      );
      const filtered = tasks.filter((t) =>
        Object.entries(t.loads).some(
          ([sid, days]) => sprintIds.has(sid) && (days || 0) > 0
        )
      );
      return { data: clone(filtered) as BacklogItem[] };
    }
    if (url === "/tasks" && method === "POST") {
      const id = "t" + (tasks.length + 1);
      const nowISO = new Date().toISOString().slice(0, 10);
      const item: BacklogItem = {
        id,
        title: body.title || "Новая задача",
        description: body.description || "",
        dod: body.dod || "",
        priority: body.priority ?? 2,
        customer: body.customer || "",
        stream: body.stream || "",
        participantIds: Array.isArray(body.participantIds)
          ? body.participantIds
          : [],
        loads: {},
        releaseDate: body.releaseDate,
        releaseSprintId: body.releaseSprintId,
        leaderId: body.leaderId ?? null,
        createdAt: nowISO,
        updatedAt: nowISO,
      };
      ensureTaskLoadsForAllSprints(item);
      tasks.push(item);
      return { data: clone(item) };
    }
    if (url === "/tasks/update" && method === "POST") {
      const { id, ...patch } = body || {};
      const idx = tasks.findIndex((t) => t.id === id);
      if (idx < 0)
        return { error: { status: 404, data: "Task not found" } as any };
      tasks[idx] = {
        ...tasks[idx],
        ...patch,
        updatedAt: new Date().toISOString().slice(0, 10),
      };
      ensureTaskLoadsForAllSprints(tasks[idx]);
      return { data: clone(tasks[idx]) };
    }
    if (url === "/tasks/delete" && method === "POST") {
      const { id } = body || {};
      const idx = tasks.findIndex((t) => t.id === id);
      if (idx < 0)
        return { error: { status: 404, data: "Task not found" } as any };
      const deleted = tasks.splice(idx, 1)[0];
      return { data: clone(deleted) };
    }

    // Детализированная запись распределения по участнику
    if (url === "/taskalloc" && method === "POST") {
      const { taskId, participantId, sprintId, days = 0 } = body || {};
      const t = tasks.find((x) => x.id === taskId);
      if (!t) return { error: { status: 404, data: "Task not found" } as any };
      t.allocations = t.allocations || {};
      t.allocations[participantId] = t.allocations[participantId] || {};
      t.allocations[participantId][sprintId] = Math.max(
        0,
        Math.round(Number(days) || 0)
      );
      t.loads[sprintId] = Object.values(t.allocations)
        .map((m) => m[sprintId] || 0)
        .reduce((a, b) => a + b, 0);
      t.updatedAt = new Date().toISOString().slice(0, 10);
      ensureTaskLoadsForAllSprints(t);
      return { data: clone(t) };
    }

    // Легаси путь для upsertTaskLoad (суммарная нагрузка по спринту)
    if (url === "/taskload" && method === "POST") {
      const { taskId, sprintId, days = 0 } = body || {};
      const t = tasks.find((x) => x.id === taskId);
      if (!t) return { error: { status: 404, data: "Task not found" } as any };
      t.loads[sprintId] = Math.max(0, Math.round(Number(days) || 0));
      t.updatedAt = new Date().toISOString().slice(0, 10);
      ensureTaskLoadsForAllSprints(t);
      return { data: clone(t) };
    }

    // RELEASES
    if (url === "/releases" && method === "GET") {
      const list = releases.slice().sort((a, b) =>
        a.promDate.localeCompare(b.promDate)
      );
      return { data: clone(list) as Release[] };
    }
    if (url === "/releases" && method === "POST") {
      const id = "r" + (releases.length + 1);
      const now = new Date().toISOString().slice(0, 10);
      const promDate = body.promDate as string;
      if (!promDate)
        return { error: { status: 400, data: "promDate required" } as any };

      const set = {
        ...computeReleaseFromProm(promDate),
        ...body,
      } as Partial<Release> & { promDate: string };
      const r: Release = {
        id,
        name: set.name,
        promDate: set.promDate,
        psiDate: set.psiDate,
        opsStart: set.opsStart,
        opsEnd: set.opsEnd,
        regressStart: set.regressStart,
        regressEnd: set.regressEnd,
        ffDate: set.ffDate,
        ffInnerDate: set.ffInnerDate,
        iftStart: set.iftStart,
        iftEnd: set.iftEnd,
        buildDate: set.buildDate,
        crDate: set.crDate,
        devStart: set.devStart,
        devEnd: set.devEnd,
        stDate: set.stDate,
        createdAt: now,
        updatedAt: now,
      };
      releases.push(r);
      return { data: clone(r) };
    }
    if (url === "/releases/update" && method === "POST") {
      const { id, action, ...patch } = body || {};
      const idx = releases.findIndex((r) => r.id === id);
      if (idx < 0)
        return { error: { status: 404, data: "Release not found" } as any };
      let base = releases[idx];

      if (action === "clear") {
        base = {
          ...base,
          name: patch.name ?? base.name,
          psiDate: undefined,
          opsStart: undefined,
          opsEnd: undefined,
          regressStart: undefined,
          regressEnd: undefined,
          ffDate: undefined,
          ffInnerDate: undefined,
          iftStart: undefined,
          iftEnd: undefined,
          buildDate: undefined,
          crDate: undefined,
          devStart: undefined,
          devEnd: undefined,
          stDate: undefined,
        };
      } else if (action === "recalc") {
        const prom = (patch.promDate || base.promDate) as string;
        const calc = computeReleaseFromProm(prom);
        base = {
          ...base,
          ...patch,
          ...calc,
        };
      } else {
        base = { ...base, ...patch };
      }

      base.updatedAt = new Date().toISOString().slice(0, 10);
      releases[idx] = base;
      return { data: clone(releases[idx]) };
    }
    if (url === "/releases/delete" && method === "POST") {
      const { id } = body || {};
      const idx = releases.findIndex((r) => r.id === id);
      if (idx < 0)
        return { error: { status: 404, data: "Release not found" } as any };
      const deleted = releases.splice(idx, 1)[0];
      return { data: clone(deleted) };
    }

    return { error: { status: 404, data: "Unknown endpoint" } as any };
  } catch (e) {
    return { error: { status: 500, data: String(e) } as any };
  }
};
