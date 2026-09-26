import AdminSidebar from "@/components/AdminSidebar";
import AdminAuthGate from "@/components/AdminAuthGate";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <AdminAuthGate>
      <div style={{ display: "flex", minHeight: "100vh", background: "#F5F7FA" }}>
        <AdminSidebar />
        <main style={{ flex: 1, minWidth: 0 }}>{children}</main>
      </div>
    </AdminAuthGate>
  );
}
