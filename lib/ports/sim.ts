export type ExternalSimSummary = {
  iccid: string;
  msisdn: string | null;
  imsi: string | null;
  label: string | null;
  status: string | null;
  totalDataMB: number | null;
  usedDataMB: number | null;
};

export type UsagePoint = {
  date: string;
  usedMB: number;
};

/**
 * Cellular / M2M provider contract — implementations under lib/adapters/sim/*.
 */
export interface SimPort {
  readonly provider: "once";

  isConfigured(): boolean;

  importInventory(): Promise<{ imported: number }>;
}
