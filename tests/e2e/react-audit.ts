import type { Page } from "@playwright/test";

/** Observe committed component work through React's development renderer hook. */
export async function installReactAudit(page: Page) {
  await page.addInitScript(() => {
    const audit = { renders: {} as Record<string, number>, cells: {} as Record<string, number>, participants: {} as Record<string, number>, tasks: {} as Record<string, number>, emptyTaskAllocations: [] as string[] };
    (window as any).__reactAudit = audit;
    (window as any).__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
      supportsFiber: true,
      inject: () => 1,
      onCommitFiberUnmount() {},
      onCommitFiberRoot(_id: number, root: any) {
        const visit = (fiber: any) => {
          if (!fiber) return;
          const name = typeof fiber.type === "function" ? fiber.type.name : "";
          if ((fiber.flags & 1) && /^(BacklogPage|TaskCardsList|BacklogTaskCard|QuarterFilter|ReleaseFilter|CapacityTable|TaskAllocationCell|PlanningWorkbenchPage|PlanningWorkbenchItemCard|TeamPage|ParticipantTableRow)$/.test(name)) {
            audit.renders[name] = (audit.renders[name] || 0) + 1;
          }
          if ((fiber.flags & 1) && name === "TaskAllocationCell") {
            const { taskId, participantId, sprintId } = fiber.memoizedProps;
            const key = `${taskId}:${participantId}:${sprintId}`;
            audit.cells[key] = (audit.cells[key] || 0) + 1;
          }
          if ((fiber.flags & 1) && name === "BacklogTaskCard") {
            const { task, allocationsByParticipant } = fiber.memoizedProps;
            audit.tasks[task.id] = (audit.tasks[task.id] || 0) + 1;
            if (Object.keys(task.allocations || {}).length && !Object.keys(allocationsByParticipant || {}).length) audit.emptyTaskAllocations.push(task.id);
          }
          if ((fiber.flags & 1) && name === "ParticipantTableRow") {
            const id = fiber.memoizedProps.p.id;
            audit.participants[id] = (audit.participants[id] || 0) + 1;
          }
          visit(fiber.child); visit(fiber.sibling);
        };
        visit(root.current);
      },
    };
  });
}

export function readReactAudit(page: Page) {
  return page.evaluate(() => ({ ...(window as any).__reactAudit.renders })) as Promise<Record<string, number>>;
}

export function readCellAudit(page: Page) {
  return page.evaluate(() => ({ ...(window as any).__reactAudit.cells })) as Promise<Record<string, number>>;
}

export function readParticipantAudit(page: Page) {
  return page.evaluate(() => ({ ...(window as any).__reactAudit.participants })) as Promise<Record<string, number>>;
}

export function readTaskAudit(page: Page) {
  return page.evaluate(() => ({ tasks: { ...(window as any).__reactAudit.tasks }, emptyTaskAllocations: [...(window as any).__reactAudit.emptyTaskAllocations] })) as Promise<{ tasks: Record<string, number>; emptyTaskAllocations: string[] }>;
}
