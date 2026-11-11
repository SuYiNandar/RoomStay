export const MINIMUM_DEPOSIT_AMOUNT = 1000;
export const DEPOSIT_AMOUNT_ERROR = "Deposit amount must be at least ฿1,000.";
export const PAYMENT_DEADLINE_ERROR = "Payment deadline must be a future date and time.";

const LOCAL_DATE_TIME_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?$/;
const OFFSET_DATE_TIME_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:\d{2})$/;

export function parseDepositAmount(value) {
    if (typeof value === "number") return Number.isFinite(value) ? value : null;
    if (typeof value === "string" && value.trim() !== "") {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
}

export function depositAmountError(value) {
    const amount = parseDepositAmount(value);
    return amount !== null && amount >= MINIMUM_DEPOSIT_AMOUNT ? null : DEPOSIT_AMOUNT_ERROR;
}

export function parseDateTimeLocal(value) {
    if (typeof value !== "string") return null;
    const text = value.trim();
    const match = LOCAL_DATE_TIME_PATTERN.exec(text);
    if (match) {
        const year = Number(match[1]);
        const month = Number(match[2]);
        const day = Number(match[3]);
        const hour = Number(match[4]);
        const minute = Number(match[5]);
        const second = Number(match[6] ?? "0");
        const millisecond = Number((match[7] ?? "").slice(0, 3).padEnd(3, "0") || "0");
        if (year < 1 || month < 1 || month > 12 || day < 1 || day > 31
            || hour > 23 || minute > 59 || second > 59) {
            return null;
        }
        const date = new Date(year, month - 1, day, hour, minute, second, millisecond);
        const roundTrip = date.getFullYear() === year
            && date.getMonth() === month - 1
            && date.getDate() === day
            && date.getHours() === hour
            && date.getMinutes() === minute
            && date.getSeconds() === second
            && date.getMilliseconds() === millisecond;
        return roundTrip ? date : null;
    }
    if (!OFFSET_DATE_TIME_PATTERN.test(text)) return null;
    const date = new Date(text);
    return Number.isNaN(date.getTime()) ? null : date;
}

function nowTimestamp(now) {
    if (now instanceof Date) return now.getTime();
    if (typeof now === "number") return now;
    if (typeof now === "string") return new Date(now).getTime();
    return Date.now();
}

export function paymentDeadlineError(value, now = new Date()) {
    const deadline = parseDateTimeLocal(value);
    return deadline && deadline.getTime() > nowTimestamp(now) ? null : PAYMENT_DEADLINE_ERROR;
}

export function validateBookingApproval({ depositAmount, paymentDeadline, now = new Date() } = {}) {
    const amount = parseDepositAmount(depositAmount);
    const deadline = parseDateTimeLocal(paymentDeadline);
    const errors = {};
    if (amount === null || amount < MINIMUM_DEPOSIT_AMOUNT) errors.depositAmount = DEPOSIT_AMOUNT_ERROR;
    if (!deadline || deadline.getTime() <= nowTimestamp(now)) errors.paymentDeadline = PAYMENT_DEADLINE_ERROR;
    return {
        valid: Object.keys(errors).length === 0,
        errors,
        depositAmount: amount,
        paymentDeadline: deadline ? deadline.toISOString() : null,
    };
}
