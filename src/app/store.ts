import { configureStore } from "@reduxjs/toolkit";
import { api } from "./api";
import uiReducer from "./uiSlice";

export const store = configureStore({
  reducer: { [api.reducerPath]: api.reducer, ui: uiReducer },
  middleware: (gD) => gD().concat(api.middleware),
  devTools: true,
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
