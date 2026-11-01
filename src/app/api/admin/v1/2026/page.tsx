import type { Metadata } from "next";
import { AdminDashboard } from "./admin-dashboard";

export const metadata: Metadata = {
  title: "Admin",
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
};

/** Admin panel. The page itself is public; every number comes from ./stats, which checks the admin on the server. */
export default function AdminPage() {
  return <AdminDashboard />;
}
