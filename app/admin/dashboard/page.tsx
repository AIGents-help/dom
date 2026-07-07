import AdminDashboardClient from "@/components/AdminDashboardClient";

export const metadata = {
  title: "Admin Dashboard | Drone Operation Management",
};

export default function AdminDashboardPage() {
  return (
    <section className="section">
      <div className="container-app">
        <div className="mb-10">
          <p className="eyebrow mb-2">Operations Console</p>
          <h1 className="heading-lg">Admin Dashboard</h1>
          <p className="body-muted mt-2">
            Manage leads, mission requests, clients, jobs, schedule, and deliverables.
          </p>
        </div>
        <AdminDashboardClient />
      </div>
    </section>
  );
}
