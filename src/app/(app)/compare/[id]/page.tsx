import { SavedModelComparison } from "@/components/chat/model-comparison";

export default async function SavedComparePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <SavedModelComparison key={id} id={id} />;
}
