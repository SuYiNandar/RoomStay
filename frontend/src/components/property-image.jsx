"use client";
import Image from "next/image";
import { useState } from "react";

export function PropertyImage({ src, alt, fill, className, ...props }) {
    const [failedSrc, setFailedSrc] = useState(null);
    if (!src || failedSrc === src) {
        return <span role="img" aria-label="Property photo unavailable" className={`${fill ? "absolute inset-0" : "block"} flex items-center justify-center bg-photo p-3 text-center text-sm text-ink-secondary`}>Photo unavailable</span>;
    }
    return <Image {...props} src={src} alt={alt} fill={fill} className={className} onError={() => setFailedSrc(src)}/>;
}
