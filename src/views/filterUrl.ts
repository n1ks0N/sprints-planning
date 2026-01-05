export function shallowArrayEqual<T>(a: readonly T[], b: readonly T[]) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

export function normalizeStringArray(values: string[]) {
  return values.map((v) => v.trim()).filter(Boolean);
}

export function parseStringParam(
  params: URLSearchParams,
  key: string,
  defaultValue = ""
) {
  const raw = params.get(key);
  if (raw === null) return defaultValue;
  const normalized = raw.trim();
  return normalized.length ? normalized : defaultValue;
}

export function parseStringArrayParam(params: URLSearchParams, key: string) {
  const raw = params.get(key);
  if (!raw) return [] as string[];
  return Array.from(new Set(normalizeStringArray(raw.split(","))));
}

export function parseNumberArrayParam(params: URLSearchParams, key: string) {
  return parseStringArrayParam(params, key)
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value));
}

export function setStringParam(
  params: URLSearchParams,
  key: string,
  value: string
) {
  const normalized = value.trim();
  if (!normalized) {
    params.delete(key);
  } else {
    params.set(key, normalized);
  }
}

export function setStringArrayParam(
  params: URLSearchParams,
  key: string,
  values: string[]
) {
  const normalized = Array.from(new Set(normalizeStringArray(values)));
  if (normalized.length === 0) {
    params.delete(key);
  } else {
    params.set(key, normalized.join(","));
  }
}

export function setNumberArrayParam(
  params: URLSearchParams,
  key: string,
  values: number[]
) {
  const normalized = Array.from(
    new Set(values.filter((value) => Number.isFinite(value)))
  );
  if (normalized.length === 0) {
    params.delete(key);
  } else {
    params.set(key, normalized.join(","));
  }
}

export function hasAnyParams(params: URLSearchParams, keys: string[]) {
  return keys.some((key) => params.has(key));
}
