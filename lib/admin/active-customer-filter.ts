/** Customers visible in active lists, assignment pickers, and billing reminders. */
export const activeCustomerWhere = { archivedAt: null } as const;

export const archivedCustomerWhere = { archivedAt: { not: null } } as const;
