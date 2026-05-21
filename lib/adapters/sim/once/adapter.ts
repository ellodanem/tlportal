import { executeOneNceSimsInventoryImport } from "@/lib/admin/one-nce-sims-sync";
import type { SimPort } from "@/lib/ports/sim";

export const onceSimAdapter: SimPort = {
  provider: "once",

  isConfigured(): boolean {
    return Boolean(process.env.ONCE_CLIENT_ID?.trim() && process.env.ONCE_CLIENT_SECRET?.trim());
  },

  async importInventory(): Promise<{ imported: number }> {
    const result = await executeOneNceSimsInventoryImport();
    if (!result.ok) {
      throw new Error(result.error);
    }
    return { imported: result.imported };
  },
};
