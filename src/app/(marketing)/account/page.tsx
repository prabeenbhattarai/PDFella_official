import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AccountPanel } from "./account-panel";

export const metadata: Metadata = { title: "Account and billing", robots: { index: false, follow: false } };

/** Where people manage their own plan. Hidden in production until payments are on. */
export default function AccountPage() {
  if (process.env.NODE_ENV === "production" && process.env.NEXT_PUBLIC_BILLING_ENABLED !== "1") notFound();
  return (
    <section className="wrap mx-auto min-h-[70vh] max-w-2xl pt-28 pb-24">
      <h1 className="font-display text-4xl tracking-tight sm:text-5xl">Account and billing</h1>
      <AccountPanel />
    </section>
  );
}
