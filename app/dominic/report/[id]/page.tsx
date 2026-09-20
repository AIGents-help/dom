import DominicReport from "@/components/dominic/DominicReport";

export const metadata = {
  title: "DOMINIC Project Report",
};

export default async function DominicReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <DominicReport projectId={id} />;
}
