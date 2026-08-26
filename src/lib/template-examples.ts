// Curated example descriptions offered in the template wizard's Describe step.
// Client-only constants — no server or schema involvement.
import type { RawMessageType } from "@/lib/raw-payloads";

const GENERIC: string[] = [
  "Business-initiated welcome message with the customer's first name",
  "Post-purchase follow-up asking if everything arrived as expected",
];

const BY_TYPE: Record<RawMessageType, string[]> = {
  text: [
    "Appointment reminder using a customerName variable and an appointmentTime variable",
    "Order shipped notice with an orderNumber and trackingNumber variable",
    "Store closure notice for a holiday, with the reopening date as a variable",
  ],
  quick_reply: [
    "Quick reply asking to confirm or reschedule an appointment, with a customerName variable",
    "Quick reply asking the customer to rate a recent support chat from great, okay, or poor",
    "Quick reply asking whether they want pickup or delivery for their order",
  ],
  list_picker: [
    "List picker to choose a service, grouped into sections for haircuts, colour, and treatments",
    "List picker to choose a store location, with city names as section titles",
    "Multi-select list picker letting the customer choose which topics they want updates about",
  ],
  time_picker: [
    "Time picker offering three appointment slots for next week from a timeslots variable",
    "Time picker to schedule a callback from our support team",
    "Time picker to book a test drive at the dealership",
  ],
  form: [
    "Form collecting name, email, and a description of the issue",
    "Warranty claim form asking for order number, purchase date, and a photo",
    "New-patient intake form split across two pages: contact details, then medical history",
  ],
  imessage_app: [
    "iMessage app message that opens a seat picker for an existing booking",
    "iMessage app message that launches our loyalty card app",
    "iMessage app message that opens a payment app for an outstanding invoice",
  ],
  rich_link: [
    "Rich link to an order tracking page with a hero image and the order number in the title",
    "Rich link to a product page including the product name and price",
    "Rich link announcing a new blog post with its headline image",
  ],
};

export function templateExamples(messageType: RawMessageType): string[] {
  return [...(BY_TYPE[messageType] ?? []), ...GENERIC];
}
