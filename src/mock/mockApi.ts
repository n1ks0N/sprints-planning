import type { BaseQueryFn } from "@reduxjs/toolkit/query";
import type {
  Quarter,
  Sprint,
  Participant,
  RunVacation,
  CapacityRow,
  CapacityCell,
  BacklogItem,
} from "../types";
import {
  quarters,
  sprints,
  participants,
  runvac,
  tasks,
  helpers,
} from "./mockData";

const normFactor = 0.75;

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v));
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

function ensureTaskAllocationsForSprint(sprintId: string) {
  for (const t of tasks) {
    if (!t.allocations) t.allocations = {};
    for (const pid of t.participantIds) {
      if (!t.allocations[pid]) t.allocations[pid] = {};
      if (t.allocations[pid][sprintId] == null)
        t.allocations[pid][sprintId] = 0;
    }
  }
}

function ensureTaskAllocationsForAll(task: BacklogItem) {
  if (!task.allocations) task.allocations = {};
  for (const pid of task.participantIds) {
    if (!task.allocations[pid]) task.allocations[pid] = {};
    for (const s of sprints) {
      if (task.allocations[pid][s.id] == null) task.allocations[pid][s.id] = 0;
    }
  }
}

function recomputeTaskLoadsFromAllocations(task: BacklogItem) {
  if (!task.allocations) return;
  for (const s of sprints) {
    const sid = s.id;
    let sum = 0;
    for (const pid of Object.keys(task.allocations)) {
      const v = Number(task.allocations[pid][sid] || 0);
      if (Number.isFinite(v)) sum += Math.round(v);
    }
    task.loads[sid] = sum;
  }
}

export const mockBaseQuery: BaseQueryFn<
  { url: string; method?: string; body?: any; params?: Record<string, any> },
  unknown,
  unknown
> = async (args) => {
  const { url, method = "GET", body, params } = args || {};
  await new Promise((r) => setTimeout(r, 80));

  try {
    // -------- QUARTERS --------
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
      if (idx < 0)
        return { error: { status: 404, data: "Quarter not found" } as any };
      quarters[idx] = { ...quarters[idx], ...patch };
      return { data: clone(quarters[idx]) };
    }
    if (url === "/quarters/delete" && method === "POST") {
      const { id } = body || {};
      const qIdx = quarters.findIndex((q) => q.id === id);
      if (qIdx < 0)
        return { error: { status: 404, data: "Quarter not found" } as any };
      // удаляем связанные спринты
      for (let i = sprints.length - 1; i >= 0; i--) {
        if (sprints[i].quarterId === id) sprints.splice(i, 1);
      }
      const deleted = quarters.splice(qIdx, 1)[0];
      return { data: clone(deleted) };
    }

    // -------- SPRINTS --------
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

      // новый спринт — нулевая нагрузка у всех задач + аллокации
      ensureTaskLoadsForSprint(id);
      ensureTaskAllocationsForSprint(id);

      return { data: clone(s) };
    }
    if (url === "/sprints/update" && method === "POST") {
      const { id, ...patch } = body || {};
      const idx = sprints.findIndex((s) => s.id === id);
      if (idx < 0)
        return { error: { status: 404, data: "Sprint not found" } as any };
      const prev = sprints[idx];
      sprints[idx] = { ...prev, ...patch };
      // пересчёт рабочих дней если изменены даты
      if (patch.startDate || patch.endDate) {
        const sd = sprints[idx].startDate;
        const ed = sprints[idx].endDate;
        sprints[idx].workingDays = helpers.businessDays(sd, ed);
      }
      return { data: clone(sprints[idx]) };
    }
    if (url === "/sprints/delete" && method === "POST") {
      const { id } = body || {};
      const idx = sprints.findIndex((s) => s.id === id);
      if (idx < 0)
        return { error: { status: 404, data: "Sprint not found" } as any };
      const sid = sprints[idx].id;
      // чистим loads/allocations в задачах
      for (const t of tasks) {
        delete t.loads[sid];
        if (t.allocations) {
          for (const pid of Object.keys(t.allocations)) {
            delete t.allocations[pid][sid];
          }
        }
      }
      const deleted = sprints.splice(idx, 1)[0];
      return { data: clone(deleted) };
    }

    // -------- PARTICIPANTS --------
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
      // ничего не меняем в задачах — распределения редактируются на странице бэклога
      return { data: clone(p) };
    }
    if (url === "/participants/update" && method === "POST") {
      const { id, ...patch } = body || {};
      const idx = participants.findIndex((p) => p.id === id);
      if (idx < 0)
        return { error: { status: 404, data: "Participant not found" } as any };
      participants[idx] = { ...participants[idx], ...patch };
      return { data: clone(participants[idx]) };
    }
    if (url === "/participants/delete" && method === "POST") {
      const { id } = body || {};
      const idx = participants.findIndex((p) => p.id === id);
      if (idx < 0)
        return {
          error: { status: 404, data: "Participant not found" } as any,
        };
      // удалить участника из всех задач + его allocations
      for (const t of tasks) {
        t.participantIds = t.participantIds.filter((pid) => pid !== id);
        if (t.allocations) delete t.allocations[id];
        recomputeTaskLoadsFromAllocations(t);
      }
      const deleted = participants.splice(idx, 1)[0];
      return { data: clone(deleted) };
    }
    if (url === "/participants/reorder" && method === "POST") {
      const { orders } = body || {};
      const orderMap = new Map<string, number>();
      (orders as { id: string; order: number }[]).forEach((o) =>
        orderMap.set(o.id, o.order)
      );
      participants.sort(
        (a, b) => (orderMap.get(a.id) ?? 0) - (orderMap.get(b.id) ?? 0)
      );
      return { data: { ok: true } as any };
    }

    // -------- RUN/VACATION --------
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
          // отпуск не трогаем
        }
      }
      return { data: { ok: true } as any };
    }

    // -------- CAPACITY --------
    if (url === "/capacity" && method === "GET") {
      const qid = params?.quarterId as string;
      const sList = sprints
        .filter((s) => s.quarterId === qid)
        .sort((a, b) => a.order - b.order);

      const rows: CapacityRow[] = participants.map((p) => {
        const cells: CapacityCell[] = sList.map((s) => {
          const rv = ensureRunVac(p.id, s.id);
          const baseCapacity = Math.round(s.workingDays * p.rate * normFactor);

          // сумма задач участника в этом спринте
          let taskDays = 0;
          for (const t of tasks) {
            const v = t.allocations?.[p.id]?.[s.id] ?? 0;
            taskDays += Math.round(Number(v) || 0);
          }

          const available = Math.max(
            0,
            baseCapacity - rv.runDays - rv.vacationNormDays - taskDays
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

    // -------- BACKLOG --------
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
        dod: body.dod || "",
        priority: body.priority ?? 2,
        customer: body.customer || "",
        stream: body.stream || "",
        participantIds: Array.isArray(body.participantIds)
          ? body.participantIds
          : [],
        loads: {},
        allocations: {},
        releaseDate: body.releaseDate,
        releaseSprintId: body.releaseSprintId,
        createdAt: nowISO,
        updatedAt: nowISO,
      };
      // инициализация loads/allocations
      for (const s of sprints) {
        item.loads[s.id] = 0;
      }
      for (const pid of item.participantIds) {
        item.allocations![pid] = {};
        for (const s of sprints) item.allocations![pid][s.id] = 0;
      }
      tasks.push(item);
      return { data: clone(item) };
    }
    if (url === "/tasks/update" && method === "POST") {
      const { id, ...patch } = body || {};
      const idx = tasks.findIndex((t) => t.id === id);
      if (idx < 0)
        return { error: { status: 404, data: "Task not found" } as any };

      // применяем патч
      tasks[idx] = {
        ...tasks[idx],
        ...patch,
        updatedAt: new Date().toISOString().slice(0, 10),
      };

      // поддерживаем согласованность allocations с participantIds
      const t = tasks[idx];
      if (!t.allocations) t.allocations = {};
      if (patch.participantIds) {
        const set = new Set(t.participantIds);
        // удаляем лишних
        for (const pid of Object.keys(t.allocations)) {
          if (!set.has(pid)) delete t.allocations[pid];
        }
        // добавляем недостающих
        for (const pid of t.participantIds) {
          if (!t.allocations[pid]) t.allocations[pid] = {};
          for (const s of sprints) {
            if (t.allocations[pid][s.id] == null) t.allocations[pid][s.id] = 0;
          }
        }
        // пересчитать loads из allocations
        recomputeTaskLoadsFromAllocations(t);
      } else {
        ensureTaskAllocationsForAll(t);
      }

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
    if (url === "/taskload" && method === "POST") {
      const { taskId, sprintId, days = 0 } = body || {};
      const t = tasks.find((x) => x.id === taskId);
      if (!t) return { error: { status: 404, data: "Task not found" } as any };
      t.loads[sprintId] = Math.max(0, Math.round(Number(days) || 0));
      t.updatedAt = new Date().toISOString().slice(0, 10);
      // не меняем allocations — это ручное распределение
      return { data: clone(t) };
    }
    if (url === "/taskallocation" && method === "POST") {
      const { taskId, participantId, sprintId, days = 0 } = body || {};
      const t = tasks.find((x) => x.id === taskId);
      if (!t) return { error: { status: 404, data: "Task not found" } as any };
      if (!t.allocations) t.allocations = {};
      if (!t.allocations[participantId]) t.allocations[participantId] = {};
      t.allocations[participantId][sprintId] = Math.max(
        0,
        Math.round(Number(days) || 0)
      );
      // после изменения allocations — пересчитать loads
      recomputeTaskLoadsFromAllocations(t);
      t.updatedAt = new Date().toISOString().slice(0, 10);
      return { data: clone(t) };
    }

    return { error: { status: 404, data: "Unknown endpoint" } as any };
  } catch (e) {
    return { error: { status: 500, data: String(e) } as any };
  }
};
