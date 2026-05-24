export type RegistrationNotesInput = {
  submittedAt: Date;
  vehicleDetails: string;
  additionalUsers: string | null;
  subscriptionLabel: string | null;
  termInstallAfterPayment: boolean;
  termHardwarePerVehicle: boolean;
  termTravelFee: boolean;
};

/**
 * Append-only snapshot for staff (vehicles added manually from this block).
 */
export function buildRegistrationCustomerNotes(input: RegistrationNotesInput): string {
  const iso = input.submittedAt.toISOString();
  const sub = input.subscriptionLabel?.trim() || "(none selected)";
  const additional = input.additionalUsers?.trim();
  const lines = [
    `--- Registration snapshot (${iso}) ---`,
    "",
    "Vehicle / fleet details (staff: add devices from this section):",
    input.vehicleDetails.trim(),
    "",
  ];
  if (additional) {
    lines.push(
      "Additional users (from form; staff: provision access as needed):",
      additional,
      "",
    );
  }
  lines.push(
    "Subscription choice (from form, informational):",
    sub,
    "",
    "Acknowledgements at submission:",
    `- Installation after payment and confirmation: ${input.termInstallAfterPayment ? "Confirmed" : "—"}`,
    `- Hardware fee per vehicle (GPS device): ${input.termHardwarePerVehicle ? "Confirmed" : "—"}`,
    `- Travel fee may apply by location: ${input.termTravelFee ? "Confirmed" : "—"}`,
  );
  return lines.join("\n");
}
