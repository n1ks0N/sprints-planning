import { configureStore } from "@reduxjs/toolkit";
import { api } from "./api";
import uiReducer, { persistUIState } from "./uiSlice";
import undoReducer from "./undoSlice";
import historyReducer from "./historySlice";
import { historyMiddleware } from "./historyMiddleware";

export const store = configureStore({
  reducer: {
    [api.reducerPath]: api.reducer,
    ui: uiReducer,
    undo: undoReducer,
    history: historyReducer,
  },
  middleware: (gDM) => gDM().concat(api.middleware, historyMiddleware),
});

// Сохранение UI-фильтров в localStorage
let lastPersistedUI = store.getState().ui;
let lastHistoryUser = store.getState().history.currentUser;

store.subscribe(() => {
  const nextUI = store.getState().ui;
  const nextHistoryUser = store.getState().history.currentUser;
  if (nextUI !== lastPersistedUI) {
    lastPersistedUI = nextUI;
    persistUIState(nextUI);
  }
  if (nextHistoryUser !== lastHistoryUser) {
    lastHistoryUser = nextHistoryUser;
    if (typeof localStorage !== "undefined") {
      try {
        localStorage.setItem("history-user", nextHistoryUser);
      } catch (e) {
        console.warn("Failed to persist history user", e);
      }
    }
  }
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
