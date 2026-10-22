import { permanentRedirect } from "next/navigation";

export default async function LegacyExpenseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  permanentRedirect(`/admin/bills/${id}`);
}
