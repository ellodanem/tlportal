import Link from "next/link";
import { notFound } from "next/navigation";

import { EditCustomerProfileForm } from "@/components/admin/customer-new/edit-customer-profile-form";
import { customerDisplayName } from "@/lib/admin/customer-display";
import { customerNewHref } from "@/lib/admin/customer-new";
import { prisma } from "@/lib/db";

type Props = { params: Promise<{ id: string }> };

export default async function EditCustomerNewPage({ params }: Props) {
  const { id } = await params;
  const customer = await prisma.customer.findUnique({ where: { id } });
  if (!customer) notFound();

  const backHref = customerNewHref({ c: customer.id });
  const title = customerDisplayName(customer);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <div>
        <Link
          href={backHref}
          className="-ml-2 inline-flex min-h-11 items-center rounded-md px-2 text-sm font-medium text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950/30"
        >
          ← {title}
        </Link>
        <h1 className="mt-1 text-xl font-semibold text-zinc-900 sm:mt-2 sm:text-2xl dark:text-zinc-50">Edit profile</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Identity, billing address, legal info, and invoice emails. GPS, portal users, and contacts stay on the
          customer page.
        </p>
      </div>
      <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm sm:p-5 dark:border-zinc-800 dark:bg-zinc-900">
        <EditCustomerProfileForm
          customerId={customer.id}
          cancelHref={backHref}
          defaults={{
            firstName: customer.firstName,
            lastName: customer.lastName,
            company: customer.company,
            email: customer.email,
            phone: customer.phone,
            address: customer.address,
            city: customer.city,
            state: customer.state,
            postalCode: customer.postalCode,
            country: customer.country,
            legalInfo: customer.legalInfo,
            invoiceCc: customer.invoiceCc,
            invoiceBcc: customer.invoiceBcc,
            notes: customer.notes,
            tags: customer.tags?.length ? customer.tags.join(", ") : "",
          }}
        />
      </div>
    </div>
  );
}
