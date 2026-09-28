import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  BellRing,
  Camera,
  FileDown,
  HandCoins,
  Inbox,
  Landmark,
  Lock,
  MapPin,
  Palette,
  Repeat,
  Search,
  ShieldCheck,
  ShoppingBag,
  Smartphone,
  Utensils,
} from "lucide-react";
import { ThemeSwitcher } from "@/components/ThemeSwitcher";

export const metadata: Metadata = {
  title: { absolute: "Capture Hub: payment proof, expenses and reimbursements in one private place" },
  description:
    "Save payment screenshots, receipts and check deposits in seconds. Track recurring bills and reimbursements, and find any proof later by payee, property, trip or date.",
};

const FEATURES = [
  {
    icon: Camera,
    title: "Save proof in seconds",
    body: "Snap a receipt or upload a payment screenshot or PDF. Add the payee and amount now, or drop it in the inbox and file it later.",
  },
  {
    icon: Repeat,
    title: "Recurring bills, handled",
    body: "HOA dues, insurance, utilities. See what's due and what's overdue, mark it paid with the confirmation attached, and the next due date sets itself.",
  },
  {
    icon: HandCoins,
    title: "Know who owes you",
    body: "Flag work trips or club expenses as reimbursable and follow each one from To submit → Submitted → Reimbursed, grouped by organization or trip.",
  },
  {
    icon: Landmark,
    title: "Check deposits",
    body: "Record the payer, amount and check image, then mark it cleared when it shows up in your account.",
  },
  {
    icon: Search,
    title: "Find anything later",
    body: "Search by payee, property, trip, tag, amount or confirmation number. Every record keeps its screenshots and PDFs.",
  },
  {
    icon: FileDown,
    title: "Reports & export",
    body: "Totals by category, property, trip or month. Export any filtered view to CSV for taxes, your accountant or a reimbursement claim.",
  },
];

const STEPS = [
  { icon: Camera, title: "Capture", body: "Photo, screenshot, PDF, link or a quick note, from your phone or computer." },
  { icon: Inbox, title: "Organize", body: "Mark it as a payment, expense or deposit and link it to a property, trip or bill." },
  { icon: Search, title: "Find & act", body: "Get reminders, track what's owed, and pull up proof the moment someone asks." },
];

const FUTURE = [
  { icon: MapPin, label: "Travel ideas & places" },
  { icon: Utensils, label: "Food spots" },
  { icon: ShoppingBag, label: "Products to buy" },
  { icon: Palette, label: "Design inspiration" },
];

function AppPreview() {
  // A lightweight, static illustration of the dashboard (no screenshots to keep in sync).
  const rows = [
    { t: "Oak Grove HOA dues", s: "Due in 3 days", a: "$325.00", warn: false },
    { t: "Home insurance", s: "2 days overdue", a: "$1,184.00", warn: true },
    { t: "Water & sewer", s: "Due Oct 12", a: "$88.40", warn: false },
  ];
  return (
    <div className="card mx-auto w-full max-w-sm overflow-hidden shadow-xl" aria-hidden>
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <span className="text-sm font-semibold">Home</span>
        <span className="chip bg-warn-soft text-warn">2 in inbox</span>
      </div>
      <div className="px-4 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wide text-muted">Bills due</div>
      {rows.map((r) => (
        <div key={r.t} className="flex items-center gap-3 px-4 py-2.5">
          <span
            className={`flex h-8 w-8 items-center justify-center rounded-lg ${r.warn ? "bg-danger-soft text-danger" : "bg-accent-soft text-accent"}`}
          >
            <BellRing size={15} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{r.t}</p>
            <p className={`text-xs ${r.warn ? "text-danger" : "text-muted"}`}>{r.s}</p>
          </div>
          <span className="text-sm font-medium tabular-nums">{r.a}</span>
        </div>
      ))}
      <div className="px-4 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wide text-muted">Owed to you</div>
      <div className="flex items-center justify-between px-4 py-2.5">
        <div>
          <p className="text-sm font-medium">India Club</p>
          <p className="text-xs text-muted">3 expenses · Submitted</p>
        </div>
        <span className="text-sm font-medium tabular-nums">$212.60</span>
      </div>
      <div className="flex items-center justify-between px-4 pb-4 pt-2.5">
        <div>
          <p className="text-sm font-medium">Work – Austin trip</p>
          <p className="text-xs text-muted">5 expenses · To submit</p>
        </div>
        <span className="text-sm font-medium tabular-nums">$946.15</span>
      </div>
    </div>
  );
}

export default function WelcomePage() {
  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-20 border-b border-border bg-bg/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 md:px-8">
          <Link href="/welcome" className="flex items-center gap-2 font-semibold tracking-tight">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icon.svg" alt="" width={28} height={28} className="rounded-md" />
            Capture Hub
          </Link>
          <nav className="flex items-center gap-1 text-sm">
            <a href="#features" className="btn-ghost hidden sm:inline-flex">
              Features
            </a>
            <a href="#privacy" className="btn-ghost hidden sm:inline-flex">
              Privacy
            </a>
            <span className="hidden md:inline-flex">
              <ThemeSwitcher compact />
            </span>
            <Link href="/login" className="btn-ghost">
              Sign in
            </Link>
            <Link href="/signup" className="btn-primary">
              Sign up
            </Link>
          </nav>
        </div>
      </header>

      <main>
        <section className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-16 md:grid-cols-2 md:px-8 md:py-24">
          <div>
            <p className="chip mb-4 bg-accent-soft text-accent">Private · Web + iPhone + Android</p>
            <h1 className="text-4xl font-semibold leading-tight tracking-tight md:text-5xl">
              “I know I paid it. Where&apos;s the proof?”
              <span className="mt-2 block text-accent">Now it&apos;s one search away.</span>
            </h1>
            <p className="mt-5 max-w-lg text-lg text-muted">
              Capture Hub keeps payment screenshots, receipts, check deposits, recurring bills and reimbursements together,
              organized by who, what, when and which property or trip.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/signup" className="btn-primary px-6">
                Get started <ArrowRight size={18} />
              </Link>
              <a href="#how" className="btn-secondary px-6">
                How it works
              </a>
            </div>
          </div>
          <AppPreview />
        </section>

        <section id="how" className="scroll-mt-16 border-y border-border bg-surface">
          <div className="mx-auto max-w-6xl px-4 py-16 md:px-8">
            <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">How it works</h2>
            <div className="mt-8 grid gap-6 md:grid-cols-3">
              {STEPS.map(({ icon: Icon, title, body }, i) => (
                <div key={title} className="flex gap-4">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-hero">
                    <Icon size={20} />
                  </span>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted">Step {i + 1}</p>
                    <h3 className="mt-0.5 font-semibold">{title}</h3>
                    <p className="mt-1 text-sm text-muted">{body}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="features" className="scroll-mt-16 mx-auto max-w-6xl px-4 py-16 md:px-8">
          <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">Everything that proves you paid, in one place</h2>
          <p className="mt-2 max-w-2xl text-muted">
            Built for households: HOA and property bills, insurance, travel, club and work reimbursements.
          </p>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map(({ icon: Icon, title, body }) => (
              <div key={title} className="card p-5">
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent-soft text-accent">
                  <Icon size={20} />
                </span>
                <h3 className="mt-4 font-semibold">{title}</h3>
                <p className="mt-1.5 text-sm text-muted">{body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="border-y border-border bg-surface">
          <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-16 md:grid-cols-2 md:px-8">
            <div>
              <Smartphone className="text-accent" size={28} />
              <h2 className="mt-3 text-2xl font-semibold tracking-tight md:text-3xl">On your phone, where the receipt is</h2>
              <p className="mt-3 text-muted">
                Use the iPhone and Android apps, or add the web app to your home screen. Take a photo, pick a screenshot, or
                share a link straight into Capture Hub. Your records sync with the web version.
              </p>
            </div>
            <div>
              <h3 className="font-semibold">Coming next: save more than receipts</h3>
              <p className="mt-2 text-sm text-muted">
                The same quick capture will hold travel ideas, places, food spots, products and design inspiration, each
                searchable and linked to a trip or project.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                {FUTURE.map(({ icon: Icon, label }) => (
                  <span key={label} className="chip gap-1.5 border border-border bg-bg px-3 py-1.5 text-sm text-muted">
                    <Icon size={14} /> {label}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section id="privacy" className="scroll-mt-16 mx-auto max-w-6xl px-4 py-16 md:px-8">
          <div className="card grid gap-8 p-6 md:grid-cols-[auto_1fr] md:p-10">
            <ShieldCheck size={40} className="text-ok" />
            <div>
              <h2 className="text-2xl font-semibold tracking-tight">Private by default</h2>
              <ul className="mt-4 grid gap-3 text-sm text-muted sm:grid-cols-2">
                {[
                  "No bank logins or account connections. You choose what to save.",
                  "Files are private and open only through short-lived signed links.",
                  "Every record belongs to your workspace; family sharing is opt-in.",
                  "Export everything to CSV at any time. Your data stays yours.",
                ].map((t) => (
                  <li key={t} className="flex gap-2">
                    <Lock size={16} className="mt-0.5 shrink-0 text-ok" /> {t}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 pb-20 text-center md:px-8">
          <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">Stop digging through screenshots.</h2>
          <p className="mt-2 text-muted">Set up your space in under a minute.</p>
          <Link href="/signup" className="btn-primary mt-6 px-8">
            Get started <ArrowRight size={18} />
          </Link>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-6 text-sm text-muted md:px-8">
          <span>© {new Date().getFullYear()} Capture Hub</span>
          <Link href="/login" className="hover:text-text">
            Sign in
          </Link>
        </div>
      </footer>
    </div>
  );
}
