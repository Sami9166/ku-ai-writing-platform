type ApiOptions = Omit<RequestInit, "body"> & { body?: unknown };

const configuredApiBase = typeof process !== "undefined" ? process.env.NEXT_PUBLIC_API_URL : undefined;
const browserApiBase =
  typeof window !== "undefined"
    ? window.location.protocol === "https:"
      ? ""
      : `${window.location.protocol}//${window.location.hostname}:4000`
    : "http://localhost:4000";
const apiBase = configuredApiBase ?? browserApiBase;

export async function apiFetch<T>(path: string, options: ApiOptions = {}): Promise<T | null> {
  try {
    const headers = new Headers(options.headers);
    if (options.body !== undefined) headers.set("Content-Type", "application/json");
    const response = await fetch(`${apiBase}${path}`, {
      ...options,
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
    if (!response.ok) return null;
    return await response.json() as T;
  } catch {
    // Spring 서버를 아직 실행하지 않은 상태에서도 기존 목업 UI는 계속 사용할 수 있습니다.
    return null;
  }
}

export { apiBase };
