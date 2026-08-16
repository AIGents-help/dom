import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { sendNotification, type EmailType } from "@/lib/resend/client";
import { clientMissionScheduled, clientPilotAssigned, missionCompleted } from "@/lib/resend/templates";

type ClientMissionEvent =
  | { type: "pilot_assigned" }
  | { type: "date_scheduled"; scheduledFor: string; rescheduled: boolean }
  | { type: "mission_complete" };

export async function sendClientMissionUpdate(assignmentId: string, event: ClientMissionEvent) {
  const admin = getSupabaseAdmin();
  const { data: assignment } = await admin
    .from("mission_assignments")
    .select(`
      id,
      contractor:contractors ( full_name ),
      job:jobs (
        id, title, location, mission_request_id,
        mission_request:mission_requests ( id, requester_name, requester_email, company, client_id )
      )
    `)
    .eq("id", assignmentId)
    .maybeSingle();
  if (!assignment) return { skipped: true, reason: "assignment not found" };

  const job: any = Array.isArray(assignment.job) ? assignment.job[0] : assignment.job;
  const mission: any = Array.isArray(job?.mission_request) ? job.mission_request[0] : job?.mission_request;
  const pilot: any = Array.isArray(assignment.contractor) ? assignment.contractor[0] : assignment.contractor;
  if (!job || !mission) return { skipped: true, reason: "mission record not found" };

  let clientEmail: string | null = mission.requester_email;
  let clientName = mission.requester_name ?? mission.company ?? "there";
  if (mission.client_id) {
    const { data: client } = await admin.from("clients").select("email, contact_name").eq("id", mission.client_id).maybeSingle();
    if (client?.email) clientEmail = client.email;
    if (client?.contact_name) clientName = client.contact_name;
  }
  if (!clientEmail) return { skipped: true, reason: "no client email" };

  const eventKey = event.type === "date_scheduled"
    ? `${event.type}:${assignmentId}:${event.scheduledFor}`
    : `${event.type}:${assignmentId}`;
  const { data: existing } = await admin
    .from("notification_log")
    .select("id")
    .eq("assignment_id", assignmentId)
    .eq("metadata->>event_key", eventKey)
    .in("status", ["queued", "sent", "delivered", "opened", "clicked"])
    .limit(1);
  if (existing?.length) return { skipped: true, reason: "already sent" };

  const missionTitle = job.title ?? mission.company ?? "Your Mission";
  let emailType: EmailType;
  let template: { subject: string; html: string };
  if (event.type === "pilot_assigned") {
    emailType = "mission_assigned";
    template = clientPilotAssigned({ clientName, missionTitle, pilotName: pilot?.full_name ?? "Your DOM pilot" });
  } else if (event.type === "date_scheduled") {
    emailType = "mission_rescheduled";
    template = clientMissionScheduled({
      clientName,
      missionTitle,
      scheduledDate: new Date(event.scheduledFor).toLocaleString("en-US", { dateStyle: "full", timeStyle: "short", timeZone: "America/New_York" }),
      location: job.location ?? undefined,
      rescheduled: event.rescheduled,
    });
  } else {
    emailType = "mission_completed";
    template = missionCompleted({ clientName, missionTitle });
  }

  return sendNotification({
    to: clientEmail,
    emailType,
    recipientType: "customer",
    recipientEntityId: mission.client_id ?? undefined,
    missionRequestId: mission.id,
    jobId: job.id,
    assignmentId,
    subject: template.subject,
    html: template.html,
    metadata: { event_key: eventKey, trigger: "automatic_mission_progress" },
    idempotencyKey: eventKey.replace(/:/g, "/").slice(0, 256),
  });
}
