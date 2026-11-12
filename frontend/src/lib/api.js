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
function sessionStore() {
    if (typeof window === "undefined")
        return null;
    try {
        return window.sessionStorage ?? null;
    }
    catch {
        return null;
    }
}
function localStore() {
    if (typeof window === "undefined")
        return null;
    try {
        return window.localStorage ?? null;
    }
    catch {
        return null;
    }
}
export function authToken() {
    try {
        const session = sessionStore();
        if (!session)
            return localStore()?.getItem(tokenStorageKey) ?? null;
        const sessionToken = session.getItem(tokenStorageKey);
        if (sessionToken)
            return sessionToken;
        const local = localStore();
        const legacyToken = local?.getItem(tokenStorageKey) ?? null;
        if (!legacyToken)
            return null;
        session.setItem(tokenStorageKey, legacyToken);
        local?.removeItem(tokenStorageKey);
        return legacyToken;
    }
    catch {
        return null;
    }
}
export function storeAuthToken(token) {
    const session = sessionStore();
    if (session) {
        try {
            if (token)
                session.setItem(tokenStorageKey, token);
            else
                session.removeItem(tokenStorageKey);
            localStore()?.removeItem(tokenStorageKey);
        }
        catch {
            // A browser may expose storage but reject writes.
        }
        return;
    }
    const local = localStore();
    if (!local)
        return;
    try {
        if (token)
            local.setItem(tokenStorageKey, token);
        else
            local.removeItem(tokenStorageKey);
    }
    catch {
        // A browser may expose storage but reject writes.
    }
}
export async function api(path, init = {}) {
    const headers = new Headers(init.headers);
    const token = authToken();
    if (token)
        headers.set("authorization", `Bearer ${token}`);
    if (init.body && !(init.body instanceof FormData) && !headers.has("content-type")) {
        headers.set("content-type", "application/json");
    }
    const response = await fetch(`${apiBase()}${path}`, { ...init, cache: "no-store", credentials: "omit", headers });
    const text = await response.text();
    const data = text ? JSON.parse(text) : {};
    if (!response.ok)
        throw new ApiError(response.status, data.error ?? "Request failed.");
    return data;
}

export async function apiBlob(path, init = {}) {
    if (!path?.startsWith("/api/")) throw new Error("Invalid private file URL.");
    const token = authToken();
    const response = await fetch(`${apiBase()}${path}`, { ...init, cache: "no-store", credentials: "omit", headers: token ? { authorization: `Bearer ${token}` } : {} });
    if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new ApiError(response.status, data.error || "File could not be loaded.");
    }
    return response.blob();
}
export function publicImageUrl(src) {
    return src?.startsWith("/uploads/listings/") ? `${apiBase()}${src}` : src;
}
