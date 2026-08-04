import { formatDate } from '@/modules/shared';

/**
 * How a list is titled on screen: "Spar, Hofer, and 1 other (03. 08. 2026)".
 *
 * The date only joins an *inferred* title — a list someone bothered to name keeps exactly the name
 * they gave it. Without it every unnamed weekly shop reads identically, and the shops alone don't
 * say which trip you're looking at.
 *
 * Composed here rather than in the server's `inferLabel` because the date needs *formatting*, and
 * `formatDate` is the app's single source for that; the server only does UTC `YYYY-MM-DD`
 * arithmetic. Both the master column and the detail heading call this, so they can't disagree.
 */
export function listTitle(list: { createdAt: string; label: string; name: string | null }) {
  return list.name ? list.label : `${list.label} (${formatDate(list.createdAt)})`;
}
