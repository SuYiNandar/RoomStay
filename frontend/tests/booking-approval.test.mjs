import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";

const requireDependency = createRequire(import.meta.url);

function load(file) {
    const code = ts.transpileModule(readFileSync(new URL(file, import.meta.url), "utf8"), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021 },
    }).outputText;
    const loaded = { exports: {} };
    vm.runInNewContext(code, { module: loaded, exports: loaded.exports, require: requireDependency }, { filename: file });
    return loaded.exports;
}

const {
    DEPOSIT_AMOUNT_ERROR,
    DEPOSIT_AMOUNT_INCREMENT,
    DEPOSIT_INCREMENT_ERROR,
    PAYMENT_DEADLINE_ERROR,
    depositAmountError,
    parseDateTimeLocal,
    parseDepositAmount,
    paymentDeadlineError,
    validateBookingApproval,
} = load("../src/lib/booking-approval.js");

const now = new Date(2026, 10, 11, 12, 0, 0);

test("deposit regression: 999 is rejected; 1000, 2000 and 5000 are accepted", () => {
    assert.equal(DEPOSIT_AMOUNT_INCREMENT, 1000);
    assert.equal(depositAmountError(999), DEPOSIT_AMOUNT_ERROR);
    assert.equal(depositAmountError(1000), null);
    assert.equal(depositAmountError(2000), null);
    assert.equal(depositAmountError(5000), null);
    assert.equal(depositAmountError("1000"), null);
    assert.equal(parseDepositAmount("2000"), 2000);
    assert.equal(parseDepositAmount("3000"), 3000);
});

test("deposit regression: non-multiples of 1000 are rejected", () => {
    assert.equal(depositAmountError(1500), DEPOSIT_INCREMENT_ERROR);
    assert.equal(depositAmountError(2500), DEPOSIT_INCREMENT_ERROR);
    assert.equal(depositAmountError(1000.5), DEPOSIT_INCREMENT_ERROR);
    assert.equal(depositAmountError("1500"), DEPOSIT_INCREMENT_ERROR);
});

test("deposit rejects zero, negative, empty and non-numeric values", () => {
    for (const value of [0, -1, -1000, 19, "", "   ", "not-a-number", null, undefined, true, {}]) {
        assert.equal(depositAmountError(value), DEPOSIT_AMOUNT_ERROR, `expected ${String(value)} to fail`);
    }
    for (const value of ["", "   ", "not-a-number", null, undefined, true, {}]) {
        assert.equal(parseDepositAmount(value), null);
    }
});

test("deadline regression: a future local datetime is accepted and converted to an ISO timestamp", () => {
    const value = "2026-11-20T21:42";
    const parsed = parseDateTimeLocal(value);
    assert.equal(Object.prototype.toString.call(parsed), "[object Date]");
    assert.equal(parsed.getFullYear(), 2026);
    assert.equal(parsed.getMonth(), 10);
    assert.equal(parsed.getDate(), 20);
    assert.equal(parsed.getHours(), 21);
    assert.equal(parsed.getMinutes(), 42);
    assert.equal(paymentDeadlineError(value, now), null);
    assert.equal(parsed.toISOString(), new Date(2026, 10, 20, 21, 42).toISOString());
});

test("deadline rejects past, current and invalid datetimes", () => {
    for (const value of [
        "2026-11-10T21:42",
        "2026-11-11T12:00",
        "2026-02-30T10:00",
        "2026-13-01T10:00",
        "20/11/2026 21:42",
        "",
        "not-a-date",
    ]) {
        assert.equal(paymentDeadlineError(value, now), PAYMENT_DEADLINE_ERROR, `expected ${value} to fail`);
    }
});

test("valid deposit and valid future deadline allow approval", () => {
    for (const depositAmount of [1000, 2000, 5000]) {
        const decision = validateBookingApproval({ depositAmount, paymentDeadline: "2026-11-20T21:42", now });
        assert.equal(decision.valid, true);
        assert.deepEqual({ ...decision.errors }, {});
        assert.equal(decision.depositAmount, depositAmount);
        assert.equal(decision.paymentDeadline, new Date(2026, 10, 20, 21, 42).toISOString());
    }
});

test("approval is blocked unless both fields are valid", () => {
    const belowMinimum = validateBookingApproval({ depositAmount: 999, paymentDeadline: "2026-11-20T21:42", now });
    assert.equal(belowMinimum.valid, false);
    assert.equal(belowMinimum.errors.depositAmount, DEPOSIT_AMOUNT_ERROR);
    assert.equal(belowMinimum.errors.paymentDeadline, undefined);

    const wrongIncrement = validateBookingApproval({ depositAmount: 1500, paymentDeadline: "2026-11-20T21:42", now });
    assert.equal(wrongIncrement.valid, false);
    assert.equal(wrongIncrement.errors.depositAmount, DEPOSIT_INCREMENT_ERROR);
    assert.equal(wrongIncrement.errors.paymentDeadline, undefined);

    const pastDeadline = validateBookingApproval({ depositAmount: 1000, paymentDeadline: "2026-11-10T21:42", now });
    assert.equal(pastDeadline.valid, false);
    assert.equal(pastDeadline.errors.depositAmount, undefined);
    assert.equal(pastDeadline.errors.paymentDeadline, PAYMENT_DEADLINE_ERROR);

    const empty = validateBookingApproval({ depositAmount: "", paymentDeadline: "", now });
    assert.equal(empty.valid, false);
    assert.equal(empty.errors.depositAmount, DEPOSIT_AMOUNT_ERROR);
    assert.equal(empty.errors.paymentDeadline, PAYMENT_DEADLINE_ERROR);
});
