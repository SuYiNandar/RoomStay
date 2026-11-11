"use client";
import Link from "next/link";
import { PartnerSuspensionNotice } from "@/components/partner-suspension-notice";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ApiError } from "@/lib/api";
import { liveSubmitPartnerApplication } from "@/lib/live-actions";
import { liveEnabled } from "@/lib/live-store";
import { useMockAuth } from "@/lib/mock-auth";
import { createMockPartnerApplicationId, findBlockingMockPartnerApplication, mockPartnerApplicationsChangedEvent, saveMockPartnerApplication, } from "@/lib/mock-partner-application";
const allowedExtensions = [".jpg", ".jpeg", ".png", ".pdf"];
const steps = ["Information", "Documents", "Review"];
function isAllowedApplicationFile(file) {
    const lowerName = file.name.toLowerCase();
    return allowedExtensions.some((extension) => lowerName.endsWith(extension));
}
function isValidEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}
export function PartnerApplicationForm() {
    const router = useRouter();
    const { user, isReady } = useMockAuth();
    const [blockingApplication, setBlockingApplication] = useState(undefined);
    const [step, setStep] = useState(1);
    const [fullName, setFullName] = useState("");
    const [email, setEmail] = useState("");
    const [phone, setPhone] = useState("");
    const [idDocument, setIdDocument] = useState(null);
    const [ownershipDocument, setOwnershipDocument] = useState(null);
    const [note, setNote] = useState("");
    const [confirmed, setConfirmed] = useState(false);
    const [errors, setErrors] = useState({});
    useEffect(() => {
        if (!isReady)
            return undefined;
        if (!user) {
            router.replace(`/login?returnTo=${encodeURIComponent("/become-a-partner")}`);
            return undefined;
        }
        const currentUser = user;
        function loadApplication() {
            setFullName(currentUser.fullName);
            setEmail(currentUser.email);
            setBlockingApplication(findBlockingMockPartnerApplication(currentUser.id));
        }
        const timeout = window.setTimeout(loadApplication, 0);
        window.addEventListener(mockPartnerApplicationsChangedEvent, loadApplication);
        return () => {
            window.clearTimeout(timeout);
            window.removeEventListener(mockPartnerApplicationsChangedEvent, loadApplication);
        };
    }, [isReady, router, user]);
    if (!isReady || blockingApplication === undefined) {
        return (<div className="rounded-xl border border-line bg-white p-5 text-sm text-ink-secondary">
        Loading application...
      </div>);
    }
    if (!user) {
        return (<div className="rounded-xl border border-line bg-white p-5 text-sm text-ink-secondary">
        Redirecting to login...
      </div>);
    }
    if (blockingApplication?.status === "SUSPENDED")
        return <PartnerSuspensionNotice application={blockingApplication}/>;
    if (blockingApplication) {
        return (<section className="rounded-xl border border-line bg-white px-5 py-14 text-center shadow-sm shadow-ink/5">
        <p className="text-sm font-semibold text-primary">Application already submitted</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-[-0.025em]">
          {blockingApplication.status === "APPROVED" ? "You are already a Partner" : "Application under review"}
        </h1>
        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-ink-secondary">
          {blockingApplication.status === "APPROVED"
                ? "Your Partner application was approved. Partner access is available."
                : "You already have a pending Partner application. You can check its current status instead of submitting again."}
        </p>
        <Link href={blockingApplication.status === "APPROVED" ? "/partner" : "/partner-application"} className="mt-6 inline-flex min-h-11 items-center justify-center rounded-lg bg-primary px-5 text-sm font-semibold text-white btn-primary">
          {blockingApplication.status === "APPROVED" ? "Go to Partner Portal" : "View Application Status"}
        </Link>
      </section>);
    }
    function handleFileChange(event, kind) {
        const selectedFile = event.target.files?.[0] ?? null;
        if (kind === "id") {
            setIdDocument(selectedFile);
            if (selectedFile)
                setErrors((current) => ({ ...current, idDocument: undefined }));
        }
        else {
            setOwnershipDocument(selectedFile);
            if (selectedFile)
                setErrors((current) => ({ ...current, ownershipDocument: undefined }));
        }
    }
    function personalErrors() {
        const nextErrors = {};
        if (!fullName.trim())
            nextErrors.fullName = "Full name is required.";
        if (!email.trim())
            nextErrors.email = "Email is required.";
        else if (!isValidEmail(email.trim()))
            nextErrors.email = "Enter a valid email address.";
        if (!phone.trim())
            nextErrors.phone = "Phone number is required.";
        else if (!/^[+()\-.\s\d]{6,}$/.test(phone.trim()))
            nextErrors.phone = "Enter a valid phone number.";
        return nextErrors;
    }
    function documentErrors() {
        const nextErrors = {};
        if (!idDocument)
            nextErrors.idDocument = "ID document is required.";
        else if (!isAllowedApplicationFile(idDocument))
            nextErrors.idDocument = "Upload a JPG, JPEG, PNG, or PDF file.";
        if (!ownershipDocument)
            nextErrors.ownershipDocument = "Property ownership or authorization document is required.";
        else if (!isAllowedApplicationFile(ownershipDocument))
            nextErrors.ownershipDocument = "Upload a JPG, JPEG, PNG, or PDF file.";
        return nextErrors;
    }
    function reviewErrors() {
        const nextErrors = {};
        if (!confirmed)
            nextErrors.confirm = "Please confirm that the information is accurate.";
        return nextErrors;
    }
    function goNext() {
        const nextErrors = step === 1 ? personalErrors() : documentErrors();
        setErrors(nextErrors);
        if (Object.keys(nextErrors).length === 0)
            setStep((current) => Math.min(3, current + 1));
    }
    function goBack() {
        setErrors({});
        setStep((current) => Math.max(1, current - 1));
    }
    async function submit(event) {
        event.preventDefault();
        if (!user)
            return;
        const nextErrors = { ...personalErrors(), ...documentErrors(), ...reviewErrors() };
        setErrors(nextErrors);
        if (Object.keys(nextErrors).length > 0 || !idDocument || !ownershipDocument)
            return;
        if (findBlockingMockPartnerApplication(user.id)) {
            router.push("/partner-application");
            return;
        }
        if (liveEnabled()) {
            try {
                await liveSubmitPartnerApplication({
                    fullName: fullName.trim(),
                    email: email.trim(),
                    phone: phone.trim(),
                    idDocument,
                    ownershipDocument,
                    note: note.trim(),
                });
                router.push("/partner-application");
            }
            catch (error) {
                setErrors({ confirm: error instanceof ApiError ? error.message : "The application could not be submitted." });
            }
            return;
        }
        saveMockPartnerApplication({
            id: createMockPartnerApplicationId(),
            userId: user.id,
            fullName: fullName.trim(),
            email: email.trim(),
            phone: phone.trim(),
            idDocumentName: idDocument.name,
            idDocumentType: idDocument.type || "file",
            ownershipDocumentName: ownershipDocument.name,
            ownershipDocumentType: ownershipDocument.type || "file",
            note: note.trim(),
            status: "PENDING",
            submittedAt: new Date().toISOString(),
        });
        router.push("/partner-application");
    }
    return (<section className="mx-auto max-w-2xl">
      <div className="mb-5">
        <h1 className="text-2xl font-semibold tracking-[-0.025em]">Partner Application</h1>
        <p className="mt-2 text-sm leading-6 text-ink-secondary">
          Complete the three steps below to apply as a RoomStay Partner. Uploaded files are represented by document names only for now.
        </p>
      </div>

      <form onSubmit={submit} noValidate className="rounded-xl border border-line bg-white p-5 shadow-sm shadow-ink/5 md:p-7">
        <ol className="mb-7 grid grid-cols-3 gap-2" aria-label="Application steps">
          {steps.map((label, index) => {
            const currentStep = index + 1;
            const active = step === currentStep;
            const complete = step > currentStep;
            return (<li key={label} className={`rounded-xl border px-3 py-3 text-center text-xs font-semibold ${active ? "border-primary bg-primary text-white" : complete ? "border-primary/20 bg-primary-tint text-primary" : "border-line bg-canvas/50 text-ink-secondary"}`}>
                <span className="block">Step {currentStep}</span>
                <span className="mt-1 block">{label}</span>
              </li>);
        })}
        </ol>

        {step === 1 && (<div className="grid gap-5">
            <label className="block text-sm font-medium text-ink">
              Full Name
              <input type="text" value={fullName} onChange={(event) => setFullName(event.target.value)} required autoComplete="name" className="mt-2 h-11 w-full rounded-lg border border-line bg-white px-3 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"/>
              {errors.fullName && <span className="mt-1.5 block text-xs text-alert">{errors.fullName}</span>}
            </label>
            <label className="block text-sm font-medium text-ink">
              Phone Number
              <input type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} required autoComplete="tel" placeholder="+66 81 234 5678" className="mt-2 h-11 w-full rounded-lg border border-line bg-white px-3 text-sm text-ink outline-none placeholder:text-ink-secondary focus:border-primary focus:ring-2 focus:ring-primary/15"/>
              {errors.phone && <span className="mt-1.5 block text-xs text-alert">{errors.phone}</span>}
            </label>
            <label className="block text-sm font-medium text-ink">
              Email
              <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required autoComplete="email" className="mt-2 h-11 w-full rounded-lg border border-line bg-white px-3 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"/>
              {errors.email && <span className="mt-1.5 block text-xs text-alert">{errors.email}</span>}
            </label>
          </div>)}

        {step === 2 && (<div className="grid gap-5">
            <div>
              <label htmlFor="partner-id-document" className="block text-sm font-medium text-ink">Identity document <span className="text-alert">*</span></label>
              <input id="partner-id-document" type="file" accept=".jpg,.jpeg,.png,.pdf" onChange={(event) => handleFileChange(event, "id")} required className="mt-2 block w-full text-sm text-ink-secondary file:mr-4 file:rounded-lg file:border-0 file:bg-primary file:px-4 file:py-2.5 file:text-sm file:font-semibold file:text-white"/>
              <p className="mt-2 text-xs text-ink-secondary">Accepted formats: JPG, JPEG, PNG, PDF. Maximum 8 MB per document.</p>
              {idDocument && <p className="mt-2 text-sm font-medium text-ink">Selected file: {idDocument.name}</p>}
              {errors.idDocument && <p className="mt-2 text-sm text-alert">{errors.idDocument}</p>}
            </div>
            <div>
              <label htmlFor="partner-ownership-document" className="block text-sm font-medium text-ink">Property ownership / authorization document <span className="text-alert">*</span></label>
              <input id="partner-ownership-document" type="file" accept=".jpg,.jpeg,.png,.pdf" onChange={(event) => handleFileChange(event, "ownership")} required className="mt-2 block w-full text-sm text-ink-secondary file:mr-4 file:rounded-lg file:border-0 file:bg-primary file:px-4 file:py-2.5 file:text-sm file:font-semibold file:text-white"/>
              <p className="mt-2 text-xs text-ink-secondary">Accepted formats: JPG, JPEG, PNG, PDF. Maximum 8 MB per document.</p>
              {ownershipDocument && <p className="mt-2 text-sm font-medium text-ink">Selected file: {ownershipDocument.name}</p>}
              {errors.ownershipDocument && <p className="mt-2 text-sm text-alert">{errors.ownershipDocument}</p>}
            </div>
          </div>)}

        {step === 3 && (<div className="grid gap-5">
            <div className="rounded-xl border border-line bg-canvas/40 p-4">
              <h2 className="font-semibold text-ink">Review Your Information</h2>
              <dl className="mt-4 grid gap-3 text-sm text-ink-secondary sm:grid-cols-2">
                <div><dt className="font-medium text-ink">Full Name</dt><dd className="mt-1">{fullName || "Not provided"}</dd></div>
                <div><dt className="font-medium text-ink">Phone</dt><dd className="mt-1">{phone || "Not provided"}</dd></div>
                <div><dt className="font-medium text-ink">Email</dt><dd className="mt-1">{email || "Not provided"}</dd></div>
                <div><dt className="font-medium text-ink">Identity document</dt><dd className="mt-1">{idDocument?.name ?? "Not selected"}</dd></div>
                <div><dt className="font-medium text-ink">Ownership document</dt><dd className="mt-1">{ownershipDocument?.name ?? "Not selected"}</dd></div>
              </dl>
            </div>
            <label className="block text-sm font-medium text-ink">
              Note (optional)
              <textarea value={note} onChange={(event) => setNote(event.target.value)} rows={4} maxLength={500} placeholder="Anything the review team should know (optional)." className="mt-2 w-full resize-none rounded-lg border border-line bg-white px-3 py-3 text-sm text-ink placeholder:text-ink-secondary outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"/>
              <span className="mt-1.5 block text-right text-xs text-ink-secondary">{note.length}/500</span>
            </label>
            <label className="flex items-start gap-3 rounded-xl border border-line bg-white p-4 text-sm text-ink-secondary">
              <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} className="mt-0.5 size-4 shrink-0 accent-primary"/>
              <span>I confirm that the information provided is accurate and complete.</span>
            </label>
            {errors.confirm && <p className="text-sm text-alert">{errors.confirm}</p>}
          </div>)}

        <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
          {step > 1 ? (<button type="button" onClick={goBack} className="inline-flex min-h-11 items-center justify-center rounded-lg border border-line bg-white px-5 text-sm font-semibold text-ink btn-secondary">Back</button>) : <span />}
          {step < 3 ? (<button type="button" onClick={goNext} className="inline-flex min-h-11 items-center justify-center rounded-lg bg-primary px-5 text-sm font-semibold text-white btn-primary">Next</button>) : (<button type="submit" className="inline-flex min-h-11 items-center justify-center rounded-lg bg-primary px-5 text-sm font-semibold text-white btn-primary">Submit Application</button>)}
        </div>
      </form>
    </section>);
}
