export function InvoicePayOnlineForm({ token }: { token: string }) {
  return (
    <form action={`/api/pay/i/${encodeURIComponent(token)}/checkout`} method="POST">
      <button
        type="submit"
        className="inline-flex rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500"
      >
        Pay with card
      </button>
    </form>
  );
}
