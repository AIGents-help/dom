import DominicMaintenancePackage from "@/components/dominic/DominicMaintenancePackage";

export const metadata = {
  title: "DOMINIC Maintenance Evidence Package",
};

export default async function DominicMaintenancePackagePage({
  params,
}: {
  params: Promise<{ issueId: string }>;
}) {
  const { issueId } = await params;
  return <DominicMaintenancePackage issueId={issueId} />;
}
