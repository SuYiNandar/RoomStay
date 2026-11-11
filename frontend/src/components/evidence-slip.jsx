"use client";
import Image from "next/image";
import { useEffect, useState } from "react";
import { apiBlob } from "@/lib/api";
import { useMockAuth } from "@/lib/mock-auth";

export function EvidenceSlip({ evidence }) {
    const { user } = useMockAuth();
    const [preview, setPreview] = useState(null);
    const [error, setError] = useState("");
    const url = evidence?.fileUrl;
    useEffect(() => {
        if (!url || !user) return;
        const controller = new AbortController();
        let objectUrl;
        apiBlob(url, { signal: controller.signal }).then(blob => {
            if (controller.signal.aborted) return;
            objectUrl = URL.createObjectURL(blob);
            setPreview({ url, userId: user.id, src: objectUrl }); setError("");
        }).catch(caught => { if (!controller.signal.aborted) setError(caught.message || "The slip could not be loaded."); });
        return () => { controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
    }, [url, user]);
    if (!evidence) return null;
    const src = preview?.url === url && preview.userId === user?.id ? preview.src : null;
    return <figure className="overflow-hidden rounded-2xl border border-line bg-white shadow-sm shadow-ink/5">
        {src ? <Image unoptimized src={src} width={1200} height={900} alt={`Deposit slip ${evidence.fileName}`} className="max-h-96 w-full bg-[#f7f4ee] object-contain"/> : <p className="p-4 text-sm leading-6 text-ink-secondary">{error || (url ? "Loading deposit slip..." : `The photo for ${evidence.fileName} is not available.`)}</p>}
        <figcaption className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-4 py-3 text-sm text-ink-secondary"><span className="font-medium text-ink">{evidence.fileName}</span>{evidence.note && <span>{evidence.note}</span>}</figcaption>
    </figure>;
}
