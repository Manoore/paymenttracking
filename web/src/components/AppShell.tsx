"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  HandCoins,
  Home,
  Inbox,
  LogOut,
  Plus,
  Repeat,
  Search,
  UserRound,
  Building2,
  MapPin,
  Users,
  CalendarCheck,
} from "lucide-react";
import { logout, switchWorkspace } from "@/lib/api";
import { useWorkspace, WorkspaceProvider } from "./WorkspaceContext";
import { ThemeSwitcher } from "./ThemeSwitcher";

const NAV = [
  { href: "/", label: "Home", icon: Home },
  { href: "/inbox", label: "Inbox", icon: Inbox },
  { href: "/activity", label: "Activity", icon: Search },
  { href: "/recurring", label: "Recurring", icon: Repeat },
  { href: "/reimbursements", label: "Reimbursements", icon: HandCoins },
  { href: "/properties", label: "Properties", icon: Building2 },
  { href: "/places", label: "Places & ideas", icon: MapPin },
  { href: "/reports", label: "Reports", icon: BarChart3 },
];

// Bottom bar on phones keeps the four most-used destinations one tap away.
const MOBILE_NAV = [NAV[0], NAV[2], NAV[3], NAV[4]];

function isActive(pathname: string, href: string) {
  const path = href.split("?")[0];
  if (href.includes("?")) return false; // filtered shortcuts never "own" a page
  return path === "/" ? pathname === "/" : pathname.startsWith(path);
}

/** Gradient app icon used in the sidebar and phone header. */
function BrandMark({ size = 32 }: { size?: number }) {
  return (
    <span className="flex shrink-0 items-center justify-center rounded-xl bg-hero shadow-sm" style={{ width: size, height: size }}>
      <Inbox size={size * 0.55} strokeWidth={2.2} />
    </span>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <WorkspaceProvider>
      <Shell>{children}</Shell>
    </WorkspaceProvider>
  );
}

/** Personal ↔ family space switcher. */
function SpaceSwitcher({ compact = false }: { compact?: boolean }) {
  const { user, workspace } = useWorkspace();
  if (!user || user.workspaces.length < 2) return null;
  return (
    <select
      aria-label="Switch space"
      className={`input ${compact ? "min-h-9 w-36 py-1 text-sm" : "mb-4"}`}
      value={workspace?.id ?? ""}
      onChange={(e) => switchWorkspace(e.target.value)}
    >
      {user.workspaces.map((w) => (
        <option key={w.id} value={w.id}>
          {w.kind === "family" ? "👪 " : "🔒 "}
          {w.name}
        </option>
      ))}
    </select>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { isFamily, user } = useWorkspace();
  const multiSpace = (user?.workspaces.length ?? 0) > 1;
  const nav = [
    ...NAV.slice(0, 4),
    ...(isFamily ? [{ href: "/household", label: "Household", icon: CalendarCheck }] : []),
    ...NAV.slice(4),
    { href: "/family", label: "Family & sharing", icon: Users },
  ];

  return (
    <div className="min-h-dvh md:flex">
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-border bg-surface/80 px-3 py-5 backdrop-blur md:flex">
        <Link href="/" className="mb-6 flex items-center gap-2.5 px-2 text-lg font-semibold tracking-tight">
          <BrandMark />
          Capture Hub
        </Link>
        <SpaceSwitcher />
        <Link href="/new" className="btn-primary mb-4">
          <Plus size={18} /> New capture
        </Link>
        <nav className="flex flex-1 flex-col gap-1">
          {nav.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium ${
                isActive(pathname, href) ? "bg-accent-soft font-semibold text-accent" : "text-muted hover:bg-surface-2 hover:text-text"
              }`}
            >
              <Icon size={18} /> {label}
            </Link>
          ))}
        </nav>
        <div className="mb-2 px-1">
          <ThemeSwitcher compact />
        </div>
        <Link
          href="/profile"
          className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium ${
            isActive(pathname, "/profile") ? "bg-accent-soft text-accent" : "text-muted hover:bg-surface-2 hover:text-text"
          }`}
        >
          <UserRound size={18} /> Profile
        </Link>
        <button onClick={() => void logout()} className="btn-ghost justify-start">
          <LogOut size={18} /> Sign out
        </button>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex items-center justify-between border-b border-border bg-bg/90 px-4 py-3 backdrop-blur md:hidden">
          {multiSpace ? (
            <SpaceSwitcher compact />
          ) : (
            <Link href="/" className="flex items-center gap-2 text-base font-semibold">
              <BrandMark size={28} />
              Capture Hub
            </Link>
          )}
          <div className="flex items-center gap-1">
            <Link href="/inbox" aria-label="Inbox" className="btn-ghost px-3">
              <Inbox size={20} />
            </Link>
            <Link href="/places" aria-label="Places & ideas" className="btn-ghost px-3">
              <MapPin size={20} />
            </Link>
            <Link href="/reports" aria-label="Reports" className="btn-ghost px-3">
              <BarChart3 size={20} />
            </Link>
            <Link href="/profile" aria-label="Profile" className="btn-ghost px-3">
              <UserRound size={20} />
            </Link>
          </div>
        </header>

        <main className="mx-auto w-full max-w-5xl flex-1 px-4 pb-28 pt-4 md:px-8 md:pb-10 md:pt-8">{children}</main>
      </div>

      <Link
        href="/new"
        aria-label="New capture"
        className="fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom))] right-4 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-hero shadow-lg md:hidden"
      >
        <Plus size={26} />
      </Link>
      <nav
        className={`fixed inset-x-0 bottom-0 z-20 grid ${isFamily ? "grid-cols-5" : "grid-cols-4"} border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] md:hidden`}
      >
        {(isFamily
          ? [MOBILE_NAV[0], MOBILE_NAV[1], { href: "/household", label: "Household", icon: CalendarCheck }, MOBILE_NAV[2], MOBILE_NAV[3]]
          : MOBILE_NAV
        ).map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={`flex flex-col items-center gap-0.5 py-1.5 text-[11px] font-medium ${
              isActive(pathname, href) ? "text-accent" : "text-muted"
            }`}
          >
            <span className={`flex h-7 w-12 items-center justify-center rounded-full ${isActive(pathname, href) ? "bg-accent-soft" : ""}`}>
              <Icon size={20} />
            </span>
            {label === "Reimbursements" ? "Owed" : label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
