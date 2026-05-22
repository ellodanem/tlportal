import type { BroadcastTemplateCategory } from "@prisma/client";

export type DefaultBroadcastTemplateSeed = {
  slug: string;
  name: string;
  category: BroadcastTemplateCategory;
  subject: string;
  bodyText: string;
  sortOrder: number;
};

export const DEFAULT_BROADCAST_TEMPLATES: DefaultBroadcastTemplateSeed[] = [
  {
    slug: "outage-investigating",
    name: "Service disruption — investigating",
    category: "outage",
    sortOrder: 10,
    subject: "{{incident_title}} — service disruption",
    bodyText: `Hello {{first_name}},

We are aware of a disruption affecting {{incident_title}}. Our team is investigating and will share updates as soon as we have more information.

Current status: {{incident_status}}
{{eta}}

We apologize for the inconvenience.

{{portal_url}}`,
  },
  {
    slug: "maintenance-planned",
    name: "Planned maintenance",
    category: "maintenance",
    sortOrder: 20,
    subject: "Scheduled maintenance — {{incident_title}}",
    bodyText: `Hello {{first_name}},

Track Lucia will perform planned maintenance that may briefly affect {{incident_title}}.

Window: {{eta}}
Impact: {{incident_status}}

No action is required unless we contact you directly. Thank you for your patience.

{{portal_url}}`,
  },
  {
    slug: "outage-resolved",
    name: "Service restored",
    category: "outage",
    sortOrder: 30,
    subject: "{{incident_title}} — service restored",
    bodyText: `Hello {{first_name}},

The issue affecting {{incident_title}} has been resolved. All services should now be operating normally.

If you still experience problems, reply to this email or contact us at {{support_email}}.

Thank you for your patience.`,
  },
];
