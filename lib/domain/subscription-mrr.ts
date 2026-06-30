/** Total charged per billing period for one vehicle at a multi-month term. */
export function periodTotalPerVehicleXcd(monthlyRateXcd: number, durationMonths: number): number {
  const months = Math.trunc(durationMonths);
  if (months <= 0) return 0;
  if (months === 12) {
    const discount = 330 / (30 * 12);
    return Math.round(monthlyRateXcd * 12 * discount * 100) / 100;
  }
  return Math.round(monthlyRateXcd * months * 100) / 100;
}

/** Normalized monthly recurring revenue for one subscription (includes annual term discounts). */
export function effectiveMonthlyRecurringXcd(
  monthlyRateXcd: number,
  planTermMonths: number,
  vehicleCount: number,
): number {
  const months = Math.max(1, Math.trunc(planTermMonths));
  const vehicles = Math.max(1, Math.trunc(vehicleCount));
  const period = periodTotalPerVehicleXcd(monthlyRateXcd, months);
  return Math.round((period / months) * vehicles * 100) / 100;
}

/** Monthly equivalent for a native recurring invoice schedule cycle total. */
export function effectiveMonthlyFromScheduleCycle(cycleTotalXcd: number, intervalMonths: number): number {
  const months = Math.max(1, Math.trunc(intervalMonths));
  return Math.round((cycleTotalXcd / months) * 100) / 100;
}
