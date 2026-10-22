import { permanentRedirect } from "next/navigation";

export default function LegacyPurchasesPage() {
  permanentRedirect("/admin/bills");
}
