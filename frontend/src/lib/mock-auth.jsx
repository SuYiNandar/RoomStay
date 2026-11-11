"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api, ApiError, authToken, storeAuthToken, tokenStorageKey } from "@/lib/api";
import { refreshLiveSession } from "@/lib/live";
import { setLiveEnabled } from "@/lib/live-store";
import { findMockPartnerCapability, mockPartnerApplicationsChangedEvent } from "@/lib/mock-partner-application";
const actionStorageKey = "roomstay.pendingAction";
const MockAuthContext = createContext(null);
function readStoredValue(key) {
    if (typeof window === "undefined")
        return null;
    try {
        const stored = window.localStorage.getItem(key);
        return stored ? JSON.parse(stored) : null;
    }
    catch {
        return null;
    }
}
function toSessionUser(user) {
    return {
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        phone: user.phone ?? undefined,
        role: user.role,
        isPartner: user.isPartner === true,
    };
}
export function MockAuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [pendingAction, setPendingActionState] = useState(null);
    const [partnerApplication, setPartnerApplication] = useState(null);
    const [isReady, setIsReady] = useState(false);
    const applySession = useCallback(async (sessionUser) => {
        const committed = await refreshLiveSession(sessionUser.id, sessionUser.role, sessionUser.isPartner === true);
        if (!committed) return;
        const capability = findMockPartnerCapability(sessionUser.id);
        const nextUser = { ...sessionUser, isPartner: capability?.status === "APPROVED" };
        setUser(nextUser);
        setPartnerApplication(capability);
    }, []);
    useEffect(() => {
        let active = true;
        async function restore() {
            setPendingActionState(readStoredValue(actionStorageKey));
            if (!authToken()) {
                if (active)
                    setIsReady(true);
                return;
            }
            try {
                const me = await api("/api/me");
                if (!active)
                    return;
                await applySession(toSessionUser(me.user));
            }
            catch (error) {
                if (error instanceof ApiError && error.status === 401) storeAuthToken(null);
                setLiveEnabled(false);
            }
            finally {
                if (active)
                    setIsReady(true);
            }
        }
        void restore();
        function syncCapability() {
            setUser(current => {
                if (!current) return current;
                const approved = findMockPartnerCapability(current.id)?.status === "APPROVED";
                return current.isPartner === approved ? current : { ...current, isPartner: approved };
            });
            setPartnerApplication((current) => {
                const stored = current?.userId ? findMockPartnerCapability(current.userId) : null;
                return stored ?? current;
            });
        }
        window.addEventListener(mockPartnerApplicationsChangedEvent, syncCapability);
        return () => {
            active = false;
            window.removeEventListener(mockPartnerApplicationsChangedEvent, syncCapability);
        };
    }, [applySession]);
    useEffect(() => {
        if (!isReady || !user) return;
        let active = true;
        let refreshing = false;
        async function refresh() {
            if (refreshing || document.visibilityState === "hidden") return;
            refreshing = true;
            const token = authToken();
            try {
                const me = await api("/api/me");
                if (!active || token !== authToken()) return;
                const next = toSessionUser(me.user);
                const committed = await refreshLiveSession(next.id, next.role, next.isPartner, { reset: false });
                if (!active || !committed || token !== authToken()) return;
                setUser(current => JSON.stringify(current) === JSON.stringify(next) ? current : next);
                const capability = findMockPartnerCapability(next.id);
                setPartnerApplication(current => JSON.stringify(current) === JSON.stringify(capability) ? current : capability);
            } catch (error) {
                if (active && token === authToken() && error instanceof ApiError && error.status === 401) {
                    storeAuthToken(null); setLiveEnabled(false); setUser(null); setPartnerApplication(null);
                }
            } finally { refreshing = false; }
        }
        const interval = window.setInterval(refresh, 15000);
        window.addEventListener("focus", refresh);
        document.addEventListener("visibilitychange", refresh);
        return () => { active = false; window.clearInterval(interval); window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", refresh); };
    }, [isReady, user]);
    useEffect(() => {
        function changedSession(event) { if (event.key === tokenStorageKey) window.location.reload(); }
        window.addEventListener("storage", changedSession);
        return () => window.removeEventListener("storage", changedSession);
    }, []);
    const login = useCallback(async (credentials) => {
        const result = await api("/api/auth/login", {
            method: "POST",
            body: JSON.stringify(credentials),
        });
        storeAuthToken(result.token);
        const sessionUser = toSessionUser(result.user);
        await applySession(sessionUser);
        return sessionUser;
    }, [applySession]);
    const register = useCallback(async (input) => {
        const result = await api("/api/auth/register", {
            method: "POST",
            body: JSON.stringify(input),
        });
        storeAuthToken(result.token);
        await applySession(toSessionUser(result.user));
    }, [applySession]);
    const logout = useCallback(() => {
        void api("/api/auth/logout", { method: "POST" }).catch(() => undefined);
        storeAuthToken(null);
        setLiveEnabled(false);
        setUser(null);
        setPartnerApplication(null);
        setPendingActionState(null);
        window.localStorage.removeItem(actionStorageKey);
    }, []);
    const grantPartnerAccess = useCallback((userId) => {
        setUser((current) => current?.id === userId ? { ...current, isPartner: true } : current);
    }, []);
    const setPendingAction = useCallback((action) => {
        setPendingActionState(action);
        window.localStorage.setItem(actionStorageKey, JSON.stringify(action));
    }, []);
    const clearPendingAction = useCallback(() => {
        setPendingActionState(null);
        window.localStorage.removeItem(actionStorageKey);
    }, []);
    const value = useMemo(() => ({
        user,
        pendingAction,
        partnerApplication,
        isReady,
        login,
        register,
        logout,
        grantPartnerAccess,
        setPendingAction,
        clearPendingAction,
    }), [clearPendingAction, grantPartnerAccess, isReady, login, logout, pendingAction, partnerApplication, register, setPendingAction, user]);
    return (<MockAuthContext.Provider value={value}>
      {children}
    </MockAuthContext.Provider>);
}
export function useMockAuth() {
    const context = useContext(MockAuthContext);
    if (!context)
        throw new Error("useMockAuth must be used inside MockAuthProvider");
    return context;
}
export function safeReturnTo(value) {
    if (!value || !value.startsWith("/") || value.startsWith("//"))
        return "/";
    return value;
}
