"use client";
import { useEffect, useId, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ApiError } from "@/lib/api";
import { safeReturnTo, useMockAuth } from "@/lib/mock-auth";
const fieldClass = "mt-2 h-11 w-full rounded-lg border border-line bg-white px-3 text-sm text-ink outline-none placeholder:text-ink-secondary focus:border-primary focus:ring-2 focus:ring-primary/15";
const errorClass = "mt-1.5 block text-xs text-alert";
const passwordRules = [
    { key: "length", label: "Minimum 8 characters", test: (value) => value.length >= 8 },
    { key: "uppercase", label: "At least 1 uppercase letter", test: (value) => /[A-Z]/.test(value) },
    { key: "lowercase", label: "At least 1 lowercase letter", test: (value) => /[a-z]/.test(value) },
    { key: "number", label: "At least 1 number", test: (value) => /\d/.test(value) },
];
function isValidEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}
function PasswordInput({ id, label, value, onChange, error, }) {
    const [visible, setVisible] = useState(false);
    const errorId = `${id}-error`;
    return (<label className="block text-sm font-medium text-ink">
      {label}
      <span className="mt-2 flex h-11 rounded-lg border border-line bg-white focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/15">
        <input id={id} type={visible ? "text" : "password"} value={value} onChange={(event) => onChange(event.target.value)} required aria-invalid={Boolean(error)} aria-describedby={error ? errorId : undefined} className="min-w-0 flex-1 rounded-lg bg-transparent px-3 text-sm text-ink outline-none"/>
        <button type="button" onClick={() => setVisible((current) => !current)} className="min-w-16 rounded-lg px-3 text-xs font-semibold text-primary hover:bg-primary-tint" aria-label={visible ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}>
          {visible ? "Hide" : "Show"}
        </button>
      </span>
      {error && <span id={errorId} className={errorClass}>{error}</span>}
    </label>);
}
function redirectTarget(returnTo, pendingReturnTo) {
    return safeReturnTo(returnTo || pendingReturnTo || "/");
}
function hasRequiredPassword(password) {
    return passwordRules.every((rule) => rule.test(password));
}
function PasswordRequirements({ password }) {
    return (<ul className="mt-2 grid gap-1 text-xs" aria-label="Password requirements">
      {passwordRules.map((rule) => {
            const passed = rule.test(password);
            return (<li key={rule.key} className={passed ? "text-primary" : "text-ink-secondary"}>
            <span aria-hidden="true">{passed ? "✓" : "•"}</span> {rule.label}
          </li>);
        })}
    </ul>);
}
const accountTypes = [
    { id: "renter", label: "Renter", home: "/" },
    { id: "partner", label: "Partner", home: "/partner" },
    { id: "admin", label: "Admin", home: "/admin" },
];
function accountMatches(user, accountType) {
    if (accountType === "admin")
        return user?.role === "ADMIN";
    if (accountType === "partner")
        return user?.isPartner === true;
    return user?.role !== "ADMIN" && user?.isPartner !== true;
}
export function LoginForm({ returnTo }) {
    const router = useRouter();
    const { login, logout, pendingAction } = useMockAuth();
    const emailId = useId();
    const passwordId = useId();
    const [accountType, setAccountType] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [errors, setErrors] = useState({});
    const [submitting, setSubmitting] = useState(false);
    const chosenAccount = accountTypes.find((account) => account.id === accountType);
    useEffect(() => {
        const overlay = document.querySelector('main section[aria-label="Welcome to RoomStay"] .bg-gradient-to-br');
        if (!overlay)
            return undefined;
        const previousBackgroundImage = overlay.style.backgroundImage;
        overlay.style.backgroundImage = "linear-gradient(to bottom right, rgb(23 16 68 / 72%), rgb(72 43 244 / 56%), rgb(72 43 244 / 30%))";
        return () => {
            overlay.style.backgroundImage = previousBackgroundImage;
        };
    }, []);
    function chooseAccount(nextType) {
        setAccountType(nextType);
        setErrors({});
    }
    async function submit(event) {
        event.preventDefault();
        const nextErrors = {};
        if (!chosenAccount)
            nextErrors.accountType = "Choose Renter, Partner, or Admin first.";
        if (!email.trim())
            nextErrors.email = "Email is required.";
        else if (!isValidEmail(email))
            nextErrors.email = "Enter a valid email address.";
        if (!password)
            nextErrors.password = "Password is required.";
        setErrors(nextErrors);
        if (Object.keys(nextErrors).length > 0)
            return;
        setSubmitting(true);
        try {
            const signedIn = await login({ email: email.trim(), password });
            if (!accountMatches(signedIn, chosenAccount.id)) {
                logout();
                setErrors({ password: `This email is not a ${chosenAccount.label.toLowerCase()} account.` });
                setSubmitting(false);
                return;
            }
            router.push(returnTo || pendingAction?.returnTo ? redirectTarget(returnTo, pendingAction?.returnTo) : chosenAccount.home);
        }
        catch (error) {
            setErrors({ password: error instanceof ApiError ? error.message : "Login failed. Check that the API is running." });
            setSubmitting(false);
        }
    }
    return (<form onSubmit={submit} noValidate className="grid gap-5">
      <div>
        <p id="account-type-label" className="text-sm font-medium text-ink">Sign in as</p>
        <div role="group" aria-labelledby="account-type-label" className="mt-2 grid grid-cols-3 gap-2">
          {accountTypes.map((account) => {
            const selected = accountType === account.id;
            return (<button key={account.id} type="button" aria-pressed={selected} disabled={submitting} onClick={() => chooseAccount(account.id)} className={`inline-flex min-h-11 items-center justify-center rounded-lg border px-3 text-sm font-semibold btn-secondary ${selected ? "border-primary bg-primary-tint text-primary" : "border-line bg-white text-ink"}`}>
              {account.label}
            </button>);
        })}
        </div>
        {errors.accountType && <span className={errorClass}>{errors.accountType}</span>}
      </div>

      {chosenAccount && (<>
        <label className="block text-sm font-medium text-ink">
          Email
          <input id={emailId} type="email" value={email} onChange={(event) => setEmail(event.target.value)} required autoComplete="email" placeholder="you@example.com" aria-invalid={Boolean(errors.email)} aria-describedby={errors.email ? `${emailId}-error` : undefined} className={fieldClass}/>
          {errors.email && <span id={`${emailId}-error`} className={errorClass}>{errors.email}</span>}
        </label>

        <PasswordInput id={passwordId} label="Password" value={password} onChange={setPassword} error={errors.password}/>

        <div className="-mt-2 flex justify-end text-sm">
          <Link href="/login" className="rounded-sm font-medium text-primary hover:underline">
            Forgot password?
          </Link>
        </div>

        <button type="submit" disabled={submitting} className="inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-primary px-4 text-sm font-semibold text-white shadow-sm hover:bg-primary/95 btn-primary disabled:opacity-70">
          {submitting ? "Logging in..." : "Log in"}
        </button>
      </>)}
    </form>);
}
export function RegisterForm({ returnTo }) {
    const router = useRouter();
    const { register, pendingAction } = useMockAuth();
    const fullNameId = useId();
    const emailId = useId();
    const passwordId = useId();
    const confirmPasswordId = useId();
    const termsId = useId();
    const [fullName, setFullName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [termsAccepted, setTermsAccepted] = useState(false);
    const [errors, setErrors] = useState({});
    const [message, setMessage] = useState("");
    async function submit(event) {
        event.preventDefault();
        const nextErrors = {};
        if (!fullName.trim())
            nextErrors.fullName = "Full name is required.";
        if (!email.trim())
            nextErrors.email = "Email is required.";
        else if (!isValidEmail(email))
            nextErrors.email = "Enter a valid email address.";
        if (!password)
            nextErrors.password = "Password is required.";
        else if (!hasRequiredPassword(password))
            nextErrors.password = "Password must meet all requirements.";
        if (!confirmPassword)
            nextErrors.confirmPassword = "Confirm your password.";
        else if (password !== confirmPassword)
            nextErrors.confirmPassword = "Passwords must match.";
        if (!termsAccepted)
            nextErrors.terms = "Please agree to the Terms of Service and Privacy Policy.";
        setErrors(nextErrors);
        setMessage("");
        if (Object.keys(nextErrors).length > 0)
            return;
        try {
            await register({
                fullName: fullName.trim(),
                email: email.trim(),
                password,
            });
            setMessage("Account created.");
            router.push(redirectTarget(returnTo, pendingAction?.returnTo));
        }
        catch (error) {
            setErrors({ email: error instanceof ApiError ? error.message : "Registration failed. Check that the API is running." });
        }
    }
    return (<form onSubmit={submit} noValidate className="grid gap-4">
      <label className="block text-sm font-medium text-ink">
        Full name
        <input id={fullNameId} type="text" value={fullName} onChange={(event) => setFullName(event.target.value)} required autoComplete="name" placeholder="Your full name" aria-invalid={Boolean(errors.fullName)} aria-describedby={errors.fullName ? `${fullNameId}-error` : undefined} className={fieldClass}/>
        {errors.fullName && <span id={`${fullNameId}-error`} className={errorClass}>{errors.fullName}</span>}
      </label>

      <label className="block text-sm font-medium text-ink">
        Email
        <input id={emailId} type="email" value={email} onChange={(event) => setEmail(event.target.value)} required autoComplete="email" placeholder="you@example.com" aria-invalid={Boolean(errors.email)} aria-describedby={errors.email ? `${emailId}-error` : undefined} className={fieldClass}/>
        {errors.email && <span id={`${emailId}-error`} className={errorClass}>{errors.email}</span>}
      </label>

      <div>
        <PasswordInput id={passwordId} label="Password" value={password} onChange={setPassword} error={errors.password}/>
        <PasswordRequirements password={password}/>
      </div>

      <PasswordInput id={confirmPasswordId} label="Confirm Password" value={confirmPassword} onChange={setConfirmPassword} error={errors.confirmPassword}/>

      <label className="flex items-start gap-2 text-sm text-ink-secondary">
        <input id={termsId} type="checkbox" checked={termsAccepted} onChange={(event) => setTermsAccepted(event.target.checked)} aria-invalid={Boolean(errors.terms)} aria-describedby={errors.terms ? `${termsId}-error` : undefined} className="mt-1 size-4 shrink-0 accent-primary"/>
        <span>
          I agree to the{" "}
          <Link href="/register" className="font-medium text-primary">Terms of Service</Link>
          {" "}and{" "}
          <Link href="/register" className="font-medium text-primary">Privacy Policy</Link>
          .
          {errors.terms && <span id={`${termsId}-error`} className={errorClass}>{errors.terms}</span>}
        </span>
      </label>

      <button type="submit" className="mt-1 min-h-11 rounded-lg bg-primary px-4 text-sm font-semibold text-white shadow-sm hover:bg-primary/95 btn-primary">
        Sign Up
      </button>

      {message && <p role="status" className="rounded-lg bg-primary-tint px-3 py-2 text-sm text-primary">{message}</p>}
    </form>);
}
