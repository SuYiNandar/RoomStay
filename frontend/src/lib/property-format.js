export function bedroomLabel(count) {
    return count === 0 ? "Studio" : `${count} Bedroom${count === 1 ? "" : "s"}`;
}
