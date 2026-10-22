import { permanentRedirect } from "next/navigation";

export default function LegacyNewExpensePage() {
  permanentRedirect("/admin/bills/new");
}
