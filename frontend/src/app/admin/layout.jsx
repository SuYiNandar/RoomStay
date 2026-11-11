"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMockAuth } from "@/lib/mock-auth";

export default function AdminLayout({ children }) {
    const { user, isReady } = useMockAuth();
    const pathname = usePathname();
    if (!isReady) return <p className="p-6 text-sm text-ink-secondary">Loading Admin access...</p>;
    if (!user || user.role !== "ADMIN") {
        return <main className="mx-auto max-w-2xl p-6">
            <h1 className="text-2xl font-semibold">Admin access required</h1>
            <Link href={user ? "/" : `/login?returnTo=${encodeURIComponent(pathname)}`} className="mt-5 inline-flex min-h-11 items-center text-primary">
                {user ? "Back to RoomStay" : "Log In"}
            </Link>
        </main>;
    }
    return children;
}
