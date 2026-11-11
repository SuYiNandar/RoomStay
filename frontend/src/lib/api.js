export class ApiError extends Error {
    status;
    constructor(status, message) {
        super(message);
        this.name = "ApiError";
        this.status = status;
    }
}
export const tokenStorageKey = "roomstay.token";
export function apiBase() {
    if (typeof window !== "undefined") {
        return "";
    }
    return process.env.INTERNAL_API_URL || process.env.NEXT_PUBLIC_API_URL || "https://roomstay-rcxc.onrender.com";
}
export function authToken() {
    if (typeof window === "undefined")
        return null;
    return window.localStorage.getItem(tokenStorageKey);
}
export function storeAuthToken(token) {
    if (typeof window === "undefined")
        return;
    if (token)
        window.localStorage.setItem(tokenStorageKey, token);
    else
        window.localStorage.removeItem(tokenStorageKey);
}
export async function api(path, init = {}) {
    const headers = new Headers(init.headers);
    const token = authToken();
    if (token)
        headers.set("authorization", `Bearer ${token}`);
    if (init.body && !(init.body instanceof FormData) && !headers.has("content-type")) {
        headers.set("content-type", "application/json");
    }
    const response = await fetch(`${apiBase()}${path}`, { ...init, cache: "no-store", headers });
    const text = await response.text();
    const data = text ? JSON.parse(text) : {};
    if (!response.ok)
        throw new ApiError(response.status, data.error ?? "Request failed.");
    return data;
}

export async function apiBlob(path, init = {}) {
    if (!path?.startsWith("/api/")) throw new Error("Invalid private file URL.");
    const token = authToken();
    const response = await fetch(`${apiBase()}${path}`, { ...init, cache: "no-store", headers: token ? { authorization: `Bearer ${token}` } : {} });
    if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new ApiError(response.status, data.error || "File could not be loaded.");
    }
    return response.blob();
}
export function publicImageUrl(src) {
    return src?.startsWith("/uploads/listings/") ? `${apiBase()}${src}` : src;
}
