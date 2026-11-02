import "server-only";

import { listMergeCandidates, type MergeCandidate } from "../lib/services/canonical-subscription-merge-service";

export type ScriptCandidate = MergeCandidate & { terms: string };

/** Candidates in creation order, plus groups of 2+ unblocked subscriptions with identical terms (largest first). */
export async function mergeCandidatesForScript(customerId: string): Promise<{ candidates: ScriptCandidate[]; groups: ScriptCandidate[][] }> {
  const candidates = (await listMergeCandidates(customerId)).map((candidate) => ({ ...candidate, terms: candidate.key }));
  const byKey = new Map<string, ScriptCandidate[]>();
  for (const candidate of candidates) {
    if (candidate.blockers.length) continue;
    byKey.set(candidate.key, [...(byKey.get(candidate.key) ?? []), candidate]);
  }
  const groups = [...byKey.values()].filter((group) => group.length > 1).sort((left, right) => right.length - left.length);
  return { candidates, groups };
}
