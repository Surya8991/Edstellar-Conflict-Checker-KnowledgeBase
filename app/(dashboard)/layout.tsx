import Sidebar from "@/app/components/Sidebar";
import HelpButton from "@/app/components/HelpButton";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      {/* Top padding on small screens so the floating burger button doesn't
          overlap the PageHeader. Sidebar is in-flow on >= lg, drawer below. */}
      <main className="flex-1 min-w-0 pt-12 lg:pt-0">{children}</main>
      <HelpButton />
    </div>
  );
}
