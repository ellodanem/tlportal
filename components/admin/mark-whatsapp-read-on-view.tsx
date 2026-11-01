"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

import { markCustomerWhatsAppReadAction } from "@/app/admin/customers/[id]/messages/actions";

/**
 * Marks the customer's WhatsApp thread read through an explicit server action once a staff
 * member has actually opened it. The page render itself stays read-only so prefetches,
 * crawlers and refreshes can never change unread state.
 */
export function MarkWhatsAppReadOnView({ customerId, unreadCount }: { customerId: string; unreadCount: number }) {
  const router = useRouter();
  const done = useRef(false);

  useEffect(() => {
    if (unreadCount <= 0 || done.current) return;
    done.current = true;
    void markCustomerWhatsAppReadAction(customerId).then(() => router.refresh());
  }, [customerId, unreadCount, router]);

  return null;
}
