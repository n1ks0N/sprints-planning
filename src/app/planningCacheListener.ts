import { createListenerMiddleware, isAnyOf } from "@reduxjs/toolkit";
import { api } from "./api";

export const taskMutationFulfilled = isAnyOf(
  api.endpoints.updateTask.matchFulfilled,
  api.endpoints.deleteTask.matchFulfilled,
  api.endpoints.addTaskParticipant.matchFulfilled,
  api.endpoints.removeTaskParticipant.matchFulfilled,
  api.endpoints.replaceTaskParticipant.matchFulfilled,
  api.endpoints.updateTaskJiraLinks.matchFulfilled,
  api.endpoints.upsertTaskAllocation.matchFulfilled,
  api.endpoints.upsertTaskAllocationBulk.matchFulfilled,
  api.endpoints.upsertTaskAllocationMulti.matchFulfilled,
  api.endpoints.upsertTaskLoad.matchFulfilled,
);

export const planningCacheListener = createListenerMiddleware();

planningCacheListener.startListening({
  matcher: taskMutationFulfilled,
  effect: (_action, { dispatch }) => {
    dispatch(api.util.invalidateTags([{ type: "PlanningItem", id: "LIST" }]));
  },
});
