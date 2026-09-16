function resolveApiUrl(): string {
  if (typeof window !== "undefined") {
    const host = window.location.hostname;
    const isLocal = host === "localhost" || host === "127.0.0.1" || host === "[::1]";

    // Hosted NightSafe uses the Cloudflare Pages /api/* Function proxy. This
    // keeps the session cookie first-party and also works on future custom
    // Pages domains without another frontend rebuild.
    if (!isLocal) return "";
  }

  return import.meta.env.VITE_API_URL ?? "http://localhost:8787";
}

export const API_URL = resolveApiUrl();

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const isFormData = init?.body instanceof FormData;

  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    credentials: "include", // send/receive the HTTP-only session cookie
    headers: isFormData
      ? init?.headers // let the browser set Content-Type (multipart boundary)
      : { "Content-Type": "application/json", ...init?.headers },
  });

  const data = await res.json().catch(() => null);

  if (!res.ok) {
    throw new ApiError(data?.error ?? "Something went wrong.", res.status);
  }

  return data as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path, { method: "GET" }),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "POST", body: body ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PATCH", body: body ? JSON.stringify(body) : undefined }),
  postForm: <T>(path: string, form: FormData) => request<T>(path, { method: "POST", body: form }),
  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),
};
