import DominicIllustratedInspectionReport from "@/components/dominic/DominicIllustratedInspectionReport";
export default async function InspectionReportPage({ params }: { params: Promise<{ inspectionId: string }> }) {
  const { inspectionId } = await params;
  return <DominicIllustratedInspectionReport inspectionId={inspectionId} />;
}
