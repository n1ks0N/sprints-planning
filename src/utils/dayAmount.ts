export const DAY_AMOUNT_STEP = 0.5;

export const parseDayAmount = (value: unknown): number => {
  if (typeof value === "string") {
    return Number(value.replace(",", "."));
  }

  return Number(value);
};

export const normalizeDayAmount = (value: unknown): number => {
  const numeric = parseDayAmount(value);

  if (!Number.isFinite(numeric)) {
    return 0;
  }

  const rounded = Math.round(numeric / DAY_AMOUNT_STEP) * DAY_AMOUNT_STEP;

  return Math.max(0, Number(rounded.toFixed(1)));
};

export const formatDayAmount = (value: unknown): string => {
  const normalized = normalizeDayAmount(value);

  return Number.isInteger(normalized) ? String(normalized) : normalized.toFixed(1);
};

export const sanitizeDayAmountInput = (value: string): string => {
  const normalizedSeparator = value.replace(",", ".");
  const cleaned = normalizedSeparator.replace(/[^\d.]/g, "");
  const [integerPart, ...fractionParts] = cleaned.split(".");

  if (fractionParts.length === 0) {
    return integerPart;
  }

  return `${integerPart}.${fractionParts.join("").slice(0, 1)}`;
};