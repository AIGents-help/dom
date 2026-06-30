import { Resend } from "resend";

const resendApiKey = process.env.RESEND_API_KEY || "re_placeholder_key";

export const resend = new Resend(resendApiKey);

const FROM_ADDRESS = process.env.RESEND_FROM_EMAIL || "Drone Operation Management <ops@droneopsman.com>";
const NOTIFY_ADDRESS = process.env.NOTIFY_EMAIL || "ops@droneopsman.com";

export async function sendMissionRequestEmails(payload: {
  contactName: string;
  contactEmail: string;
  company?: string;
  industry?: string;
  serviceType?: string;
  details?: string;
}) {
  // Internal notification to the ops team
  await resend.emails.send({
    from: FROM_ADDRESS,
    to: NOTIFY_ADDRESS,
    subject: `New Mission Request — ${payload.contactName}`,
    html: `
      <h2>New Mission Request</h2>
      <p><strong>Name:</strong> ${payload.contactName}</p>
      <p><strong>Email:</strong> ${payload.contactEmail}</p>
      <p><strong>Company:</strong> ${payload.company || "N/A"}</p>
      <p><strong>Industry:</strong> ${payload.industry || "N/A"}</p>
      <p><strong>Service:</strong> ${payload.serviceType || "N/A"}</p>
      <p><strong>Details:</strong> ${payload.details || "N/A"}</p>
    `,
  });

  // Confirmation to the requester
  await resend.emails.send({
    from: FROM_ADDRESS,
    to: payload.contactEmail,
    subject: "Mission Request Received — Drone Operation Management",
    html: `
      <p>Hi ${payload.contactName},</p>
      <p>Thank you for submitting a mission request to Drone Operation Management. Our operations team will review your request and follow up within one business day with scope, FAA airspace authorization status, and scheduling options.</p>
      <p>— Drone Operation Management</p>
    `,
  });
}
