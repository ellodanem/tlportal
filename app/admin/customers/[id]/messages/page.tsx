import Link from "next/link";
import { notFound } from "next/navigation";

import { CustomerSubnav } from "@/components/admin/customer-subnav";
import { CustomerWhatsAppThread } from "@/components/admin/customer-whatsapp-thread";
import { customerDisplayName } from "@/lib/admin/customer-display";
import {
  getWhatsAppConversationForCustomer,
  isWhatsAppSessionOpen,
  markWhatsAppConversationRead,
} from "@/lib/communications/whatsapp-conversation-service";
import { prisma } from "@/lib/db";

type Props = { params: Promise<{ id: string }> };

export default async function CustomerMessagesPage({ params }: Props) {
  const { id } = await params;
  const customer = await prisma.customer.findUnique({
    where: { id },
    select: { id: true, company: true, firstName: true, lastName: true, phone: true },
  });
  if (!customer) notFound();

  const conversation = await getWhatsAppConversationForCustomer(id);
  if (conversation && conversation.unreadCount > 0) {
    await markWhatsAppConversationRead(conversation.id);
  }

  const title = customerDisplayName(customer);
  const sessionOpen = isWhatsAppSessionOpen(conversation?.lastInboundAt ?? null);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href="/admin/customers"
          className="text-sm text-emerald-700 hover:underline dark:text-emerald-400"
        >
          ← Customers
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">{title}</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">WhatsApp messages</p>
      </div>

      <CustomerSubnav customerId={customer.id} active="messages" />

      <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        {conversation ? (
          <CustomerWhatsAppThread
            customerId={customer.id}
            phoneE164={conversation.phoneE164}
            sessionOpen={sessionOpen}
            lastInboundAt={conversation.lastInboundAt?.toISOString() ?? null}
            messages={conversation.messages.map((m) => ({
              id: m.id,
              direction: m.direction,
              body: m.body,
              kind: m.kind,
              occurredAt: m.occurredAt.toISOString(),
            }))}
          />
        ) : (
          <div className="text-sm text-zinc-600 dark:text-zinc-400">
            <p>No WhatsApp conversation yet for this customer.</p>
            <p className="mt-2">
              When they message your Twilio WhatsApp number
              {customer.phone ? (
                <>
                  {" "}
                  from <span className="font-mono text-xs">{customer.phone}</span>
                </>
              ) : null}
              , messages appear here. Outbound templates from Message templates also start a thread once recorded.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
