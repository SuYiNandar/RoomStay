"use client";
import { useState } from "react";
import { apiBlob } from "@/lib/api";

export function PrivateFileLink({ url, name, children }) {
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);
    async function download() {
        setLoading(true); setError("");
        try {
            const blob = await apiBlob(url);
            const href = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = href; link.download = name || "document";
            link.click();
            window.setTimeout(() => URL.revokeObjectURL(href), 1000);
        } catch (caught) { setError(caught.message || "Document could not be downloaded."); }
        finally { setLoading(false); }
    }
    return <span><button type="button" disabled={loading} onClick={download} className="min-h-11 text-primary underline">{loading ? "Downloading..." : children || name}</button>{error && <span role="alert" className="block text-sm text-alert">{error}</span>}</span>;
}
