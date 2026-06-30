import { Client } from "@notionhq/client";

const notionApiKey = process.env.NOTION_API_KEY || "";
const missionsDatabaseId = process.env.NOTION_MISSIONS_DB_ID || "";
const leadsDatabaseId = process.env.NOTION_LEADS_DB_ID || "";

export const notion = new Client({ auth: notionApiKey });

/**
 * Push a new mission request into the Notion "Mission Requests" database.
 * Expects a Notion database with properties: Name (title), Email, Company,
 * Industry, Service Type, Status (select), Details (rich_text).
 */
export async function createNotionMissionRequest(payload: {
  contactName: string;
  contactEmail: string;
  company?: string;
  industry?: string;
  serviceType?: string;
  details?: string;
}) {
  if (!notionApiKey || !missionsDatabaseId) {
    console.warn("Notion not configured — skipping CRM sync.");
    return null;
  }

  return notion.pages.create({
    parent: { database_id: missionsDatabaseId },
    properties: {
      Name: { title: [{ text: { content: payload.contactName } }] },
      Email: { email: payload.contactEmail },
      Company: { rich_text: [{ text: { content: payload.company || "" } }] },
      Industry: { rich_text: [{ text: { content: payload.industry || "" } }] },
      "Service Type": { rich_text: [{ text: { content: payload.serviceType || "" } }] },
      Status: { select: { name: "New" } },
      Details: { rich_text: [{ text: { content: payload.details || "" } }] },
    },
  });
}

export async function createNotionLead(payload: {
  name: string;
  email: string;
  company?: string;
}) {
  if (!notionApiKey || !leadsDatabaseId) {
    console.warn("Notion not configured — skipping CRM sync.");
    return null;
  }

  return notion.pages.create({
    parent: { database_id: leadsDatabaseId },
    properties: {
      Name: { title: [{ text: { content: payload.name } }] },
      Email: { email: payload.email },
      Company: { rich_text: [{ text: { content: payload.company || "" } }] },
      Status: { select: { name: "New" } },
    },
  });
}
