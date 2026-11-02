import { CustomerWhatsAppThread } from "@/components/admin/customer-whatsapp-thread";
import { MarkWhatsAppReadOnView } from "@/components/admin/mark-whatsapp-read-on-view";
import {
  getWhatsAppConversationForCustomer,
  isWhatsAppSessionOpen,
} from "@/lib/communications/whatsapp-conversation-service";

/**
 * WhatsApp thread for one customer. Shared by the Subscriptions customer workspace and the
 * original Customers tab. Reads only: marking the thread read happens in a client component
 * after the page is viewed, never during render.
 */
export async function CustomerMessagesPanel({ customer }: { customer: { id: string; phone: string | null } }) {
  const conversation = await getWhatsAppConversationForCustomer(customer.id);
  const sessionOpen = isWhatsAppSessionOpen(conversation?.lastInboundAt ?? null);

  return (
    <>
      {conversation ? <MarkWhatsAppReadOnView customerId={customer.id} unreadCount={conversation.unreadCount} /> : null}

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
    </>
  );
}
