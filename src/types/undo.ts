import type { Participant, Quarter, Sprint, BacklogItem, RunVacation, Release } from "../types";

export type UndoItem =
  | { kind: "participants/delete"; id: string }
  | { kind: "participants/add"; participant: Participant }
  | { kind: "participants/update"; participant: Participant }
  | { kind: "participants/reorder"; orders: { id: string; order: number }[] }
  | { kind: "quarters/delete"; id: string }
  | { kind: "quarters/add"; quarter: Quarter }
  | { kind: "quarters/update"; quarter: Quarter }
  | { kind: "sprints/delete"; id: string }
  | { kind: "sprints/add"; sprint: Sprint }
  | { kind: "sprints/update"; sprint: Sprint }
  | { kind: "tasks/delete"; id: string }
  | { kind: "tasks/add"; task: BacklogItem }
  | { kind: "tasks/update"; task: BacklogItem }
  | {
      kind: "taskallocation/set";
      taskId: string;
      participantId: string;
      sprintId: string;
      days: number;
    }
  | {
      kind: "taskallocation/bulk";
      allocations: {
        taskId: string;
        participantId: string;
        sprintId: string;
        days: number;
      }[];
    }
  | { kind: "taskload/set"; taskId: string; sprintId: string; days: number }
  | { kind: "runvac/set"; rv: RunVacation }
  | { kind: "runvac/bulk-restore"; items: RunVacation[] }
  | { kind: "releases/delete"; id: string }
  | { kind: "releases/add"; release: Release }
  | { kind: "releases/update"; release: Release };
