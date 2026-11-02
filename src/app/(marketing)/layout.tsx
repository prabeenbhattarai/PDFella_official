import { Header } from "@/components/marketing/header";
import { Footer } from "@/components/marketing/footer";
import { AppSidebar } from "@/components/desktop/app-sidebar";

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {/* display: contents keeps the header sticky to the page, not to this wrapper. */}
      <div className="web-only contents"><Header /></div>
      <AppSidebar />
      <main id="main">{children}</main>
      <div className="web-only contents"><Footer /></div>
    </>
  );
}
