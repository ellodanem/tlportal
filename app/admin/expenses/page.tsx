import { permanentRedirect } from "next/navigation";

export default function LegacyExpensesPage() {
  permanentRedirect("/admin/bills");
}
