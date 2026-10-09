import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { createClient } from "@supabase/supabase-js";
import { chromium, request } from "playwright";
import sharp from "sharp";

const isolated = process.env.E2E_ISOLATED_SUPABASE === "true";
const baseURL = (process.env.E2E_BASE_URL || "http://127.0.0.1:3000").replace(/\/$/, "");
const supabaseURL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

test("pilot-owned team mission completes without DOM approval", { skip: !isolated }, async () => {
  assert.ok(supabaseURL && anonKey && serviceKey, "isolated Supabase credentials are required");
  assert.match(supabaseURL, /^https?:\/\/(127\.0\.0\.1|localhost)(:|\/)/, "E2E database must be local");

  const admin = createClient(supabaseURL, serviceKey, { auth: { persistSession: false } });
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const password = `Dom-E2E-${stamp}!Aa1`;
  const ownerEmail = `owner-${stamp}@e2e.dom.invalid`;
  const fieldEmail = `field-${stamp}@e2e.dom.invalid`;

  const createUser = async (email) => {
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    assert.ifError(error);
    return data.user;
  };
  const ownerUser = await createUser(ownerEmail);
  const fieldUser = await createUser(fieldEmail);

  const contractorBase = {
    status: "active",
    part107_verified: true,
    insurance_verified: true,
    insurance_provider: "E2E Test Coverage",
    insurance_policy_number: `E2E-${stamp}`,
    insurance_expires_on: "2099-12-31",
    equipment: "DJI Matrice 4E",
    can_create_missions: true,
    subscription_active: true,
  };
  const { data: contractors, error: contractorError } = await admin.from("contractors").insert([
    { ...contractorBase, user_id: ownerUser.id, full_name: "E2E Mission Owner", email: ownerEmail },
    { ...contractorBase, user_id: fieldUser.id, full_name: "E2E Field Pilot", email: fieldEmail },
  ]).select("id,user_id");
  assert.ifError(contractorError);
  const ownerContractor = contractors.find((item) => item.user_id === ownerUser.id);
  const fieldContractor = contractors.find((item) => item.user_id === fieldUser.id);

  const { error: requirementError } = await admin.from("mission_capability_requirements").upsert({
    service_type: "aerial_images",
    capability: "rgb_imagery",
    required: true,
  }, { onConflict: "service_type,capability" });
  assert.ifError(requirementError);

  const { data: fieldAsset, error: fieldAssetError } = await admin.from("pilot_assets").insert({
    contractor_id: fieldContractor.id,
    asset_type: "uav",
    manufacturer: "DJI",
    model: "Matrice 4E",
    display_name: "E2E Matrice 4E",
    registration_number: "FA3TEAMFLOW",
    status: "active",
    capabilities_verified: true,
    capabilities_verified_at: new Date().toISOString(),
  }).select("id").single();
  assert.ifError(fieldAssetError);
  const { error: fieldCapError } = await admin.from("pilot_asset_capabilities").insert({
    asset_id: fieldAsset.id,
    capability: "rgb_imagery",
  });
  assert.ifError(fieldCapError);

  const signIn = async (email) => {
    const client = createClient(supabaseURL, anonKey, { auth: { persistSession: false } });
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    assert.ifError(error);
    return data.session;
  };
  const ownerSession = await signIn(ownerEmail);
  const fieldSession = await signIn(fieldEmail);
  const ownerToken = ownerSession.access_token;
  const fieldToken = fieldSession.access_token;
  const api = await request.newContext({ baseURL });
  const browser = await chromium.launch({ headless: true });

  const call = async (method, path, token, data, expected = 200) => {
    const response = await api.fetch(path, {
      method,
      headers: { Authorization: `Bearer ${token}` },
      data,
      failOnStatusCode: false,
    });
    const body = await response.json().catch(() => ({}));
    assert.equal(response.status(), expected, `${method} ${path}: ${JSON.stringify(body)}`);
    return body;
  };

  try {
    const created = await call("POST", "/api/pilot/missions/create", ownerToken, {
      clientName: "E2E Client",
      clientEmail: `client-${stamp}@e2e.dom.invalid`,
      clientCompany: "Disposable Mission Test",
      location: "Isolated CI airfield",
      latitude: 0,
      longitude: 0,
      serviceType: "aerial_images",
      distanceMiles: 5,
      siteComplexity: "simple",
      urgency: "standard",
      deliverableTier: "standard",
      travelDistanceSource: "pilot_google_maps_verified",
    });
    assert.ok(created.jobId);

    const browserErrors = [];
    const browserContext = await browser.newContext();
    const storageKey = `sb-${new URL(supabaseURL).hostname.split(".")[0]}-auth-token`;
    await browserContext.addInitScript(({ key, session }) => {
      localStorage.setItem(key, JSON.stringify(session));
    }, { key: storageKey, session: ownerSession });
    const page = await browserContext.newPage();
    page.on("pageerror", (error) => browserErrors.push(error.message));
    const dashboard = await page.goto(`${baseURL}/pilot`, { waitUntil: "networkidle", timeout: 45_000 });
    assert.ok(dashboard && dashboard.status() < 400, `pilot dashboard returned ${dashboard?.status()}`);
    await page.getByText("Disposable Mission Test", { exact: false }).first().waitFor({ timeout: 15_000 });
    assert.deepEqual(browserErrors, [], `pilot dashboard browser errors: ${browserErrors.join(" | ")}`);
    await browserContext.close();

    const { data: ownerAssignment, error: ownerAssignmentError } = await admin.from("mission_assignments")
      .select("id,job_id,status,assignment_role").eq("job_id", created.jobId).eq("contractor_id", ownerContractor.id).single();
    assert.ifError(ownerAssignmentError);
    assert.equal(ownerAssignment.assignment_role, "owner");

    await call("GET", `/api/pilot/missions/${ownerAssignment.id}/workflow`, ownerToken);
    const offered = await call("POST", `/api/pilot/missions/${ownerAssignment.id}/team`, ownerToken, {
      action: "offer",
      contractorId: fieldContractor.id,
      payoutCents: 10000,
    });
    assert.ok(offered.assignmentId);
    await call("POST", `/api/pilot/missions/${offered.assignmentId}/respond`, fieldToken, { action: "accept" });

    const tomorrow = new Date(Date.now() + 86_400_000).toISOString();
    const { error: preparationError } = await admin.from("mission_assignments")
      .update({ assigned_uav: "DJI Matrice 4E" }).in("id", [ownerAssignment.id, offered.assignmentId]);
    assert.ifError(preparationError);
    const { error: scheduleError } = await admin.from("jobs").update({ scheduled_for: tomorrow }).eq("id", created.jobId);
    assert.ifError(scheduleError);

    const workflow = await call("GET", `/api/pilot/missions/${offered.assignmentId}/workflow`, fieldToken);
    assert.equal(workflow.ownership.completionMode, "owner_review");
    const automatic = new Set(["uav_assigned", "insurance_verified", "capture_complete", "deliverables_uploaded", "mission_submitted"]);
    for (const item of workflow.items.filter((entry) => entry.required && !entry.completed && !automatic.has(entry.item_key))) {
      await call("POST", `/api/pilot/missions/${offered.assignmentId}/workflow`, fieldToken, {
        action: "checklist",
        itemId: item.id,
        completed: true,
      });
    }
    await call("POST", `/api/pilot/missions/${offered.assignmentId}/workflow`, fieldToken, { action: "check_in" });
    await call("POST", `/api/pilot/missions/${offered.assignmentId}/workflow`, fieldToken, { action: "start_flight" });
    await call("POST", `/api/pilot/missions/${offered.assignmentId}/workflow`, fieldToken, { action: "field_complete" });

    const { error: deliverableError } = await admin.from("deliverables").insert({
      job_id: created.jobId,
      name: "Disposable E2E aerial image set",
      type: "raw_images",
      storage_url: `${created.jobId}/e2e/aerial-images.zip`,
    });
    assert.ifError(deliverableError);
    const ready = await call("GET", `/api/pilot/missions/${offered.assignmentId}/workflow`, fieldToken);
    assert.equal(ready.submission.ready, true, JSON.stringify(ready.submission.blockers));
    await call("POST", `/api/pilot/missions/${offered.assignmentId}/workflow`, fieldToken, { action: "submit_for_qc" });
    await call("POST", `/api/pilot/missions/${ownerAssignment.id}/team`, ownerToken, { action: "approve" });

    const [{ data: job }, { data: mission }, { data: assignments }, { data: deliverable }] = await Promise.all([
      admin.from("jobs").select("status").eq("id", created.jobId).single(),
      admin.from("jobs").select("mission_request:mission_requests(status)").eq("id", created.jobId).single(),
      admin.from("mission_assignments").select("assignment_role,status").eq("job_id", created.jobId),
      admin.from("deliverables").select("qc_passed,delivered_at").eq("job_id", created.jobId).single(),
    ]);
    assert.equal(job.status, "delivered");
    const missionRequest = Array.isArray(mission.mission_request) ? mission.mission_request[0] : mission.mission_request;
    assert.equal(missionRequest.status, "delivered");
    assert.deepEqual(new Set(assignments.map((item) => item.status)), new Set(["qc_passed"]));
    assert.equal(deliverable.qc_passed, true);
    assert.ok(deliverable.delivered_at);
  } finally {
    await api.dispose();
    await browser.close();
    await admin.from("pilot_asset_capabilities").delete().eq("asset_id", fieldAsset.id);
    await admin.from("pilot_assets").delete().eq("id", fieldAsset.id);
    await admin.from("mission_capability_requirements").delete().eq("service_type", "aerial_images").eq("capability", "rgb_imagery");
    await admin.auth.admin.deleteUser(fieldUser.id);
    await admin.auth.admin.deleteUser(ownerUser.id);
  }
});


test("admin-authorized uninsured pilot creates a ready self-service mission", { skip: !isolated }, async () => {
  assert.ok(supabaseURL && anonKey && serviceKey, "isolated Supabase credentials are required");
  assert.match(supabaseURL, /^https?:\/\/(127\.0\.0\.1|localhost)(:|\/)/, "E2E database must be local");

  const admin = createClient(supabaseURL, serviceKey, { auth: { persistSession: false } });
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const password = `Dom-Uninsured-E2E-${stamp}!Aa1`;
  const pilotEmail = `uninsured-owner-${stamp}@e2e.dom.invalid`;

  const { data: createdUser, error: userError } = await admin.auth.admin.createUser({
    email: pilotEmail,
    password,
    email_confirm: true,
  });
  assert.ifError(userError);
  const pilotUser = createdUser.user;

  const { data: pilot, error: contractorError } = await admin.from("contractors").insert({
    user_id: pilotUser.id,
    full_name: "E2E Authorized Uninsured Pilot",
    email: pilotEmail,
    status: "active",
    part107_verified: true,
    insurance_verified: false,
    insurance_expires_on: null,
    uninsured_self_service_eligible: true,
    can_create_missions: true,
    subscription_active: true,
    stripe_payouts_enabled: true,
    equipment: "DJI Matrice 4E",
  }).select("id").single();
  assert.ifError(contractorError);

  const authClient = createClient(supabaseURL, anonKey, { auth: { persistSession: false } });
  const { data: signedIn, error: signInError } = await authClient.auth.signInWithPassword({
    email: pilotEmail,
    password,
  });
  assert.ifError(signInError);
  const session = signedIn.session;
  const token = session.access_token;
  const api = await request.newContext({ baseURL });
  const browser = await chromium.launch({ headless: true });

  const missionPayload = {
    clientName: "Uninsured E2E Client",
    clientEmail: `uninsured-client-${stamp}@e2e.dom.invalid`,
    clientCompany: "Authorized Self Service Test",
    location: "Isolated CI airfield",
    latitude: 0,
    longitude: 0,
    serviceType: "aerial_images",
    distanceMiles: 5,
    siteComplexity: "simple",
    urgency: "standard",
    deliverableTier: "standard",
    travelDistanceSource: "pilot_google_maps_verified",
  };

  try {
    const rejected = await api.post("/api/pilot/missions/create", {
      headers: { Authorization: `Bearer ${token}` },
      data: missionPayload,
      failOnStatusCode: false,
    });
    assert.equal(rejected.status(), 409);
    const rejectedBody = await rejected.json();
    assert.match(rejectedBody.error, /acknowledgement/i);

    const customQuote = await api.post("/api/quote", {
      data: {
        serviceType: "custom",
        lat: 0,
        lng: 0,
        distanceMiles: 5,
        siteComplexity: "simple",
        urgency: "standard",
        deliverableTier: "enhanced",
      },
      failOnStatusCode: false,
    });
    const customQuoteBody = await customQuote.json().catch(() => ({}));
    assert.equal(customQuote.status(), 200, JSON.stringify(customQuoteBody));
    assert.ok(customQuoteBody.quote.totalCents > 0, "custom mission should receive a system-generated quote");

    const draftSave = await api.post("/api/pilot/missions/draft", {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        clientName: missionPayload.clientName,
        clientEmail: `custom-client-${stamp}@e2e.dom.invalid`,
        clientCompany: missionPayload.clientCompany,
        clientPhone: "555-0100",
        location: missionPayload.location,
        latitude: missionPayload.latitude,
        longitude: missionPayload.longitude,
        airspace: { airspace_class: "G", authorization_summary: "No authorization required", nearest_airport: null },
        travelOrigin: "E2E dispatch point",
        distanceMiles: missionPayload.distanceMiles,
        serviceType: "custom",
        customMissionTitle: "E2E Custom 3D Object",
        customMissionScope: "Create a detailed 3D model of a test object.",
        customDeliverables: "",
        siteComplexity: missionPayload.siteComplexity,
        urgency: missionPayload.urgency,
        deliverableTier: "enhanced",
        billingMode: "paid",
        quote: {
          serviceLabel: customQuoteBody.quote.serviceLabel,
          totalCents: customQuoteBody.quote.totalCents,
          referenceTotalCents: customQuoteBody.quote.totalCents,
          warnings: customQuoteBody.quote.warnings ?? [],
        },
      },
      failOnStatusCode: false,
    });
    const draftSaveBody = await draftSave.json().catch(() => ({}));
    assert.equal(draftSave.status(), 200, JSON.stringify(draftSaveBody));
    assert.ok(draftSaveBody.draft?.id);

    const { data: persistedDraft, error: persistedDraftError } = await admin.from("pilot_mission_drafts")
      .select("id,contractor_id,service_type,custom_mission_title,quote")
      .eq("id", draftSaveBody.draft.id)
      .single();
    assert.ifError(persistedDraftError);
    assert.equal(persistedDraft.contractor_id, pilot.id);
    assert.equal(persistedDraft.service_type, "custom");
    assert.equal(persistedDraft.custom_mission_title, "E2E Custom 3D Object");
    assert.equal(persistedDraft.quote.totalCents, customQuoteBody.quote.totalCents);

    const customMission = await api.post("/api/pilot/missions/create", {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        ...missionPayload,
        clientEmail: `custom-client-${stamp}@e2e.dom.invalid`,
        serviceType: "custom",
        customMissionTitle: "E2E Custom 3D Object",
        customMissionScope: "Create a detailed 3D model of a test object.",
        customDeliverables: "",
        deliverableTier: "enhanced",
        billingMode: "paid",
        draftId: draftSaveBody.draft.id,
        uninsuredAcknowledged: true,
      },
      failOnStatusCode: false,
    });
    const customMissionBody = await customMission.json().catch(() => ({}));
    assert.equal(customMission.status(), 200, JSON.stringify(customMissionBody));
    assert.ok(customMissionBody.jobId);
    assert.ok(customMissionBody.quote.totalCents > 0);

    const { data: deletedDraft, error: deletedDraftError } = await admin.from("pilot_mission_drafts")
      .select("id")
      .eq("id", draftSaveBody.draft.id)
      .maybeSingle();
    assert.ifError(deletedDraftError);
    assert.equal(deletedDraft, null, "draft should be removed only after mission creation succeeds");

    const missingFreeReason = await api.post("/api/pilot/missions/create", {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        ...missionPayload,
        clientEmail: `free-missing-reason-${stamp}@e2e.dom.invalid`,
        billingMode: "no_charge",
        uninsuredAcknowledged: true,
      },
      failOnStatusCode: false,
    });
    assert.equal(missingFreeReason.status(), 400);

    const freeMission = await api.post("/api/pilot/missions/create", {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        ...missionPayload,
        clientEmail: `free-client-${stamp}@e2e.dom.invalid`,
        billingMode: "no_charge",
        noChargeReason: "demo_portfolio",
        uninsuredAcknowledged: true,
      },
      failOnStatusCode: false,
    });
    const freeMissionBody = await freeMission.json().catch(() => ({}));
    assert.equal(freeMission.status(), 200, JSON.stringify(freeMissionBody));
    assert.ok(freeMissionBody.jobId);
    assert.equal(freeMissionBody.quote.totalCents, 0);
    assert.ok(freeMissionBody.quote.referenceTotalCents > 0);
    assert.equal(freeMissionBody.quote.contractorCents, 0);
    assert.equal(freeMissionBody.quote.commissionCents, 0);
    assert.equal(freeMissionBody.quote.billingMode, "no_charge");

    const { data: freeAssignment, error: freeAssignmentError } = await admin.from("mission_assignments")
      .select("id,mission_price_cents,contractor_payout_cents,dom_commission_cents")
      .eq("job_id", freeMissionBody.jobId)
      .eq("contractor_id", pilot.id)
      .single();
    assert.ifError(freeAssignmentError);
    assert.equal(freeAssignment.mission_price_cents, 0);
    assert.equal(freeAssignment.contractor_payout_cents, 0);
    assert.equal(freeAssignment.dom_commission_cents, 0);

    const { data: freeAudit, error: freeAuditError } = await admin.from("mission_activity_events")
      .select("event_type,details")
      .eq("assignment_id", freeAssignment.id)
      .eq("event_type", "no_charge_mission_created")
      .single();
    assert.ifError(freeAuditError);
    assert.equal(freeAudit.event_type, "no_charge_mission_created");
    assert.equal(freeAudit.details.reason, "demo_portfolio");
    assert.ok(freeAudit.details.reference_total_cents > 0);

    const accepted = await api.post("/api/pilot/missions/create", {
      headers: { Authorization: `Bearer ${token}` },
      data: { ...missionPayload, uninsuredAcknowledged: true },
      failOnStatusCode: false,
    });
    const acceptedBody = await accepted.json().catch(() => ({}));
    assert.equal(accepted.status(), 200, JSON.stringify(acceptedBody));
    assert.ok(acceptedBody.jobId);

    const { data: assignment, error: assignmentError } = await admin.from("mission_assignments")
      .select("id,insurance_source,mission_insurance_verified,mission_insurance_reference")
      .eq("job_id", acceptedBody.jobId)
      .eq("contractor_id", pilot.id)
      .single();
    assert.ifError(assignmentError);
    assert.equal(assignment.insurance_source, "pilot_uninsured_acknowledgement");
    assert.equal(assignment.mission_insurance_verified, false);
    assert.equal(assignment.mission_insurance_reference, "pilot-uninsured-responsibility-v1");

    const { data: auditEvent, error: auditError } = await admin.from("mission_activity_events")
      .select("event_type,summary")
      .eq("assignment_id", assignment.id)
      .eq("event_type", "uninsured_responsibility_acknowledged")
      .single();
    assert.ifError(auditError);
    assert.equal(auditEvent.event_type, "uninsured_responsibility_acknowledged");

    const workflowResponse = await api.get(`/api/pilot/missions/${assignment.id}/workflow`, {
      headers: { Authorization: `Bearer ${token}` },
      failOnStatusCode: false,
    });
    const workflow = await workflowResponse.json().catch(() => ({}));
    assert.equal(workflowResponse.status(), 200, JSON.stringify(workflow));
    assert.equal(workflow.insurance.satisfied, true);
    assert.equal(workflow.insurance.verified, false);
    assert.equal(workflow.insurance.uninsuredAcknowledged, true);
    assert.equal(workflow.readiness.blockers.includes("Select an insurance or uninsured-responsibility path"), false);

    const browserErrors = [];
    const browserContext = await browser.newContext();
    const storageKey = `sb-${new URL(supabaseURL).hostname.split(".")[0]}-auth-token`;
    await browserContext.addInitScript(({ key, authSession }) => {
      localStorage.setItem(key, JSON.stringify(authSession));
    }, { key: storageKey, authSession: session });
    const page = await browserContext.newPage();
    page.on("pageerror", (error) => browserErrors.push(error.message));
    const dashboard = await page.goto(`${baseURL}/pilot`, { waitUntil: "networkidle", timeout: 45_000 });
    assert.ok(dashboard && dashboard.status() < 400, `pilot dashboard returned ${dashboard?.status()}`);
    await page.getByText("Self-service mission authorization active", { exact: false }).waitFor({ timeout: 15_000 });
    assert.equal(await page.getByText("Your credentials are not fully verified yet.", { exact: false }).count(), 0);
    assert.deepEqual(browserErrors, [], `pilot dashboard browser errors: ${browserErrors.join(" | ")}`);
    await browserContext.close();
  } finally {
    await api.dispose();
    await browser.close();
    await admin.auth.admin.deleteUser(pilotUser.id);
  }
});


test("non-admin authenticated user cannot render the admin console", { skip: !isolated }, async () => {
  assert.ok(supabaseURL && anonKey && serviceKey, "isolated Supabase credentials are required");
  assert.match(supabaseURL, /^https?:\/\/(127\.0\.0\.1|localhost)(:|\/)/, "E2E database must be local");

  const admin = createClient(supabaseURL, serviceKey, { auth: { persistSession: false } });
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const email = `non-admin-${stamp}@e2e.dom.invalid`;
  const password = `Dom-Role-E2E-${stamp}!Aa1`;

  const { data: createdUser, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  assert.ifError(createError);
  assert.ok(createdUser.user);

  const anon = createClient(supabaseURL, anonKey, { auth: { persistSession: false } });
  const { data: signInData, error: signInError } = await anon.auth.signInWithPassword({ email, password });
  assert.ifError(signInError);
  assert.ok(signInData.session);

  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext();
    const storageKey = `sb-${new URL(supabaseURL).hostname.split(".")[0]}-auth-token`;
    await context.addInitScript(({ key, session }) => {
      localStorage.setItem(key, JSON.stringify(session));
    }, { key: storageKey, session: signInData.session });

    const page = await context.newPage();
    await page.goto(`${baseURL}/admin/dashboard`, { waitUntil: "networkidle", timeout: 45_000 });
    await page.waitForURL("**/admin/login", { timeout: 15_000 });
    assert.equal(await page.getByText("Admin Dashboard", { exact: true }).count(), 0);
    await context.close();
  } finally {
    await browser.close();
    await admin.auth.admin.deleteUser(createdUser.user.id);
  }
});


test("client portal isolates each client to its own missions", { skip: !isolated }, async () => {
  assert.ok(supabaseURL && anonKey && serviceKey, "isolated Supabase credentials are required");
  assert.match(supabaseURL, /^https?:\/\/(127\.0\.0\.1|localhost)(:|\/)/, "E2E database must be local");

  const admin = createClient(supabaseURL, serviceKey, { auth: { persistSession: false } });
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const password = `Dom-Client-E2E-${stamp}!Aa1`;
  const emails = [
    `client-a-${stamp}@e2e.dom.invalid`,
    `client-b-${stamp}@e2e.dom.invalid`,
  ];

  const users = [];
  for (const email of emails) {
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    assert.ifError(error);
    users.push(data.user);
  }

  const { data: clients, error: clientsError } = await admin.from("clients").insert([
    { company_name: "E2E Client A", contact_name: "Client A", email: emails[0], user_id: users[0].id },
    { company_name: "E2E Client B", contact_name: "Client B", email: emails[1], user_id: users[1].id },
  ]).select("id,user_id");
  assert.ifError(clientsError);

  const clientA = clients.find((item) => item.user_id === users[0].id);
  const clientB = clients.find((item) => item.user_id === users[1].id);
  assert.ok(clientA && clientB);

  const { data: missions, error: missionError } = await admin.from("mission_requests").insert([
    { client_id: clientA.id, requester_name: "Client A", requester_email: emails[0], company: "E2E Client A", service_type: "aerial_images", location: "Client A Site", status: "approved" },
    { client_id: clientB.id, requester_name: "Client B", requester_email: emails[1], company: "E2E Client B", service_type: "aerial_images", location: "Client B Site", status: "approved" },
  ]).select("id,client_id");
  assert.ifError(missionError);

  const missionA = missions.find((item) => item.client_id === clientA.id);
  const missionB = missions.find((item) => item.client_id === clientB.id);
  assert.ok(missionA && missionB);

  const { error: jobError } = await admin.from("jobs").insert([
    { mission_request_id: missionA.id, client_id: clientA.id, title: "E2E Private Mission A", service_type: "aerial_images", location: "Client A Site", status: "scheduled" },
    { mission_request_id: missionB.id, client_id: clientB.id, title: "E2E Private Mission B", service_type: "aerial_images", location: "Client B Site", status: "scheduled" },
  ]);
  assert.ifError(jobError);

  const api = await request.newContext({ baseURL });
  try {
    for (let index = 0; index < 2; index += 1) {
      const auth = createClient(supabaseURL, anonKey, { auth: { persistSession: false } });
      const { data: signedIn, error: signInError } = await auth.auth.signInWithPassword({ email: emails[index], password });
      assert.ifError(signInError);
      assert.ok(signedIn.session);

      const response = await api.get("/api/client/access", {
        headers: { Authorization: `Bearer ${signedIn.session.access_token}` },
        failOnStatusCode: false,
      });
      const body = await response.json().catch(() => ({}));
      assert.equal(response.status(), 200, JSON.stringify(body));

      const ownTitle = index === 0 ? "E2E Private Mission A" : "E2E Private Mission B";
      const otherTitle = index === 0 ? "E2E Private Mission B" : "E2E Private Mission A";
      assert.equal(body.jobs.length, 1);
      assert.equal(body.jobs[0].title, ownTitle);
      assert.equal(body.jobs.some((job) => job.title === otherTitle), false);
    }
  } finally {
    await api.dispose();
    await admin.from("jobs").delete().in("mission_request_id", [missionA.id, missionB.id]);
    await admin.from("mission_requests").delete().in("id", [missionA.id, missionB.id]);
    await admin.from("clients").delete().in("id", [clientA.id, clientB.id]);
    for (const user of users) await admin.auth.admin.deleteUser(user.id);
  }
});


test("commercial mission equipment requires FAA registration before assignment", { skip: !isolated }, async () => {
  assert.ok(supabaseURL && anonKey && serviceKey, "isolated Supabase credentials are required");
  assert.match(supabaseURL, /^https?:\/\/(127\.0\.0\.1|localhost)(:|\/)/, "E2E database must be local");

  const admin = createClient(supabaseURL, serviceKey, { auth: { persistSession: false } });
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const email = `faa-pilot-${stamp}@e2e.dom.invalid`;
  const password = `Dom-FAA-E2E-${stamp}!Aa1`;

  const { data: createdUser, error: userError } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  assert.ifError(userError);
  const pilotUser = createdUser.user;
  assert.ok(pilotUser);

  const { data: contractor, error: contractorError } = await admin.from("contractors").insert({
    user_id: pilotUser.id,
    full_name: "E2E FAA Pilot",
    email,
    status: "active",
    part107_verified: true,
    insurance_verified: true,
    insurance_provider: "E2E Coverage",
    insurance_policy_number: `E2E-${stamp}`,
    insurance_expires_on: "2099-12-31",
    can_create_missions: true,
  }).select("id").single();
  assert.ifError(contractorError);

  const { data: mission, error: missionError } = await admin.from("mission_requests").insert({
    requester_name: "FAA Test Client",
    requester_email: `faa-client-${stamp}@e2e.dom.invalid`,
    company: "FAA Registration E2E",
    service_type: "roof_inspection_residential",
    location: "FAA Test Site",
    status: "approved",
  }).select("id").single();
  assert.ifError(missionError);

  const { data: job, error: jobError } = await admin.from("jobs").insert({
    mission_request_id: mission.id,
    title: "FAA Registration Mission",
    service_type: "roof_inspection_residential",
    location: "FAA Test Site",
    status: "scheduled",
  }).select("id").single();
  assert.ifError(jobError);

  const { data: assignment, error: assignmentError } = await admin.from("mission_assignments").insert({
    job_id: job.id,
    contractor_id: contractor.id,
    status: "accepted",
  }).select("id").single();
  assert.ifError(assignmentError);

  const { data: asset, error: assetError } = await admin.from("pilot_assets").insert({
    contractor_id: contractor.id,
    asset_type: "uav",
    manufacturer: "DJI",
    model: "Avata 2",
    display_name: "FAA Test Avata 2",
    status: "active",
  }).select("id").single();
  assert.ifError(assetError);

  const anon = createClient(supabaseURL, anonKey, { auth: { persistSession: false } });
  const { data: signedIn, error: signInError } = await anon.auth.signInWithPassword({ email, password });
  assert.ifError(signInError);
  assert.ok(signedIn.session);

  const api = await request.newContext({ baseURL });
  try {
    const rejected = await api.post(`/api/pilot/missions/${assignment.id}/assets`, {
      headers: { Authorization: `Bearer ${signedIn.session.access_token}` },
      data: { assetIds: [asset.id] },
      failOnStatusCode: false,
    });
    const rejectedBody = await rejected.json().catch(() => ({}));
    assert.equal(rejected.status(), 409, JSON.stringify(rejectedBody));
    assert.match(rejectedBody.error ?? "", /FAA registration/i);

    const { error: registrationError } = await admin.from("pilot_assets")
      .update({ registration_number: "FA3E2ETEST" })
      .eq("id", asset.id);
    assert.ifError(registrationError);

    const accepted = await api.post(`/api/pilot/missions/${assignment.id}/assets`, {
      headers: { Authorization: `Bearer ${signedIn.session.access_token}` },
      data: { assetIds: [asset.id] },
      failOnStatusCode: false,
    });
    const acceptedBody = await accepted.json().catch(() => ({}));
    assert.equal(accepted.status(), 200, JSON.stringify(acceptedBody));
    assert.deepEqual(acceptedBody.assetIds, [asset.id]);
  } finally {
    await api.dispose();
    await admin.from("mission_asset_assignments").delete().eq("mission_assignment_id", assignment.id);
    await admin.from("pilot_assets").delete().eq("id", asset.id);
    await admin.from("mission_assignments").delete().eq("id", assignment.id);
    await admin.from("jobs").delete().eq("id", job.id);
    await admin.from("mission_requests").delete().eq("id", mission.id);
    await admin.from("contractors").delete().eq("id", contractor.id);
    await admin.auth.admin.deleteUser(pilotUser.id);
  }
});


test("confirmed client login safely links an unbound client profile", { skip: !isolated }, async () => {
  assert.ok(supabaseURL && anonKey && serviceKey, "isolated Supabase credentials are required");
  assert.match(supabaseURL, /^https?:\/\/(127\.0\.0\.1|localhost)(:|\/)/, "E2E database must be local");

  const admin = createClient(supabaseURL, serviceKey, { auth: { persistSession: false } });
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const email = `client-link-${stamp}@e2e.dom.invalid`;
  const password = `Dom-Client-Link-${stamp}!Aa1`;

  const { data: createdUser, error: userError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  assert.ifError(userError);
  assert.ok(createdUser.user);

  const { data: client, error: clientError } = await admin.from("clients").insert({
    company_name: "E2E Unlinked Client",
    contact_name: "E2E Client",
    email,
    user_id: null,
  }).select("id,user_id").single();
  assert.ifError(clientError);
  assert.equal(client.user_id, null);

  const api = await request.newContext({ baseURL });
  try {
    const response = await api.post("/api/client/access", {
      data: { email, password, action: "login" },
      failOnStatusCode: false,
    });
    const body = await response.json().catch(() => ({}));
    assert.equal(response.status(), 200, JSON.stringify(body));
    assert.ok(body.session?.access_token);

    const { data: linked, error: linkedError } = await admin.from("clients")
      .select("user_id")
      .eq("id", client.id)
      .single();
    assert.ifError(linkedError);
    assert.equal(linked.user_id, createdUser.user.id);
  } finally {
    await api.dispose();
    await admin.from("clients").delete().eq("id", client.id);
    await admin.auth.admin.deleteUser(createdUser.user.id);
  }
});


test("client cannot approve another client's quote", { skip: !isolated }, async () => {
  assert.ok(supabaseURL && anonKey && serviceKey, "isolated Supabase credentials are required");
  assert.match(supabaseURL, /^https?:\/\/(127\.0\.0\.1|localhost)(:|\/)/, "E2E database must be local");

  const admin = createClient(supabaseURL, serviceKey, { auth: { persistSession: false } });
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const password = `Dom-Quote-E2E-${stamp}!Aa1`;
  const emails = [
    `quote-a-${stamp}@e2e.dom.invalid`,
    `quote-b-${stamp}@e2e.dom.invalid`,
  ];

  const users = [];
  for (const email of emails) {
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    assert.ifError(error);
    users.push(data.user);
  }

  const { data: clients, error: clientsError } = await admin.from("clients").insert([
    { company_name: "Quote Client A", contact_name: "A", email: emails[0], user_id: users[0].id },
    { company_name: "Quote Client B", contact_name: "B", email: emails[1], user_id: users[1].id },
  ]).select("id,user_id");
  assert.ifError(clientsError);
  const clientA = clients.find((item) => item.user_id === users[0].id);
  const clientB = clients.find((item) => item.user_id === users[1].id);
  assert.ok(clientA && clientB);

  const { data: missionB, error: missionError } = await admin.from("mission_requests").insert({
    client_id: clientB.id,
    requester_name: "B",
    requester_email: emails[1],
    company: "Quote Client B",
    service_type: "aerial_images",
    location: "Quote B Site",
    status: "quoted",
  }).select("id").single();
  assert.ifError(missionError);

  const { data: quote, error: quoteError } = await admin.from("quotes").insert({
    mission_request_id: missionB.id,
    service_type: "aerial_images",
    base_price_cents: 10000,
    location_mod: 1,
    airspace_mod: 1,
    complexity_mod: 1,
    urgency_mod: 1,
    deliverable_mod: 1,
    combined_multiplier: 1,
    total_cents: 10000,
    commission_cents: 2000,
    contractor_cents: 8000,
    version_number: 1,
    status: "sent",
    sent_at: new Date().toISOString(),
  }).select("id,status").single();
  assert.ifError(quoteError);

  const authA = createClient(supabaseURL, anonKey, { auth: { persistSession: false } });
  const { data: signedInA, error: signInError } = await authA.auth.signInWithPassword({ email: emails[0], password });
  assert.ifError(signInError);
  assert.ok(signedInA.session);

  const api = await request.newContext({ baseURL });
  try {
    const response = await api.post(`/api/client/commercial/quote/${quote.id}`, {
      headers: { Authorization: `Bearer ${signedInA.session.access_token}` },
      data: { decision: "accepted" },
      failOnStatusCode: false,
    });
    const body = await response.json().catch(() => ({}));
    assert.equal(response.status(), 404, JSON.stringify(body));

    const { data: unchanged, error: unchangedError } = await admin.from("quotes")
      .select("status,responded_by")
      .eq("id", quote.id)
      .single();
    assert.ifError(unchangedError);
    assert.equal(unchanged.status, "sent");
    assert.equal(unchanged.responded_by, null);
  } finally {
    await api.dispose();
    await admin.from("quotes").delete().eq("id", quote.id);
    await admin.from("mission_requests").delete().eq("id", missionB.id);
    await admin.from("clients").delete().in("id", [clientA.id, clientB.id]);
    for (const user of users) await admin.auth.admin.deleteUser(user.id);
  }
});


test("admin product stock updates persist to the public catalog", { skip: !isolated }, async () => {
  assert.ok(supabaseURL && serviceKey, "isolated Supabase credentials are required");
  assert.match(supabaseURL, /^https?:\/\/(127\.0\.0\.1|localhost)(:|\/)/, "E2E database must be local");

  const admin = createClient(supabaseURL, serviceKey, { auth: { persistSession: false } });
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const productKey = `e2e-stock-${stamp}`;

  const { error: insertError } = await admin.from("shop_inventory").insert({
    product_key: productKey,
    product_name: "E2E Stock Product",
    description: "Inventory persistence regression fixture",
    unit_amount_cents: 2500,
    variants: [],
    category: "Equipment",
    active: true,
    fulfillment_mode: "stocked",
    available_quantity: 3,
    shipping_base_cents: 0,
    shipping_additional_cents: 0,
  });
  assert.ifError(insertError);

  try {
    const { data: saved, error: updateError } = await admin.rpc("admin_update_shop_product_service", {
      p_product_key: productKey,
      p_product_name: "E2E Stock Product",
      p_description: "Inventory persistence regression fixture",
      p_unit_amount_cents: 2500,
      p_variants: [],
      p_category: "Equipment",
      p_image_url: "",
      p_fulfillment_mode: "stocked",
      p_available_quantity: 17,
      p_shipping_base_cents: 0,
      p_shipping_additional_cents: 0,
      p_active: true,
    });
    assert.ifError(updateError);
    assert.equal(saved.available_quantity, 17);

    const api = await request.newContext({ baseURL });
    try {
      const response = await api.get("/api/admin/store/products", { failOnStatusCode: false });
      assert.equal(response.status(), 200);
      const body = await response.json();
      assert.equal(body.access, "catalog");
      const publicProduct = body.products.find((item) => item.product_key === productKey);
      assert.ok(publicProduct, "active product should be visible in the public catalog");
      assert.equal(publicProduct.available_quantity, 17);
    } finally {
      await api.dispose();
    }

    const { data: persisted, error: persistedError } = await admin.from("shop_inventory")
      .select("available_quantity")
      .eq("product_key", productKey)
      .single();
    assert.ifError(persistedError);
    assert.equal(persisted.available_quantity, 17);
  } finally {
    await admin.from("shop_inventory").delete().eq("product_key", productKey);
  }
});


test("admin CRM workspace returns newly created leads", { skip: !isolated }, async () => {
  assert.ok(supabaseURL && anonKey && serviceKey, "isolated Supabase credentials are required");
  assert.match(supabaseURL, /^https?:\/\/(127\.0\.0\.1|localhost)(:|\/)/, "E2E database must be local");

  const admin = createClient(supabaseURL, serviceKey, { auth: { persistSession: false } });
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const email = `admin-crm-${stamp}@e2e.dom.invalid`;
  const password = `Dom-CRM-E2E-${stamp}!Aa1`;
  const leadEmail = `lead-${stamp}@e2e.dom.invalid`;

  const { data: createdUser, error: userError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  assert.ifError(userError);
  assert.ok(createdUser.user);

  const { error: allowError } = await admin.from("admin_users").insert({
    email,
    full_name: "E2E CRM Admin",
    role: "admin",
  });
  assert.ifError(allowError);

  const { data: lead, error: leadError } = await admin.from("leads").insert({
    name: "E2E CRM Lead",
    email: leadEmail,
    company: "E2E CRM Company",
    source: "e2e",
    status: "new",
  }).select("id").single();
  assert.ifError(leadError);

  const auth = createClient(supabaseURL, anonKey, { auth: { persistSession: false } });
  const { data: signedIn, error: signInError } = await auth.auth.signInWithPassword({ email, password });
  assert.ifError(signInError);
  assert.ok(signedIn.session);

  const api = await request.newContext({ baseURL });
  try {
    const response = await api.get("/api/admin/leads/workspace", {
      headers: { Authorization: `Bearer ${signedIn.session.access_token}` },
      failOnStatusCode: false,
    });
    const body = await response.json().catch(() => ({}));
    assert.equal(response.status(), 200, JSON.stringify(body));
    assert.ok(body.leads.some((item) => item.id === lead.id && item.email === leadEmail));
    assert.ok(body.meta.totalLeadCount >= 1);
  } finally {
    await api.dispose();
    await admin.from("leads").delete().eq("id", lead.id);
    await admin.from("admin_users").delete().eq("email", email);
    await admin.auth.admin.deleteUser(createdUser.user.id);
  }
});


test("shop refund restores reserved stocked inventory exactly once", { skip: !isolated }, async () => {
  assert.ok(supabaseURL && serviceKey, "isolated Supabase credentials are required");
  assert.match(supabaseURL, /^https?:\/\/(127\.0\.0\.1|localhost)(:|\/)/, "E2E database must be local");

  const admin = createClient(supabaseURL, serviceKey, { auth: { persistSession: false } });
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const productKey = `e2e-refund-${stamp}`;
  const orderId = crypto.randomUUID();
  const sessionId = `cs_e2e_${stamp}`;
  const paymentIntentId = `pi_e2e_${stamp}`;

  const { error: inventoryError } = await admin.from("shop_inventory").insert({
    product_key: productKey,
    product_name: "E2E Refund Product",
    description: "Refund inventory regression fixture",
    unit_amount_cents: 1200,
    variants: [],
    category: "Equipment",
    active: true,
    fulfillment_mode: "stocked",
    available_quantity: 10,
    shipping_base_cents: 0,
    shipping_additional_cents: 0,
  });
  assert.ifError(inventoryError);

  try {
    const { error: checkoutError } = await admin.rpc("create_shop_checkout_service", {
      p_order_id: orderId,
      p_order_number: `E2E-${stamp}`,
      p_session_id: sessionId,
      p_product_key: productKey,
      p_product_name: "E2E Refund Product",
      p_variant: "",
      p_quantity: 3,
      p_unit_amount_cents: 1200,
      p_shipping_cents: 0,
    });
    assert.ifError(checkoutError);

    const { data: reserved, error: reservedError } = await admin.from("shop_inventory")
      .select("available_quantity")
      .eq("product_key", productKey)
      .single();
    assert.ifError(reservedError);
    assert.equal(reserved.available_quantity, 7);

    const { error: completeError } = await admin.rpc("complete_shop_order_service", {
      p_session_id: sessionId,
      p_payment_intent_id: paymentIntentId,
      p_customer_email: `refund-${stamp}@e2e.dom.invalid`,
      p_customer_name: "Refund Test",
      p_customer_phone: null,
      p_currency: "usd",
      p_subtotal_cents: 3600,
      p_shipping_cents: 0,
      p_tax_cents: 0,
      p_discount_cents: 0,
      p_total_cents: 3600,
      p_shipping_name: "Refund Test",
      p_shipping_address: {},
    });
    assert.ifError(completeError);

    const { data: refunded, error: refundError } = await admin.rpc("refund_shop_order_service", {
      p_order_id: orderId,
    });
    assert.ifError(refundError);
    assert.equal(refunded, true);

    const { data: restored, error: restoredError } = await admin.from("shop_inventory")
      .select("available_quantity")
      .eq("product_key", productKey)
      .single();
    assert.ifError(restoredError);
    assert.equal(restored.available_quantity, 10);

    const { data: secondRefund, error: secondRefundError } = await admin.rpc("refund_shop_order_service", {
      p_order_id: orderId,
    });
    assert.ifError(secondRefundError);
    assert.equal(secondRefund, false);

    const { data: unchanged, error: unchangedError } = await admin.from("shop_inventory")
      .select("available_quantity")
      .eq("product_key", productKey)
      .single();
    assert.ifError(unchangedError);
    assert.equal(unchanged.available_quantity, 10);
  } finally {
    await admin.from("shop_order_items").delete().eq("order_id", orderId);
    await admin.from("shop_orders").delete().eq("id", orderId);
    await admin.from("shop_inventory").delete().eq("product_key", productKey);
  }
});


test("admin mission status cannot skip the workflow pipeline", { skip: !isolated }, async () => {
  assert.ok(supabaseURL && anonKey && serviceKey, "isolated Supabase credentials are required");
  assert.match(supabaseURL, /^https?:\/\/(127\.0\.0\.1|localhost)(:|\/)/, "E2E database must be local");

  const admin = createClient(supabaseURL, serviceKey, { auth: { persistSession: false } });
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const email = `admin-status-${stamp}@e2e.dom.invalid`;
  const password = `Dom-Status-E2E-${stamp}!Aa1`;

  const { data: createdUser, error: userError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  assert.ifError(userError);
  assert.ok(createdUser.user);

  const { error: allowError } = await admin.from("admin_users").insert({
    email,
    full_name: "E2E Status Admin",
    role: "admin",
  });
  assert.ifError(allowError);

  const { data: mission, error: missionError } = await admin.from("mission_requests").insert({
    requester_name: "Status Test",
    requester_email: `status-client-${stamp}@e2e.dom.invalid`,
    company: "Status Test Company",
    service_type: "aerial_images",
    location: "Status Test Site",
    status: "requested",
  }).select("id,status").single();
  assert.ifError(missionError);

  const auth = createClient(supabaseURL, anonKey, { auth: { persistSession: false } });
  const { data: signedIn, error: signInError } = await auth.auth.signInWithPassword({ email, password });
  assert.ifError(signInError);
  assert.ok(signedIn.session);

  const api = await request.newContext({ baseURL });
  try {
    const headers = {
      Authorization: `Bearer ${signedIn.session.access_token}`,
      "Content-Type": "application/json",
    };

    const directJump = await api.patch(`/api/admin/missions/${mission.id}`, {
      headers,
      data: {
        title: "Status Test Mission",
        requesterName: "Status Test",
        requesterEmail: `status-client-${stamp}@e2e.dom.invalid`,
        company: "Status Test Company",
        serviceType: "aerial_images",
        location: "Status Test Site",
        scope: "",
        status: "delivered",
        quotedAmountCents: null,
        scheduledFor: null,
      },
      failOnStatusCode: false,
    });
    const directBody = await directJump.json().catch(() => ({}));
    assert.equal(directJump.status(), 409, JSON.stringify(directBody));

    const advance = await api.post(`/api/admin/missions/${mission.id}/manage`, {
      headers,
      data: { action: "advance_status" },
      failOnStatusCode: false,
    });
    const advanceBody = await advance.json().catch(() => ({}));
    assert.equal(advance.status(), 200, JSON.stringify(advanceBody));
    assert.equal(advanceBody.nextStatus, "reviewing");

    const { data: updated, error: updatedError } = await admin.from("mission_requests")
      .select("status")
      .eq("id", mission.id)
      .single();
    assert.ifError(updatedError);
    assert.equal(updated.status, "reviewing");
  } finally {
    await api.dispose();
    await admin.from("mission_requests").delete().eq("id", mission.id);
    await admin.from("admin_users").delete().eq("email", email);
    await admin.auth.admin.deleteUser(createdUser.user.id);
  }
});


test("repeated booking notification reuses one notification log row", { skip: !isolated }, async () => {
  assert.ok(supabaseURL && anonKey && serviceKey, "isolated Supabase credentials are required");
  assert.match(supabaseURL, /^https?:\/\/(127\.0\.0\.1|localhost)(:|\/)/, "E2E database must be local");

  const admin = createClient(supabaseURL, serviceKey, { auth: { persistSession: false } });
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const email = `admin-notify-${stamp}@e2e.dom.invalid`;
  const password = `Dom-Notify-E2E-${stamp}!Aa1`;

  const { data: createdUser, error: userError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  assert.ifError(userError);
  assert.ok(createdUser.user);

  const { error: allowError } = await admin.from("admin_users").insert({
    email,
    full_name: "E2E Notify Admin",
    role: "admin",
  });
  assert.ifError(allowError);

  const { data: mission, error: missionError } = await admin.from("mission_requests").insert({
    requester_name: "Notify Client",
    requester_email: `notify-client-${stamp}@e2e.dom.invalid`,
    company: "Notify Company",
    service_type: "aerial_images",
    location: "Notify Site",
    status: "approved",
    quoted_amount_cents: 25000,
  }).select("id").single();
  assert.ifError(missionError);

  const auth = createClient(supabaseURL, anonKey, { auth: { persistSession: false } });
  const { data: signedIn, error: signInError } = await auth.auth.signInWithPassword({ email, password });
  assert.ifError(signInError);
  assert.ok(signedIn.session);

  const api = await request.newContext({ baseURL });
  const idempotencyKey = `booking-confirmed/${mission.id}`;
  try {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const response = await api.post("/api/notify/booking-confirmed", {
        headers: { Authorization: `Bearer ${signedIn.session.access_token}` },
        data: { missionRequestId: mission.id },
        failOnStatusCode: false,
      });
      assert.equal(response.status(), 200);
    }

    const { data: logs, error: logsError } = await admin.from("notification_log")
      .select("id,status,idempotency_key")
      .eq("idempotency_key", idempotencyKey);
    assert.ifError(logsError);
    assert.equal(logs.length, 1);
  } finally {
    await api.dispose();
    await admin.from("notification_log").delete().eq("idempotency_key", idempotencyKey);
    await admin.from("mission_requests").delete().eq("id", mission.id);
    await admin.from("admin_users").delete().eq("email", email);
    await admin.auth.admin.deleteUser(createdUser.user.id);
  }
});


test("team pilot eligibility uses structured registered assets instead of legacy equipment text", { skip: !isolated }, async () => {
  assert.ok(supabaseURL && anonKey && serviceKey, "isolated Supabase credentials are required");
  assert.match(supabaseURL, /^https?:\/\/(127\.0\.0\.1|localhost)(:|\/)/, "E2E database must be local");

  const admin = createClient(supabaseURL, serviceKey, { auth: { persistSession: false } });
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const password = `Dom-Team-Assets-${stamp}!Aa1`;
  const ownerEmail = `team-owner-${stamp}@e2e.dom.invalid`;
  const fieldEmail = `team-field-${stamp}@e2e.dom.invalid`;

  const makeUser = async (email) => {
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    assert.ifError(error);
    return data.user;
  };
  const ownerUser = await makeUser(ownerEmail);
  const fieldUser = await makeUser(fieldEmail);

  const { data: contractors, error: contractorError } = await admin.from("contractors").insert([
    {
      user_id: ownerUser.id,
      full_name: "E2E Team Owner",
      email: ownerEmail,
      status: "active",
      part107_verified: true,
      insurance_verified: true,
      insurance_provider: "E2E",
      insurance_policy_number: "OWNER-E2E",
      insurance_expires_on: "2099-12-31",
      can_create_missions: true,
    },
    {
      user_id: fieldUser.id,
      full_name: "E2E Structured Field Pilot",
      email: fieldEmail,
      status: "active",
      part107_verified: true,
      insurance_verified: true,
      insurance_provider: "E2E",
      insurance_policy_number: "FIELD-E2E",
      insurance_expires_on: "2099-12-31",
      can_create_missions: false,
      equipment: "legacy text intentionally incompatible",
    },
  ]).select("id,user_id");
  assert.ifError(contractorError);

  const owner = contractors.find((item) => item.user_id === ownerUser.id);
  const field = contractors.find((item) => item.user_id === fieldUser.id);
  assert.ok(owner && field);

  const { data: asset, error: assetError } = await admin.from("pilot_assets").insert({
    contractor_id: field.id,
    asset_type: "uav",
    manufacturer: "DJI",
    model: "Avata 2",
    display_name: "Structured Avata 2",
    registration_number: "FA3TEAMTEST",
    status: "active",
    capabilities_verified: true,
    capabilities_verified_at: new Date().toISOString(),
  }).select("id").single();
  assert.ifError(assetError);

  const { error: capError } = await admin.from("pilot_asset_capabilities").insert([
    { asset_id: asset.id, capability: "rgb_imagery" },
    { asset_id: asset.id, capability: "video" },
  ]);
  assert.ifError(capError);

  const { data: mission, error: missionError } = await admin.from("mission_requests").insert({
    requester_name: "Team Test Client",
    requester_email: `team-client-${stamp}@e2e.dom.invalid`,
    company: "Team Eligibility Test",
    service_type: "roof_inspection_residential",
    location: "Team Test Site",
    status: "approved",
    created_by_contractor_id: owner.id,
    requires_admin_approval: false,
  }).select("id").single();
  assert.ifError(missionError);

  const { data: job, error: jobError } = await admin.from("jobs").insert({
    mission_request_id: mission.id,
    title: "Structured Team Eligibility Mission",
    service_type: "roof_inspection_residential",
    location: "Team Test Site",
    status: "scheduled",
    delivery_responsibility: "pilot",
  }).select("id").single();
  assert.ifError(jobError);

  const { data: ownerAssignment, error: assignmentError } = await admin.from("mission_assignments").insert({
    job_id: job.id,
    contractor_id: owner.id,
    status: "accepted",
    assignment_role: "owner",
  }).select("id").single();
  assert.ifError(assignmentError);

  const auth = createClient(supabaseURL, anonKey, { auth: { persistSession: false } });
  const { data: signedIn, error: signInError } = await auth.auth.signInWithPassword({ email: ownerEmail, password });
  assert.ifError(signInError);
  assert.ok(signedIn.session);

  const api = await request.newContext({ baseURL });
  try {
    const response = await api.get(`/api/pilot/missions/${ownerAssignment.id}/team`, {
      headers: { Authorization: `Bearer ${signedIn.session.access_token}` },
      failOnStatusCode: false,
    });
    const body = await response.json().catch(() => ({}));
    assert.equal(response.status(), 200, JSON.stringify(body));

    const candidate = body.eligiblePilots.find((pilot) => pilot.id === field.id);
    assert.ok(candidate, "structured field pilot should appear in team staffing");
    assert.equal(candidate.equipmentFit, true);
  } finally {
    await api.dispose();
    await admin.from("mission_assignments").delete().eq("id", ownerAssignment.id);
    await admin.from("jobs").delete().eq("id", job.id);
    await admin.from("mission_requests").delete().eq("id", mission.id);
    await admin.from("pilot_asset_capabilities").delete().eq("asset_id", asset.id);
    await admin.from("pilot_assets").delete().eq("id", asset.id);
    await admin.from("contractors").delete().in("id", [owner.id, field.id]);
    await admin.auth.admin.deleteUser(fieldUser.id);
    await admin.auth.admin.deleteUser(ownerUser.id);
  }
});


test("admin schedule changes create one client schedule notification event", { skip: !isolated }, async () => {
  assert.ok(supabaseURL && anonKey && serviceKey, "isolated Supabase credentials are required");
  assert.match(supabaseURL, /^https?:\/\/(127\.0\.0\.1|localhost)(:|\/)/, "E2E database must be local");

  const admin = createClient(supabaseURL, serviceKey, { auth: { persistSession: false } });
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const adminEmail = `schedule-admin-${stamp}@e2e.dom.invalid`;
  const pilotEmail = `schedule-pilot-${stamp}@e2e.dom.invalid`;
  const clientEmail = `schedule-client-${stamp}@e2e.dom.invalid`;
  const password = `Dom-Schedule-E2E-${stamp}!Aa1`;

  const createUser = async (email) => {
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    assert.ifError(error);
    return data.user;
  };
  const adminUser = await createUser(adminEmail);
  const pilotUser = await createUser(pilotEmail);

  const { error: allowError } = await admin.from("admin_users").insert({
    email: adminEmail,
    full_name: "E2E Schedule Admin",
    role: "admin",
  });
  assert.ifError(allowError);

  const { data: client, error: clientError } = await admin.from("clients").insert({
    company_name: "Schedule Client",
    contact_name: "Schedule Client",
    email: clientEmail,
  }).select("id").single();
  assert.ifError(clientError);

  const { data: contractor, error: contractorError } = await admin.from("contractors").insert({
    user_id: pilotUser.id,
    full_name: "Schedule Pilot",
    email: pilotEmail,
    status: "active",
    part107_verified: true,
    insurance_verified: true,
    insurance_provider: "E2E",
    insurance_policy_number: "SCHEDULE-E2E",
    insurance_expires_on: "2099-12-31",
  }).select("id").single();
  assert.ifError(contractorError);

  const { data: mission, error: missionError } = await admin.from("mission_requests").insert({
    client_id: client.id,
    requester_name: "Schedule Client",
    requester_email: clientEmail,
    company: "Schedule Client",
    service_type: "aerial_images",
    location: "Schedule Site",
    status: "assigned",
  }).select("id").single();
  assert.ifError(missionError);

  const { data: job, error: jobError } = await admin.from("jobs").insert({
    mission_request_id: mission.id,
    client_id: client.id,
    title: "Schedule Notification Mission",
    service_type: "aerial_images",
    location: "Schedule Site",
    status: "scheduled",
  }).select("id").single();
  assert.ifError(jobError);

  const { data: assignment, error: assignmentError } = await admin.from("mission_assignments").insert({
    job_id: job.id,
    contractor_id: contractor.id,
    status: "accepted",
  }).select("id").single();
  assert.ifError(assignmentError);

  const auth = createClient(supabaseURL, anonKey, { auth: { persistSession: false } });
  const { data: signedIn, error: signInError } = await auth.auth.signInWithPassword({ email: adminEmail, password });
  assert.ifError(signInError);
  assert.ok(signedIn.session);

  const scheduledFor = "2099-06-15T14:30:00.000Z";
  const api = await request.newContext({ baseURL });
  try {
    const response = await api.post(`/api/admin/missions/${mission.id}/manage`, {
      headers: {
        Authorization: `Bearer ${signedIn.session.access_token}`,
        "Content-Type": "application/json",
      },
      data: {
        action: "set_schedule",
        scheduledFor,
      },
      failOnStatusCode: false,
    });
    const body = await response.json().catch(() => ({}));
    assert.equal(response.status(), 200, JSON.stringify(body));

    const eventKey = `date_scheduled:${assignment.id}:${scheduledFor}`;
    const { data: logs, error: logsError } = await admin.from("notification_log")
      .select("id,email_type,metadata")
      .eq("assignment_id", assignment.id)
      .eq("metadata->>event_key", eventKey);
    assert.ifError(logsError);
    assert.equal(logs.length, 1);
    assert.equal(logs[0].email_type, "mission_rescheduled");
  } finally {
    await api.dispose();
    await admin.from("notification_log").delete().eq("assignment_id", assignment.id);
    await admin.from("mission_assignments").delete().eq("id", assignment.id);
    await admin.from("jobs").delete().eq("id", job.id);
    await admin.from("mission_requests").delete().eq("id", mission.id);
    await admin.from("contractors").delete().eq("id", contractor.id);
    await admin.from("clients").delete().eq("id", client.id);
    await admin.from("admin_users").delete().eq("email", adminEmail);
    await admin.auth.admin.deleteUser(pilotUser.id);
    await admin.auth.admin.deleteUser(adminUser.id);
  }
});


test("pilot structured aircraft persists registration and recognized capabilities", { skip: !isolated }, async () => {
  assert.ok(supabaseURL && anonKey && serviceKey, "isolated Supabase credentials are required");
  assert.match(supabaseURL, /^https?:\/\/(127\.0\.0\.1|localhost)(:|\/)/, "E2E database must be local");

  const admin = createClient(supabaseURL, serviceKey, { auth: { persistSession: false } });
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const email = `asset-pilot-${stamp}@e2e.dom.invalid`;
  const password = `Dom-Asset-E2E-${stamp}!Aa1`;

  const { data: createdUser, error: userError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  assert.ifError(userError);
  assert.ok(createdUser.user);

  const { data: contractor, error: contractorError } = await admin.from("contractors").insert({
    user_id: createdUser.user.id,
    full_name: "E2E Asset Pilot",
    email,
    status: "active",
    part107_verified: true,
  }).select("id").single();
  assert.ifError(contractorError);

  const auth = createClient(supabaseURL, anonKey, { auth: { persistSession: false } });
  const { data: signedIn, error: signInError } = await auth.auth.signInWithPassword({ email, password });
  assert.ifError(signInError);
  assert.ok(signedIn.session);

  const api = await request.newContext({ baseURL });
  let assetId = null;
  try {
    const createResponse = await api.post("/api/pilot/assets", {
      headers: { Authorization: `Bearer ${signedIn.session.access_token}` },
      data: {
        asset_type: "uav",
        manufacturer: "DJI",
        model: "Avata 2",
        display_name: "E2E Avata 2",
        serial_number: `SN-${stamp}`,
        registration_number: "FA3E2EPERSIST",
        remote_id: `RID-${stamp}`,
        status: "active",
      },
      failOnStatusCode: false,
    });
    const createBody = await createResponse.json().catch(() => ({}));
    assert.equal(createResponse.status(), 201, JSON.stringify(createBody));
    assetId = createBody.asset?.id;
    assert.ok(assetId);
    assert.equal(createBody.capabilityResolution?.recognized, true);
    assert.deepEqual(new Set(createBody.asset.capabilities), new Set(["rgb_imagery", "video"]));

    const listResponse = await api.get("/api/pilot/assets", {
      headers: { Authorization: `Bearer ${signedIn.session.access_token}` },
      failOnStatusCode: false,
    });
    const listBody = await listResponse.json().catch(() => ({}));
    assert.equal(listResponse.status(), 200, JSON.stringify(listBody));

    const saved = listBody.assets.find((asset) => asset.id === assetId);
    assert.ok(saved, "created aircraft should still exist after reload");
    assert.equal(saved.registration_number, "FA3E2EPERSIST");
    assert.equal(saved.remote_id, `RID-${stamp}`);
    assert.equal(saved.capability_source, "catalog");
    assert.equal(saved.capability_recognized, true);
    assert.equal(saved.capabilities_verified, true);
    assert.deepEqual(new Set(saved.capabilities), new Set(["rgb_imagery", "video"]));
  } finally {
    await api.dispose();
    if (assetId) {
      await admin.from("pilot_asset_capabilities").delete().eq("asset_id", assetId);
      await admin.from("pilot_assets").delete().eq("id", assetId);
    }
    await admin.from("contractors").delete().eq("id", contractor.id);
    await admin.auth.admin.deleteUser(createdUser.user.id);
  }
});


test("public pilot profile never exposes private aircraft identifiers", { skip: !isolated }, async () => {
  assert.ok(supabaseURL && serviceKey, "isolated Supabase credentials are required");
  assert.match(supabaseURL, /^https?:\/\/(127\.0\.0\.1|localhost)(:|\/)/, "E2E database must be local");

  const admin = createClient(supabaseURL, serviceKey, { auth: { persistSession: false } });
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const slug = `privacy-pilot-${stamp.replace(/[^a-z0-9-]/gi, "").toLowerCase()}`;
  const serial = `SECRET-SERIAL-${stamp}`;
  const registration = `FA3PRIVATE${stamp.slice(-4).toUpperCase()}`;
  const remoteId = `SECRET-RID-${stamp}`;

  const { data: contractor, error: contractorError } = await admin.from("contractors").insert({
    full_name: "E2E Privacy Pilot",
    email: `privacy-${stamp}@e2e.dom.invalid`,
    status: "active",
    slug,
    profile_published: true,
    subscription_active: true,
    part107_verified: true,
    insurance_verified: true,
    equipment: null,
  }).select("id").single();
  assert.ifError(contractorError);

  const { data: asset, error: assetError } = await admin.from("pilot_assets").insert({
    contractor_id: contractor.id,
    asset_type: "uav",
    manufacturer: "DJI",
    model: "Avata 2",
    display_name: "Public Avata 2",
    serial_number: serial,
    registration_number: registration,
    remote_id: remoteId,
    firmware_version: "SECRET-FIRMWARE-9.9.9",
    notes: "SECRET-NOTES-DO-NOT-EXPOSE",
    status: "active",
    public_visible: true,
    public_description: "Publicly visible aircraft description",
    capabilities_verified: true,
  }).select("id").single();
  assert.ifError(assetError);

  const { error: capError } = await admin.from("pilot_asset_capabilities").insert([
    { asset_id: asset.id, capability: "rgb_imagery" },
    { asset_id: asset.id, capability: "video" },
  ]);
  assert.ifError(capError);

  const privacyBrowser = await chromium.launch({ headless: true });
  const page = await privacyBrowser.newPage();
  try {
    const response = await page.goto(`${baseURL}/pilots/${slug}`, {
      waitUntil: "networkidle",
      timeout: 45_000,
    });
    assert.ok(response && response.status() < 400);
    const html = await page.content();

    assert.match(html, /Public Avata 2/);
    assert.match(html, /Publicly visible aircraft description/);
    assert.doesNotMatch(html, new RegExp(serial));
    assert.doesNotMatch(html, new RegExp(registration));
    assert.doesNotMatch(html, new RegExp(remoteId));
    assert.doesNotMatch(html, /SECRET-FIRMWARE-9\.9\.9/);
    assert.doesNotMatch(html, /SECRET-NOTES-DO-NOT-EXPOSE/);
  } finally {
    await page.close();
    await privacyBrowser.close();
    await admin.from("pilot_asset_capabilities").delete().eq("asset_id", asset.id);
    await admin.from("pilot_assets").delete().eq("id", asset.id);
    await admin.from("contractors").delete().eq("id", contractor.id);
  }
});


test("client cannot download another client deliverable by id", { skip: !isolated }, async () => {
  assert.ok(supabaseURL && anonKey && serviceKey, "isolated Supabase credentials are required");
  assert.match(supabaseURL, /^https?:\/\/(127\.0\.0\.1|localhost)(:|\/)/, "E2E database must be local");

  const admin = createClient(supabaseURL, serviceKey, { auth: { persistSession: false } });
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const password = `Dom-Deliverable-E2E-${stamp}!Aa1`;
  const emails = [
    `deliverable-a-${stamp}@e2e.dom.invalid`,
    `deliverable-b-${stamp}@e2e.dom.invalid`,
  ];

  const users = [];
  for (const email of emails) {
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    assert.ifError(error);
    users.push(data.user);
  }

  const { data: clients, error: clientsError } = await admin.from("clients").insert([
    { company_name: "Deliverable Client A", contact_name: "A", email: emails[0], user_id: users[0].id },
    { company_name: "Deliverable Client B", contact_name: "B", email: emails[1], user_id: users[1].id },
  ]).select("id,user_id");
  assert.ifError(clientsError);

  const clientA = clients.find((item) => item.user_id === users[0].id);
  const clientB = clients.find((item) => item.user_id === users[1].id);
  assert.ok(clientA && clientB);

  const { data: missions, error: missionsError } = await admin.from("mission_requests").insert([
    {
      client_id: clientA.id,
      requester_name: "A",
      requester_email: emails[0],
      company: "Deliverable Client A",
      service_type: "aerial_images",
      location: "A Site",
      status: "delivered",
    },
    {
      client_id: clientB.id,
      requester_name: "B",
      requester_email: emails[1],
      company: "Deliverable Client B",
      service_type: "aerial_images",
      location: "B Site",
      status: "delivered",
    },
  ]).select("id,client_id");
  assert.ifError(missionsError);

  const missionA = missions.find((item) => item.client_id === clientA.id);
  const missionB = missions.find((item) => item.client_id === clientB.id);
  assert.ok(missionA && missionB);

  const { data: jobs, error: jobsError } = await admin.from("jobs").insert([
    {
      mission_request_id: missionA.id,
      client_id: clientA.id,
      title: "Deliverable Mission A",
      service_type: "aerial_images",
      location: "A Site",
      status: "delivered",
    },
    {
      mission_request_id: missionB.id,
      client_id: clientB.id,
      title: "Deliverable Mission B",
      service_type: "aerial_images",
      location: "B Site",
      status: "delivered",
    },
  ]).select("id,client_id");
  assert.ifError(jobsError);

  const jobB = jobs.find((item) => item.client_id === clientB.id);
  assert.ok(jobB);

  const { data: deliverable, error: deliverableError } = await admin.from("deliverables").insert({
    job_id: jobB.id,
    name: "Client B Private Deliverable",
    type: "report",
    storage_url: `${jobB.id}/private-b.pdf`,
    qc_passed: true,
    delivered_at: new Date().toISOString(),
  }).select("id").single();
  assert.ifError(deliverableError);

  const authA = createClient(supabaseURL, anonKey, { auth: { persistSession: false } });
  const { data: signedInA, error: signInError } = await authA.auth.signInWithPassword({
    email: emails[0],
    password,
  });
  assert.ifError(signInError);
  assert.ok(signedInA.session);

  const api = await request.newContext({ baseURL });
  try {
    const response = await api.get(`/api/client/deliverables/${deliverable.id}/download`, {
      headers: { Authorization: `Bearer ${signedInA.session.access_token}` },
      failOnStatusCode: false,
    });
    const body = await response.json().catch(() => ({}));
    assert.equal(response.status(), 404, JSON.stringify(body));
    assert.equal(body.error, "File not available");
  } finally {
    await api.dispose();
    await admin.from("deliverables").delete().eq("id", deliverable.id);
    await admin.from("jobs").delete().in("id", jobs.map((job) => job.id));
    await admin.from("mission_requests").delete().in("id", [missionA.id, missionB.id]);
    await admin.from("clients").delete().in("id", [clientA.id, clientB.id]);
    for (const user of users) await admin.auth.admin.deleteUser(user.id);
  }
});


test("client cannot review another client deliverable by id", { skip: !isolated }, async () => {
  assert.ok(supabaseURL && anonKey && serviceKey, "isolated Supabase credentials are required");
  assert.match(supabaseURL, /^https?:\/\/(127\.0\.0\.1|localhost)(:|\/)/, "E2E database must be local");

  const admin = createClient(supabaseURL, serviceKey, { auth: { persistSession: false } });
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const password = `Dom-Review-E2E-${stamp}!Aa1`;
  const emails = [
    `review-a-${stamp}@e2e.dom.invalid`,
    `review-b-${stamp}@e2e.dom.invalid`,
  ];

  const users = [];
  for (const email of emails) {
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    assert.ifError(error);
    users.push(data.user);
  }

  const { data: clients, error: clientsError } = await admin.from("clients").insert([
    { company_name: "Review Client A", contact_name: "A", email: emails[0], user_id: users[0].id },
    { company_name: "Review Client B", contact_name: "B", email: emails[1], user_id: users[1].id },
  ]).select("id,user_id");
  assert.ifError(clientsError);

  const clientA = clients.find((item) => item.user_id === users[0].id);
  const clientB = clients.find((item) => item.user_id === users[1].id);
  assert.ok(clientA && clientB);

  const { data: missionB, error: missionError } = await admin.from("mission_requests").insert({
    client_id: clientB.id,
    requester_name: "B",
    requester_email: emails[1],
    company: "Review Client B",
    service_type: "aerial_images",
    location: "Review B Site",
    status: "delivered",
  }).select("id").single();
  assert.ifError(missionError);

  const { data: jobB, error: jobError } = await admin.from("jobs").insert({
    mission_request_id: missionB.id,
    client_id: clientB.id,
    title: "Review Mission B",
    service_type: "aerial_images",
    location: "Review B Site",
    status: "delivered",
  }).select("id").single();
  assert.ifError(jobError);

  const { data: deliverable, error: deliverableError } = await admin.from("deliverables").insert({
    job_id: jobB.id,
    name: "Client B Review Deliverable",
    type: "report",
    storage_url: `${jobB.id}/review-b.pdf`,
    qc_passed: true,
    client_status: "pending",
    delivered_at: new Date().toISOString(),
  }).select("id,client_status,client_feedback").single();
  assert.ifError(deliverableError);

  const authA = createClient(supabaseURL, anonKey, { auth: { persistSession: false } });
  const { data: signedInA, error: signInError } = await authA.auth.signInWithPassword({
    email: emails[0],
    password,
  });
  assert.ifError(signInError);
  assert.ok(signedInA.session);

  const api = await request.newContext({ baseURL });
  try {
    const response = await api.patch(`/api/client/deliverables/${deliverable.id}`, {
      headers: {
        Authorization: `Bearer ${signedInA.session.access_token}`,
        "Content-Type": "application/json",
      },
      data: { status: "revision_requested", feedback: "Attempted cross-client mutation" },
      failOnStatusCode: false,
    });
    const body = await response.json().catch(() => ({}));
    assert.equal(response.status(), 404, JSON.stringify(body));

    const { data: unchanged, error: unchangedError } = await admin.from("deliverables")
      .select("client_status,client_feedback")
      .eq("id", deliverable.id)
      .single();
    assert.ifError(unchangedError);
    assert.equal(unchanged.client_status, "pending");
    assert.equal(unchanged.client_feedback, null);
  } finally {
    await api.dispose();
    await admin.from("deliverables").delete().eq("id", deliverable.id);
    await admin.from("jobs").delete().eq("id", jobB.id);
    await admin.from("mission_requests").delete().eq("id", missionB.id);
    await admin.from("clients").delete().in("id", [clientA.id, clientB.id]);
    for (const user of users) await admin.auth.admin.deleteUser(user.id);
  }
});


test("pilot cannot modify or delete another pilot aircraft", { skip: !isolated }, async () => {
  assert.ok(supabaseURL && anonKey && serviceKey, "isolated Supabase credentials are required");
  assert.match(supabaseURL, /^https?:\/\/(127\.0\.0\.1|localhost)(:|\/)/, "E2E database must be local");

  const admin = createClient(supabaseURL, serviceKey, { auth: { persistSession: false } });
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const password = `Dom-Asset-Isolation-${stamp}!Aa1`;
  const attackerEmail = `asset-attacker-${stamp}@e2e.dom.invalid`;
  const ownerEmail = `asset-owner-${stamp}@e2e.dom.invalid`;

  const users = [];
  for (const email of [attackerEmail, ownerEmail]) {
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    assert.ifError(error);
    users.push(data.user);
  }

  const { data: contractors, error: contractorError } = await admin.from("contractors").insert([
    { user_id: users[0].id, full_name: "Asset Attacker", email: attackerEmail, status: "active", part107_verified: true },
    { user_id: users[1].id, full_name: "Asset Owner", email: ownerEmail, status: "active", part107_verified: true },
  ]).select("id,user_id");
  assert.ifError(contractorError);
  const attacker = contractors.find((item) => item.user_id === users[0].id);
  const owner = contractors.find((item) => item.user_id === users[1].id);
  assert.ok(attacker && owner);

  const { data: victimAsset, error: assetError } = await admin.from("pilot_assets").insert({
    contractor_id: owner.id,
    asset_type: "uav",
    manufacturer: "DJI",
    model: "Avata 2",
    display_name: "Owner Private Avata",
    registration_number: "FA3OWNERONLY",
    status: "active",
    public_visible: false,
  }).select("id,display_name,registration_number,status,archived_at").single();
  assert.ifError(assetError);

  const auth = createClient(supabaseURL, anonKey, { auth: { persistSession: false } });
  const { data: signedIn, error: signInError } = await auth.auth.signInWithPassword({ email: attackerEmail, password });
  assert.ifError(signInError);
  assert.ok(signedIn.session);

  const api = await request.newContext({ baseURL });
  try {
    const patchResponse = await api.patch(`/api/pilot/assets/${victimAsset.id}`, {
      headers: { Authorization: `Bearer ${signedIn.session.access_token}`, "Content-Type": "application/json" },
      data: { display_name: "STOLEN ASSET", registration_number: "FA3ATTACKER", archived: true },
      failOnStatusCode: false,
    });
    assert.equal(patchResponse.status(), 404);

    const deleteResponse = await api.delete(`/api/pilot/assets/${victimAsset.id}`, {
      headers: { Authorization: `Bearer ${signedIn.session.access_token}` },
      failOnStatusCode: false,
    });
    assert.equal(deleteResponse.status(), 404);

    const { data: unchanged, error: unchangedError } = await admin.from("pilot_assets")
      .select("display_name,registration_number,status,archived_at")
      .eq("id", victimAsset.id)
      .single();
    assert.ifError(unchangedError);
    assert.equal(unchanged.display_name, "Owner Private Avata");
    assert.equal(unchanged.registration_number, "FA3OWNERONLY");
    assert.equal(unchanged.status, "active");
    assert.equal(unchanged.archived_at, null);
  } finally {
    await api.dispose();
    await admin.from("pilot_assets").delete().eq("id", victimAsset.id);
    await admin.from("contractors").delete().in("id", [attacker.id, owner.id]);
    for (const user of users) await admin.auth.admin.deleteUser(user.id);
  }
});


test("mission aircraft assignment requires FAA registration and feeds workflow readiness", { skip: !isolated }, async () => {
  assert.ok(supabaseURL && anonKey && serviceKey, "isolated Supabase credentials are required");
  assert.match(supabaseURL, /^https?:\/\/(127\.0\.0\.1|localhost)(:|\/)/, "E2E database must be local");

  const admin = createClient(supabaseURL, serviceKey, { auth: { persistSession: false } });
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const email = `mission-asset-${stamp}@e2e.dom.invalid`;
  const password = `Dom-Mission-Asset-${stamp}!Aa1`;

  const { data: createdUser, error: userError } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  assert.ifError(userError);
  const { data: contractor, error: contractorError } = await admin.from("contractors").insert({
    user_id: createdUser.user.id,
    full_name: "E2E Mission Asset Pilot",
    email,
    status: "active",
    part107_verified: true,
    insurance_verified: true,
    insurance_provider: "E2E",
    insurance_policy_number: "ASSET-E2E",
    insurance_expires_on: "2099-12-31",
  }).select("id").single();
  assert.ifError(contractorError);

  const { data: mission, error: missionError } = await admin.from("mission_requests").insert({
    requester_name: "Mission Asset Client",
    requester_email: `asset-client-${stamp}@e2e.dom.invalid`,
    company: "Mission Asset Test",
    service_type: "roof_inspection_residential",
    location: "Mission Asset Site",
    status: "assigned",
  }).select("id").single();
  assert.ifError(missionError);
  const { data: job, error: jobError } = await admin.from("jobs").insert({
    mission_request_id: mission.id,
    title: "Mission Asset Gate",
    service_type: "roof_inspection_residential",
    location: "Mission Asset Site",
    status: "scheduled",
    scheduled_for: "2099-06-15T14:30:00.000Z",
  }).select("id").single();
  assert.ifError(jobError);
  const { data: assignment, error: assignmentError } = await admin.from("mission_assignments").insert({
    job_id: job.id,
    contractor_id: contractor.id,
    status: "accepted",
  }).select("id").single();
  assert.ifError(assignmentError);

  const { data: asset, error: assetError } = await admin.from("pilot_assets").insert({
    contractor_id: contractor.id,
    asset_type: "uav",
    manufacturer: "DJI",
    model: "Mavic 3 Enterprise",
    display_name: "E2E M3E",
    status: "active",
    capabilities_verified: true,
  }).select("id").single();
  assert.ifError(assetError);
  const { error: capError } = await admin.from("pilot_asset_capabilities").insert([
    { asset_id: asset.id, capability: "rgb_imagery" },
    { asset_id: asset.id, capability: "mapping_photogrammetry" },
    { asset_id: asset.id, capability: "rtk" },
    { asset_id: asset.id, capability: "zoom_inspection" },
    { asset_id: asset.id, capability: "video" },
    { asset_id: asset.id, capability: "obstacle_avoidance" },
    { asset_id: asset.id, capability: "survey_workflow" },
  ]);
  assert.ifError(capError);

  const auth = createClient(supabaseURL, anonKey, { auth: { persistSession: false } });
  const { data: signedIn, error: signInError } = await auth.auth.signInWithPassword({ email, password });
  assert.ifError(signInError);
  assert.ok(signedIn.session);
  const headers = { Authorization: `Bearer ${signedIn.session.access_token}` };
  const api = await request.newContext({ baseURL });

  try {
    const rejected = await api.post(`/api/pilot/missions/${assignment.id}/assets`, {
      headers,
      data: { assetIds: [asset.id] },
      failOnStatusCode: false,
    });
    const rejectedBody = await rejected.json().catch(() => ({}));
    assert.equal(rejected.status(), 409, JSON.stringify(rejectedBody));
    assert.match(rejectedBody.error ?? "", /FAA registration/i);

    const { error: registrationError } = await admin.from("pilot_assets")
      .update({ registration_number: "FA3MISSIONE2E" })
      .eq("id", asset.id);
    assert.ifError(registrationError);

    const accepted = await api.post(`/api/pilot/missions/${assignment.id}/assets`, {
      headers,
      data: { assetIds: [asset.id] },
      failOnStatusCode: false,
    });
    const acceptedBody = await accepted.json().catch(() => ({}));
    assert.equal(accepted.status(), 200, JSON.stringify(acceptedBody));
    assert.ok(acceptedBody.assetIds.includes(asset.id));

    const { data: syncedAssignment, error: syncedError } = await admin.from("mission_assignments")
      .select("assigned_uav")
      .eq("id", assignment.id)
      .single();
    assert.ifError(syncedError);
    assert.match(syncedAssignment.assigned_uav ?? "", /E2E M3E/);

    const workflow = await api.get(`/api/pilot/missions/${assignment.id}/workflow`, {
      headers,
      failOnStatusCode: false,
    });
    const workflowBody = await workflow.json().catch(() => ({}));
    assert.equal(workflow.status(), 200, JSON.stringify(workflowBody));
    assert.ok(!workflowBody.readiness.blockers.includes("A compatible UAV has not been assigned"));
  } finally {
    await api.dispose();
    await admin.from("mission_asset_assignments").delete().eq("mission_assignment_id", assignment.id);
    await admin.from("pilot_asset_capabilities").delete().eq("asset_id", asset.id);
    await admin.from("pilot_assets").delete().eq("id", asset.id);
    await admin.from("mission_assignments").delete().eq("id", assignment.id);
    await admin.from("mission_checklist_items").delete().eq("assignment_id", assignment.id);
    await admin.from("jobs").delete().eq("id", job.id);
    await admin.from("mission_requests").delete().eq("id", mission.id);
    await admin.from("contractors").delete().eq("id", contractor.id);
    await admin.auth.admin.deleteUser(createdUser.user.id);
  }
});


test("admin session endpoint rejects pilots and accepts allowlisted admins", { skip: !isolated }, async () => {
  assert.ok(supabaseURL && anonKey && serviceKey, "isolated Supabase credentials are required");
  assert.match(supabaseURL, /^https?:\/\/(127\.0\.0\.1|localhost)(:|\/)/, "E2E database must be local");

  const admin = createClient(supabaseURL, serviceKey, { auth: { persistSession: false } });
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const password = `Dom-Admin-Gate-${stamp}!Aa1`;
  const pilotEmail = `gate-pilot-${stamp}@e2e.dom.invalid`;
  const adminEmail = `gate-admin-${stamp}@e2e.dom.invalid`;

  const created = [];
  for (const email of [pilotEmail, adminEmail]) {
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    assert.ifError(error);
    created.push(data.user);
  }

  const { data: contractor, error: contractorError } = await admin.from("contractors").insert({
    user_id: created[0].id,
    full_name: "E2E Non Admin Pilot",
    email: pilotEmail,
    status: "active",
    part107_verified: true,
  }).select("id").single();
  assert.ifError(contractorError);

  const { error: allowError } = await admin.from("admin_users").insert({
    email: adminEmail,
    full_name: "E2E Allowlisted Admin",
    role: "admin",
  });
  assert.ifError(allowError);

  const signIn = async (email) => {
    const sb = createClient(supabaseURL, anonKey, { auth: { persistSession: false } });
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    assert.ifError(error);
    assert.ok(data.session);
    return data.session.access_token;
  };
  const pilotToken = await signIn(pilotEmail);
  const adminToken = await signIn(adminEmail);

  const api = await request.newContext({ baseURL });
  try {
    const pilotResponse = await api.get("/api/admin/session", {
      headers: { Authorization: `Bearer ${pilotToken}` },
      failOnStatusCode: false,
    });
    assert.equal(pilotResponse.status(), 403);
    assert.deepEqual(await pilotResponse.json(), { admin: false });

    const adminResponse = await api.get("/api/admin/session", {
      headers: { Authorization: `Bearer ${adminToken}` },
      failOnStatusCode: false,
    });
    assert.equal(adminResponse.status(), 200);
    assert.deepEqual(await adminResponse.json(), { admin: true });
  } finally {
    await api.dispose();
    await admin.from("contractors").delete().eq("id", contractor.id);
    await admin.from("admin_users").delete().eq("email", adminEmail);
    for (const user of created) await admin.auth.admin.deleteUser(user.id);
  }
});


test("pilot cannot list or prepare files for another pilot assignment", { skip: !isolated }, async () => {
  assert.ok(supabaseURL && anonKey && serviceKey, "isolated Supabase credentials are required");
  assert.match(supabaseURL, /^https?:\/\/(127\.0\.0\.1|localhost)(:|\/)/, "E2E database must be local");

  const admin = createClient(supabaseURL, serviceKey, { auth: { persistSession: false } });
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const password = `Dom-File-Isolation-${stamp}!Aa1`;
  const attackerEmail = `file-attacker-${stamp}@e2e.dom.invalid`;
  const ownerEmail = `file-owner-${stamp}@e2e.dom.invalid`;

  const users = [];
  for (const email of [attackerEmail, ownerEmail]) {
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    assert.ifError(error);
    users.push(data.user);
  }

  const { data: contractors, error: contractorError } = await admin.from("contractors").insert([
    { user_id: users[0].id, full_name: "File Attacker", email: attackerEmail, status: "active", part107_verified: true },
    { user_id: users[1].id, full_name: "File Owner", email: ownerEmail, status: "active", part107_verified: true },
  ]).select("id,user_id");
  assert.ifError(contractorError);
  const attacker = contractors.find((item) => item.user_id === users[0].id);
  const owner = contractors.find((item) => item.user_id === users[1].id);
  assert.ok(attacker && owner);

  const { data: mission, error: missionError } = await admin.from("mission_requests").insert({
    requester_name: "Private File Client",
    requester_email: `file-client-${stamp}@e2e.dom.invalid`,
    company: "Private File Test",
    service_type: "aerial_images",
    location: "Private File Site",
    status: "assigned",
  }).select("id").single();
  assert.ifError(missionError);

  const { data: job, error: jobError } = await admin.from("jobs").insert({
    mission_request_id: mission.id,
    title: "Private File Mission",
    service_type: "aerial_images",
    location: "Private File Site",
    status: "scheduled",
  }).select("id").single();
  assert.ifError(jobError);

  const { data: assignment, error: assignmentError } = await admin.from("mission_assignments").insert({
    job_id: job.id,
    contractor_id: owner.id,
    status: "accepted",
  }).select("id").single();
  assert.ifError(assignmentError);

  const auth = createClient(supabaseURL, anonKey, { auth: { persistSession: false } });
  const { data: signedIn, error: signInError } = await auth.auth.signInWithPassword({ email: attackerEmail, password });
  assert.ifError(signInError);
  assert.ok(signedIn.session);

  const headers = { Authorization: `Bearer ${signedIn.session.access_token}` };
  const api = await request.newContext({ baseURL });
  try {
    const listResponse = await api.get(`/api/pilot/missions/${assignment.id}/files`, {
      headers,
      failOnStatusCode: false,
    });
    assert.equal(listResponse.status(), 404);

    const prepareResponse = await api.post(`/api/pilot/missions/${assignment.id}/files`, {
      headers,
      data: {
        action: "prepare_upload",
        kind: "deliverable",
        name: "Unauthorized Upload",
        category: "raw_images",
        fileName: "unauthorized.zip",
        fileSize: 1024,
      },
      failOnStatusCode: false,
    });
    assert.equal(prepareResponse.status(), 404);

    const { count: deliverableCount, error: countError } = await admin
      .from("deliverables")
      .select("id", { count: "exact", head: true })
      .eq("job_id", job.id);
    assert.ifError(countError);
    assert.equal(deliverableCount, 0);
  } finally {
    await api.dispose();
    await admin.from("mission_assignments").delete().eq("id", assignment.id);
    await admin.from("jobs").delete().eq("id", job.id);
    await admin.from("mission_requests").delete().eq("id", mission.id);
    await admin.from("contractors").delete().in("id", [attacker.id, owner.id]);
    for (const user of users) await admin.auth.admin.deleteUser(user.id);
  }
});


test("pilot cannot run workflow actions on another pilot assignment", { skip: !isolated }, async () => {
  assert.ok(supabaseURL && anonKey && serviceKey, "isolated Supabase credentials are required");
  assert.match(supabaseURL, /^https?:\/\/(127\.0\.0\.1|localhost)(:|\/)/, "E2E database must be local");

  const admin = createClient(supabaseURL, serviceKey, { auth: { persistSession: false } });
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const password = `Dom-Workflow-Isolation-${stamp}!Aa1`;
  const attackerEmail = `workflow-attacker-${stamp}@e2e.dom.invalid`;
  const ownerEmail = `workflow-owner-${stamp}@e2e.dom.invalid`;

  const users = [];
  for (const email of [attackerEmail, ownerEmail]) {
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    assert.ifError(error);
    users.push(data.user);
  }

  const { data: contractors, error: contractorError } = await admin.from("contractors").insert([
    {
      user_id: users[0].id,
      full_name: "Workflow Attacker",
      email: attackerEmail,
      status: "active",
      part107_verified: true,
      can_create_missions: false,
    },
    {
      user_id: users[1].id,
      full_name: "Workflow Owner",
      email: ownerEmail,
      status: "active",
      part107_verified: true,
      can_create_missions: false,
    },
  ]).select("id,user_id");
  assert.ifError(contractorError);

  const attacker = contractors.find((item) => item.user_id === users[0].id);
  const owner = contractors.find((item) => item.user_id === users[1].id);
  assert.ok(attacker && owner);

  const { data: mission, error: missionError } = await admin.from("mission_requests").insert({
    requester_name: "Workflow Client",
    requester_email: `workflow-client-${stamp}@e2e.dom.invalid`,
    company: "Workflow Isolation Test",
    service_type: "roof_inspection_residential",
    location: "Workflow Site",
    status: "assigned",
  }).select("id").single();
  assert.ifError(missionError);

  const { data: job, error: jobError } = await admin.from("jobs").insert({
    mission_request_id: mission.id,
    title: "Workflow Isolation Mission",
    service_type: "roof_inspection_residential",
    location: "Workflow Site",
    status: "scheduled",
    scheduled_for: "2099-06-15T14:30:00.000Z",
  }).select("id,checked_in_at,started_at,completed_at").single();
  assert.ifError(jobError);

  const { data: assignment, error: assignmentError } = await admin.from("mission_assignments").insert({
    job_id: job.id,
    contractor_id: owner.id,
    status: "accepted",
    assigned_uav: "Owner UAV",
  }).select("id").single();
  assert.ifError(assignmentError);

  const auth = createClient(supabaseURL, anonKey, { auth: { persistSession: false } });
  const { data: signedIn, error: signInError } = await auth.auth.signInWithPassword({
    email: attackerEmail,
    password,
  });
  assert.ifError(signInError);
  assert.ok(signedIn.session);

  const headers = { Authorization: `Bearer ${signedIn.session.access_token}` };
  const api = await request.newContext({ baseURL });
  try {
    const readResponse = await api.get(`/api/pilot/missions/${assignment.id}/workflow`, {
      headers,
      failOnStatusCode: false,
    });
    assert.equal(readResponse.status(), 401);

    const actionResponse = await api.post(`/api/pilot/missions/${assignment.id}/workflow`, {
      headers,
      data: { action: "check_in" },
      failOnStatusCode: false,
    });
    assert.equal(actionResponse.status(), 401);

    const { data: unchanged, error: unchangedError } = await admin.from("jobs")
      .select("status,checked_in_at,started_at,completed_at")
      .eq("id", job.id)
      .single();
    assert.ifError(unchangedError);
    assert.equal(unchanged.status, "scheduled");
    assert.equal(unchanged.checked_in_at, null);
    assert.equal(unchanged.started_at, null);
    assert.equal(unchanged.completed_at, null);
  } finally {
    await api.dispose();
    await admin.from("mission_assignments").delete().eq("id", assignment.id);
    await admin.from("jobs").delete().eq("id", job.id);
    await admin.from("mission_requests").delete().eq("id", mission.id);
    await admin.from("contractors").delete().in("id", [attacker.id, owner.id]);
    for (const user of users) await admin.auth.admin.deleteUser(user.id);
  }
});


test("field pilot cannot manage owner team staffing", { skip: !isolated }, async () => {
  assert.ok(supabaseURL && anonKey && serviceKey, "isolated Supabase credentials are required");
  assert.match(supabaseURL, /^https?:\/\/(127\.0\.0\.1|localhost)(:|\/)/, "E2E database must be local");

  const admin = createClient(supabaseURL, serviceKey, { auth: { persistSession: false } });
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const password = `Dom-Team-Auth-${stamp}!Aa1`;
  const ownerEmail = `team-auth-owner-${stamp}@e2e.dom.invalid`;
  const fieldEmail = `team-auth-field-${stamp}@e2e.dom.invalid`;
  const extraEmail = `team-auth-extra-${stamp}@e2e.dom.invalid`;

  const users = [];
  for (const email of [ownerEmail, fieldEmail, extraEmail]) {
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    assert.ifError(error);
    users.push(data.user);
  }

  const contractorRows = [
    {
      user_id: users[0].id, full_name: "Team Owner", email: ownerEmail, status: "active",
      part107_verified: true, insurance_verified: true, insurance_provider: "E2E",
      insurance_policy_number: "OWNER-AUTH", insurance_expires_on: "2099-12-31", can_create_missions: true,
    },
    {
      user_id: users[1].id, full_name: "Team Field", email: fieldEmail, status: "active",
      part107_verified: true, insurance_verified: true, insurance_provider: "E2E",
      insurance_policy_number: "FIELD-AUTH", insurance_expires_on: "2099-12-31", can_create_missions: false,
    },
    {
      user_id: users[2].id, full_name: "Team Extra", email: extraEmail, status: "active",
      part107_verified: true, insurance_verified: true, insurance_provider: "E2E",
      insurance_policy_number: "EXTRA-AUTH", insurance_expires_on: "2099-12-31", can_create_missions: false,
    },
  ];
  const { data: contractors, error: contractorError } = await admin.from("contractors").insert(contractorRows).select("id,user_id");
  assert.ifError(contractorError);
  const owner = contractors.find((item) => item.user_id === users[0].id);
  const field = contractors.find((item) => item.user_id === users[1].id);
  const extra = contractors.find((item) => item.user_id === users[2].id);
  assert.ok(owner && field && extra);

  const { data: mission, error: missionError } = await admin.from("mission_requests").insert({
    requester_name: "Team Auth Client",
    requester_email: `team-auth-client-${stamp}@e2e.dom.invalid`,
    company: "Team Auth Test",
    service_type: "roof_inspection_residential",
    location: "Team Auth Site",
    status: "assigned",
    created_by_contractor_id: owner.id,
    requires_admin_approval: false,
  }).select("id").single();
  assert.ifError(missionError);

  const { data: job, error: jobError } = await admin.from("jobs").insert({
    mission_request_id: mission.id,
    title: "Team Authorization Mission",
    service_type: "roof_inspection_residential",
    location: "Team Auth Site",
    status: "scheduled",
    delivery_responsibility: "pilot",
  }).select("id").single();
  assert.ifError(jobError);

  const { data: assignments, error: assignmentError } = await admin.from("mission_assignments").insert([
    { job_id: job.id, contractor_id: owner.id, status: "accepted", assignment_role: "owner" },
    { job_id: job.id, contractor_id: field.id, status: "accepted", assignment_role: "field", contractor_payout_cents: 10000 },
  ]).select("id,contractor_id,assignment_role");
  assert.ifError(assignmentError);
  const fieldAssignment = assignments.find((item) => item.contractor_id === field.id);
  assert.ok(fieldAssignment);

  const auth = createClient(supabaseURL, anonKey, { auth: { persistSession: false } });
  const { data: signedIn, error: signInError } = await auth.auth.signInWithPassword({ email: fieldEmail, password });
  assert.ifError(signInError);
  assert.ok(signedIn.session);

  const api = await request.newContext({ baseURL });
  try {
    const before = assignments.length;
    const response = await api.post(`/api/pilot/missions/${fieldAssignment.id}/team`, {
      headers: { Authorization: `Bearer ${signedIn.session.access_token}` },
      data: { action: "offer", contractorId: extra.id, payoutCents: 5000 },
      failOnStatusCode: false,
    });
    const body = await response.json().catch(() => ({}));
    assert.equal(response.status(), 403, JSON.stringify(body));
    assert.match(body.error ?? "", /only the pilot mission owner/i);

    const { count, error: countError } = await admin.from("mission_assignments")
      .select("id", { count: "exact", head: true })
      .eq("job_id", job.id);
    assert.ifError(countError);
    assert.equal(count, before);
  } finally {
    await api.dispose();
    await admin.from("mission_assignments").delete().eq("job_id", job.id);
    await admin.from("jobs").delete().eq("id", job.id);
    await admin.from("mission_requests").delete().eq("id", mission.id);
    await admin.from("contractors").delete().in("id", [owner.id, field.id, extra.id]);
    for (const user of users) await admin.auth.admin.deleteUser(user.id);
  }
});


test("pilot cannot respond to another pilot assignment", { skip: !isolated }, async () => {
  assert.ok(supabaseURL && anonKey && serviceKey, "isolated Supabase credentials are required");
  assert.match(supabaseURL, /^https?:\/\/(127\.0\.0\.1|localhost)(:|\/)/, "E2E database must be local");

  const admin = createClient(supabaseURL, serviceKey, { auth: { persistSession: false } });
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const password = `Dom-Respond-Isolation-${stamp}!Aa1`;
  const attackerEmail = `respond-attacker-${stamp}@e2e.dom.invalid`;
  const targetEmail = `respond-target-${stamp}@e2e.dom.invalid`;

  const users = [];
  for (const email of [attackerEmail, targetEmail]) {
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    assert.ifError(error);
    users.push(data.user);
  }

  const { data: contractors, error: contractorError } = await admin.from("contractors").insert([
    { user_id: users[0].id, full_name: "Respond Attacker", email: attackerEmail, status: "active", part107_verified: true, can_create_missions: false },
    { user_id: users[1].id, full_name: "Respond Target", email: targetEmail, status: "active", part107_verified: true, can_create_missions: false },
  ]).select("id,user_id");
  assert.ifError(contractorError);
  const attacker = contractors.find((item) => item.user_id === users[0].id);
  const target = contractors.find((item) => item.user_id === users[1].id);
  assert.ok(attacker && target);

  const { data: mission, error: missionError } = await admin.from("mission_requests").insert({
    requester_name: "Response Client",
    requester_email: `response-client-${stamp}@e2e.dom.invalid`,
    company: "Response Isolation Test",
    service_type: "aerial_images",
    location: "Response Site",
    status: "assigned",
  }).select("id").single();
  assert.ifError(missionError);

  const { data: job, error: jobError } = await admin.from("jobs").insert({
    mission_request_id: mission.id,
    title: "Response Isolation Mission",
    service_type: "aerial_images",
    location: "Response Site",
    status: "scheduled",
    delivery_responsibility: "admin",
  }).select("id").single();
  assert.ifError(jobError);

  const { data: assignment, error: assignmentError } = await admin.from("mission_assignments").insert({
    job_id: job.id,
    contractor_id: target.id,
    status: "offered",
    assignment_role: "field",
  }).select("id,status").single();
  assert.ifError(assignmentError);

  const auth = createClient(supabaseURL, anonKey, { auth: { persistSession: false } });
  const { data: signedIn, error: signInError } = await auth.auth.signInWithPassword({ email: attackerEmail, password });
  assert.ifError(signInError);
  assert.ok(signedIn.session);

  const api = await request.newContext({ baseURL });
  try {
    for (const action of ["accept", "decline", "return"]) {
      const response = await api.post(`/api/pilot/missions/${assignment.id}/respond`, {
        headers: { Authorization: `Bearer ${signedIn.session.access_token}` },
        data: { action, reason: "Unauthorized attempt" },
        failOnStatusCode: false,
      });
      assert.equal(response.status(), 404, `unauthorized ${action} should be hidden as not found`);
    }

    const { data: unchanged, error: unchangedError } = await admin.from("mission_assignments")
      .select("status,accepted_at,decline_reason")
      .eq("id", assignment.id)
      .single();
    assert.ifError(unchangedError);
    assert.equal(unchanged.status, "offered");
    assert.equal(unchanged.accepted_at, null);
    assert.equal(unchanged.decline_reason, null);
  } finally {
    await api.dispose();
    await admin.from("mission_assignments").delete().eq("id", assignment.id);
    await admin.from("jobs").delete().eq("id", job.id);
    await admin.from("mission_requests").delete().eq("id", mission.id);
    await admin.from("contractors").delete().in("id", [attacker.id, target.id]);
    for (const user of users) await admin.auth.admin.deleteUser(user.id);
  }
});


test("pilot cannot access reviews through another pilot assignment", { skip: !isolated }, async () => {
  assert.ok(supabaseURL && anonKey && serviceKey, "isolated Supabase credentials are required");
  assert.match(supabaseURL, /^https?:\/\/(127\.0\.0\.1|localhost)(:|\/)/, "E2E database must be local");

  const admin = createClient(supabaseURL, serviceKey, { auth: { persistSession: false } });
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const password = `Dom-Review-Isolation-${stamp}!Aa1`;
  const attackerEmail = `review-attacker-${stamp}@e2e.dom.invalid`;
  const ownerEmail = `review-owner-${stamp}@e2e.dom.invalid`;

  const users = [];
  for (const email of [attackerEmail, ownerEmail]) {
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    assert.ifError(error);
    users.push(data.user);
  }

  const { data: contractors, error: contractorError } = await admin.from("contractors").insert([
    { user_id: users[0].id, full_name: "Review Attacker", email: attackerEmail, status: "active", part107_verified: true, can_create_missions: false },
    { user_id: users[1].id, full_name: "Review Owner", email: ownerEmail, status: "active", part107_verified: true, can_create_missions: false },
  ]).select("id,user_id");
  assert.ifError(contractorError);
  const attacker = contractors.find((item) => item.user_id === users[0].id);
  const owner = contractors.find((item) => item.user_id === users[1].id);
  assert.ok(attacker && owner);

  const { data: mission, error: missionError } = await admin.from("mission_requests").insert({
    requester_name: "Review Client",
    requester_email: `review-client-${stamp}@e2e.dom.invalid`,
    company: "Review Isolation Test",
    service_type: "aerial_images",
    location: "Review Site",
    status: "delivered",
  }).select("id").single();
  assert.ifError(missionError);

  const { data: job, error: jobError } = await admin.from("jobs").insert({
    mission_request_id: mission.id,
    title: "Review Isolation Mission",
    service_type: "aerial_images",
    location: "Review Site",
    status: "delivered",
  }).select("id").single();
  assert.ifError(jobError);

  const { data: assignment, error: assignmentError } = await admin.from("mission_assignments").insert({
    job_id: job.id,
    contractor_id: owner.id,
    status: "qc_passed",
  }).select("id").single();
  assert.ifError(assignmentError);

  const auth = createClient(supabaseURL, anonKey, { auth: { persistSession: false } });
  const { data: signedIn, error: signInError } = await auth.auth.signInWithPassword({ email: attackerEmail, password });
  assert.ifError(signInError);
  assert.ok(signedIn.session);

  const headers = { Authorization: `Bearer ${signedIn.session.access_token}` };
  const api = await request.newContext({ baseURL });
  try {
    const readResponse = await api.get(`/api/pilot/missions/${assignment.id}/reviews`, {
      headers,
      failOnStatusCode: false,
    });
    assert.equal(readResponse.status(), 403);

    const writeResponse = await api.post(`/api/pilot/missions/${assignment.id}/reviews`, {
      headers,
      data: {
        targetType: "mission",
        overallRating: 5,
        communicationRating: 5,
        preparednessRating: 5,
        accuracyRating: 5,
        wouldWorkAgain: true,
        comments: "Unauthorized review",
      },
      failOnStatusCode: false,
    });
    assert.equal(writeResponse.status(), 403);

    const { count, error: countError } = await admin.from("mission_reviews")
      .select("id", { count: "exact", head: true })
      .eq("job_id", job.id)
      .eq("reviewer_user_id", users[0].id);
    assert.ifError(countError);
    assert.equal(count, 0);
  } finally {
    await api.dispose();
    await admin.from("mission_reviews").delete().eq("job_id", job.id);
    await admin.from("mission_assignments").delete().eq("id", assignment.id);
    await admin.from("jobs").delete().eq("id", job.id);
    await admin.from("mission_requests").delete().eq("id", mission.id);
    await admin.from("contractors").delete().in("id", [attacker.id, owner.id]);
    for (const user of users) await admin.auth.admin.deleteUser(user.id);
  }
});


test("client review targets the current pilot after reassignment", { skip: !isolated }, async () => {
  assert.ok(supabaseURL && anonKey && serviceKey, "isolated Supabase credentials are required");
  assert.match(supabaseURL, /^https?:\/\/(127\.0\.0\.1|localhost)(:|\/)/, "E2E database must be local");

  const admin = createClient(supabaseURL, serviceKey, { auth: { persistSession: false } });
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const password = `Dom-Client-Review-${stamp}!Aa1`;
  const clientEmail = `review-client-${stamp}@e2e.dom.invalid`;

  const { data: clientUserData, error: clientUserError } = await admin.auth.admin.createUser({
    email: clientEmail,
    password,
    email_confirm: true,
  });
  assert.ifError(clientUserError);
  const clientUser = clientUserData.user;
  assert.ok(clientUser);

  const { data: client, error: clientError } = await admin.from("clients").insert({
    company_name: "Review Reassignment Client",
    contact_name: "Review Client",
    email: clientEmail,
    user_id: clientUser.id,
  }).select("id").single();
  assert.ifError(clientError);

  const { data: pilots, error: pilotError } = await admin.from("contractors").insert([
    {
      full_name: "Old Cancelled Pilot",
      email: `old-pilot-${stamp}@e2e.dom.invalid`,
      status: "active",
      part107_verified: true,
      can_create_missions: false,
    },
    {
      full_name: "Current Completed Pilot",
      email: `current-pilot-${stamp}@e2e.dom.invalid`,
      status: "active",
      part107_verified: true,
      can_create_missions: false,
    },
  ]).select("id,full_name");
  assert.ifError(pilotError);
  const oldPilot = pilots.find((item) => item.full_name === "Old Cancelled Pilot");
  const currentPilot = pilots.find((item) => item.full_name === "Current Completed Pilot");
  assert.ok(oldPilot && currentPilot);

  const { data: mission, error: missionError } = await admin.from("mission_requests").insert({
    client_id: client.id,
    requester_name: "Review Client",
    requester_email: clientEmail,
    company: "Review Reassignment Client",
    service_type: "aerial_images",
    location: "Review Reassignment Site",
    status: "delivered",
  }).select("id").single();
  assert.ifError(missionError);

  const { data: job, error: jobError } = await admin.from("jobs").insert({
    mission_request_id: mission.id,
    client_id: client.id,
    title: "Reassigned Review Mission",
    service_type: "aerial_images",
    location: "Review Reassignment Site",
    status: "delivered",
  }).select("id").single();
  assert.ifError(jobError);

  const { data: assignments, error: assignmentError } = await admin.from("mission_assignments").insert([
    {
      job_id: job.id,
      contractor_id: oldPilot.id,
      status: "cancelled",
      assignment_role: "field",
    },
    {
      job_id: job.id,
      contractor_id: currentPilot.id,
      status: "qc_passed",
      assignment_role: "field",
    },
  ]).select("id,contractor_id,status");
  assert.ifError(assignmentError);

  const auth = createClient(supabaseURL, anonKey, { auth: { persistSession: false } });
  const { data: signedIn, error: signInError } = await auth.auth.signInWithPassword({
    email: clientEmail,
    password,
  });
  assert.ifError(signInError);
  assert.ok(signedIn.session);

  const api = await request.newContext({ baseURL });
  try {
    const response = await api.post(`/api/client/reviews/${job.id}`, {
      headers: {
        Authorization: `Bearer ${signedIn.session.access_token}`,
        "Content-Type": "application/json",
      },
      data: {
        targetType: "pilot",
        overallRating: 5,
        communicationRating: 5,
        preparednessRating: 5,
        accuracyRating: 5,
        wouldWorkAgain: true,
        comments: "Current pilot review",
      },
      failOnStatusCode: false,
    });
    const body = await response.json().catch(() => ({}));
    assert.equal(response.status(), 200, JSON.stringify(body));

    const { data: review, error: reviewError } = await admin.from("mission_reviews")
      .select("target_contractor_id")
      .eq("job_id", job.id)
      .eq("reviewer_user_id", clientUser.id)
      .eq("target_type", "pilot")
      .single();
    assert.ifError(reviewError);
    assert.equal(review.target_contractor_id, currentPilot.id);
    assert.notEqual(review.target_contractor_id, oldPilot.id);
  } finally {
    await api.dispose();
    await admin.from("mission_reviews").delete().eq("job_id", job.id);
    await admin.from("mission_assignments").delete().in("id", assignments.map((item) => item.id));
    await admin.from("jobs").delete().eq("id", job.id);
    await admin.from("mission_requests").delete().eq("id", mission.id);
    await admin.from("contractors").delete().in("id", [oldPilot.id, currentPilot.id]);
    await admin.from("clients").delete().eq("id", client.id);
    await admin.auth.admin.deleteUser(clientUser.id);
  }
});


test("admin cannot cancel started or paid mission records", { skip: !isolated }, async () => {
  assert.ok(supabaseURL && anonKey && serviceKey, "isolated Supabase credentials are required");
  assert.match(supabaseURL, /^https?:\/\/(127\.0\.0\.1|localhost)(:|\/)/, "E2E database must be local");

  const admin = createClient(supabaseURL, serviceKey, { auth: { persistSession: false } });
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const adminEmail = `cancel-admin-${stamp}@e2e.dom.invalid`;
  const password = `Dom-Cancel-E2E-${stamp}!Aa1`;

  const { data: adminUserData, error: adminUserError } = await admin.auth.admin.createUser({
    email: adminEmail,
    password,
    email_confirm: true,
  });
  assert.ifError(adminUserError);
  const adminUser = adminUserData.user;
  assert.ok(adminUser);

  const { error: allowError } = await admin.from("admin_users").insert({
    email: adminEmail,
    full_name: "E2E Cancellation Admin",
    role: "admin",
  });
  assert.ifError(allowError);

  const { data: pilot, error: pilotError } = await admin.from("contractors").insert({
    full_name: "E2E Cancellation Pilot",
    email: `cancel-pilot-${stamp}@e2e.dom.invalid`,
    status: "active",
    part107_verified: true,
    can_create_missions: false,
  }).select("id").single();
  assert.ifError(pilotError);

  const makeMission = async ({ suffix, missionStatus, jobStatus, assignmentStatus, startedAt }) => {
    const { data: mission, error: missionError } = await admin.from("mission_requests").insert({
      requester_name: `Cancel Client ${suffix}`,
      requester_email: `cancel-${suffix}-${stamp}@e2e.dom.invalid`,
      company: `Cancel Test ${suffix}`,
      service_type: "aerial_images",
      location: `Cancel Site ${suffix}`,
      status: missionStatus,
    }).select("id").single();
    assert.ifError(missionError);

    const { data: job, error: jobError } = await admin.from("jobs").insert({
      mission_request_id: mission.id,
      title: `Cancellation Mission ${suffix}`,
      service_type: "aerial_images",
      location: `Cancel Site ${suffix}`,
      status: jobStatus,
      started_at: startedAt,
    }).select("id").single();
    assert.ifError(jobError);

    const { data: assignment, error: assignmentError } = await admin.from("mission_assignments").insert({
      job_id: job.id,
      contractor_id: pilot.id,
      status: assignmentStatus,
    }).select("id").single();
    assert.ifError(assignmentError);

    return { mission, job, assignment };
  };

  const started = await makeMission({
    suffix: "Started",
    missionStatus: "in_progress",
    jobStatus: "in_progress",
    assignmentStatus: "in_progress",
    startedAt: new Date().toISOString(),
  });
  const paid = await makeMission({
    suffix: "Paid",
    missionStatus: "delivered",
    jobStatus: "delivered",
    assignmentStatus: "paid",
    startedAt: null,
  });

  const auth = createClient(supabaseURL, anonKey, { auth: { persistSession: false } });
  const { data: signedIn, error: signInError } = await auth.auth.signInWithPassword({ email: adminEmail, password });
  assert.ifError(signInError);
  assert.ok(signedIn.session);

  const api = await request.newContext({ baseURL });
  try {
    for (const record of [
      { ...started, expectedMission: "in_progress", expectedJob: "in_progress", expectedAssignment: "in_progress" },
      { ...paid, expectedMission: "delivered", expectedJob: "delivered", expectedAssignment: "paid" },
    ]) {
      const response = await api.patch(`/api/admin/missions/${record.mission.id}`, {
        headers: {
          Authorization: `Bearer ${signedIn.session.access_token}`,
          "Content-Type": "application/json",
        },
        data: {
          title: "Cancellation Protection Test",
          requesterName: "Cancellation Client",
          requesterEmail: `cancel-client-${stamp}@e2e.dom.invalid`,
          company: "Cancellation Protection",
          serviceType: "aerial_images",
          location: "Cancellation Site",
          scope: "",
          status: "cancelled",
          quotedAmountCents: null,
          scheduledFor: null,
        },
        failOnStatusCode: false,
      });
      const body = await response.json().catch(() => ({}));
      assert.equal(response.status(), 409, JSON.stringify(body));

      const [{ data: missionAfter }, { data: jobAfter }, { data: assignmentAfter }] = await Promise.all([
        admin.from("mission_requests").select("status").eq("id", record.mission.id).single(),
        admin.from("jobs").select("status").eq("id", record.job.id).single(),
        admin.from("mission_assignments").select("status").eq("id", record.assignment.id).single(),
      ]);
      assert.equal(missionAfter.status, record.expectedMission);
      assert.equal(jobAfter.status, record.expectedJob);
      assert.equal(assignmentAfter.status, record.expectedAssignment);
    }
  } finally {
    await api.dispose();
    for (const record of [started, paid]) {
      await admin.from("mission_assignments").delete().eq("id", record.assignment.id);
      await admin.from("jobs").delete().eq("id", record.job.id);
      await admin.from("mission_requests").delete().eq("id", record.mission.id);
    }
    await admin.from("admin_users").delete().eq("email", adminEmail);
    await admin.auth.admin.deleteUser(adminUser.id);
  }
});


test("client cannot access reviews for another client job", { skip: !isolated }, async () => {
  assert.ok(supabaseURL && anonKey && serviceKey, "isolated Supabase credentials are required");
  assert.match(supabaseURL, /^https?:\/\/(127\.0\.0\.1|localhost)(:|\/)/, "E2E database must be local");

  const admin = createClient(supabaseURL, serviceKey, { auth: { persistSession: false } });
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const password = `Dom-Client-Review-Isolation-${stamp}!Aa1`;
  const emails = [
    `client-review-a-${stamp}@e2e.dom.invalid`,
    `client-review-b-${stamp}@e2e.dom.invalid`,
  ];

  const users = [];
  for (const email of emails) {
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    assert.ifError(error);
    users.push(data.user);
  }

  const { data: clients, error: clientsError } = await admin.from("clients").insert([
    { company_name: "Client Review A", contact_name: "A", email: emails[0], user_id: users[0].id },
    { company_name: "Client Review B", contact_name: "B", email: emails[1], user_id: users[1].id },
  ]).select("id,user_id");
  assert.ifError(clientsError);
  const clientA = clients.find((item) => item.user_id === users[0].id);
  const clientB = clients.find((item) => item.user_id === users[1].id);
  assert.ok(clientA && clientB);

  const { data: missionB, error: missionError } = await admin.from("mission_requests").insert({
    client_id: clientB.id,
    requester_name: "B",
    requester_email: emails[1],
    company: "Client Review B",
    service_type: "aerial_images",
    location: "Client Review B Site",
    status: "delivered",
  }).select("id").single();
  assert.ifError(missionError);

  const { data: jobB, error: jobError } = await admin.from("jobs").insert({
    mission_request_id: missionB.id,
    client_id: clientB.id,
    title: "Client Review B Mission",
    service_type: "aerial_images",
    location: "Client Review B Site",
    status: "delivered",
  }).select("id").single();
  assert.ifError(jobError);

  const authA = createClient(supabaseURL, anonKey, { auth: { persistSession: false } });
  const { data: signedInA, error: signInError } = await authA.auth.signInWithPassword({
    email: emails[0],
    password,
  });
  assert.ifError(signInError);
  assert.ok(signedInA.session);

  const headers = { Authorization: `Bearer ${signedInA.session.access_token}` };
  const api = await request.newContext({ baseURL });
  try {
    const getResponse = await api.get(`/api/client/reviews/${jobB.id}`, {
      headers,
      failOnStatusCode: false,
    });
    assert.equal(getResponse.status(), 403);

    const postResponse = await api.post(`/api/client/reviews/${jobB.id}`, {
      headers,
      data: {
        targetType: "dom",
        overallRating: 5,
        communicationRating: 5,
        preparednessRating: 5,
        accuracyRating: 5,
        wouldWorkAgain: true,
        comments: "Unauthorized cross-client review",
      },
      failOnStatusCode: false,
    });
    assert.equal(postResponse.status(), 403);

    const { count, error: countError } = await admin.from("mission_reviews")
      .select("id", { count: "exact", head: true })
      .eq("job_id", jobB.id)
      .eq("reviewer_user_id", users[0].id);
    assert.ifError(countError);
    assert.equal(count, 0);
  } finally {
    await api.dispose();
    await admin.from("mission_reviews").delete().eq("job_id", jobB.id);
    await admin.from("jobs").delete().eq("id", jobB.id);
    await admin.from("mission_requests").delete().eq("id", missionB.id);
    await admin.from("clients").delete().in("id", [clientA.id, clientB.id]);
    for (const user of users) await admin.auth.admin.deleteUser(user.id);
  }
});


test("admin shop order follows guarded fulfillment transitions", { skip: !isolated }, async () => {
  assert.ok(supabaseURL && anonKey && serviceKey, "isolated Supabase credentials are required");
  assert.match(supabaseURL, /^https?:\/\/(127\.0\.0\.1|localhost)(:|\/)/, "E2E database must be local");

  const admin = createClient(supabaseURL, serviceKey, { auth: { persistSession: false } });
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const productKey = `e2e-order-state-${stamp}`;
  const orderId = crypto.randomUUID();
  const sessionId = `cs_e2e_state_${stamp}`;
  const paymentIntentId = `pi_e2e_state_${stamp}`;
  const adminEmail = `order-admin-${stamp}@e2e.dom.invalid`;
  const password = `Dom-Order-E2E-${stamp}!Aa1`;

  const { data: adminUserData, error: adminUserError } = await admin.auth.admin.createUser({
    email: adminEmail,
    password,
    email_confirm: true,
  });
  assert.ifError(adminUserError);
  const adminUser = adminUserData.user;
  assert.ok(adminUser);

  const { error: allowError } = await admin.from("admin_users").insert({
    email: adminEmail,
    full_name: "E2E Order Admin",
    role: "admin",
  });
  assert.ifError(allowError);

  const { error: inventoryError } = await admin.from("shop_inventory").insert({
    product_key: productKey,
    product_name: "E2E Order State Product",
    description: "Order transition regression fixture",
    unit_amount_cents: 1800,
    variants: [],
    category: "Equipment",
    active: true,
    fulfillment_mode: "stocked",
    available_quantity: 5,
    shipping_base_cents: 0,
    shipping_additional_cents: 0,
  });
  assert.ifError(inventoryError);

  const { error: checkoutError } = await admin.rpc("create_shop_checkout_service", {
    p_order_id: orderId,
    p_order_number: `E2E-STATE-${stamp}`,
    p_session_id: sessionId,
    p_product_key: productKey,
    p_product_name: "E2E Order State Product",
    p_variant: "",
    p_quantity: 1,
    p_unit_amount_cents: 1800,
    p_shipping_cents: 0,
  });
  assert.ifError(checkoutError);

  const { error: completeError } = await admin.rpc("complete_shop_order_service", {
    p_session_id: sessionId,
    p_payment_intent_id: paymentIntentId,
    p_customer_email: `order-customer-${stamp}@e2e.dom.invalid`,
    p_customer_name: "Order State Customer",
    p_customer_phone: null,
    p_currency: "usd",
    p_subtotal_cents: 1800,
    p_shipping_cents: 0,
    p_tax_cents: 0,
    p_discount_cents: 0,
    p_total_cents: 1800,
    p_shipping_name: "Order State Customer",
    p_shipping_address: {},
  });
  assert.ifError(completeError);

  const auth = createClient(supabaseURL, anonKey, { auth: { persistSession: false } });
  const { data: signedIn, error: signInError } = await auth.auth.signInWithPassword({ email: adminEmail, password });
  assert.ifError(signInError);
  assert.ok(signedIn.session);

  const api = await request.newContext({ baseURL });
  const headers = {
    Authorization: `Bearer ${signedIn.session.access_token}`,
    "Content-Type": "application/json",
  };

  try {
    const processing = await api.patch("/api/admin/orders", {
      headers,
      data: { action: "processing", orderId },
      failOnStatusCode: false,
    });
    assert.equal(processing.status(), 200, JSON.stringify(await processing.json().catch(() => ({}))));

    const shipped = await api.patch("/api/admin/orders", {
      headers,
      data: {
        action: "shipped",
        orderId,
        carrier: "UPS",
        trackingNumber: `1ZE2E${stamp.replace(/\W/g, "").slice(-8)}`,
        trackingUrl: "https://www.ups.com/track",
      },
      failOnStatusCode: false,
    });
    assert.equal(shipped.status(), 200, JSON.stringify(await shipped.json().catch(() => ({}))));

    const duplicateShip = await api.patch("/api/admin/orders", {
      headers,
      data: {
        action: "shipped",
        orderId,
        carrier: "UPS",
        trackingNumber: "DUPLICATE",
        trackingUrl: "https://www.ups.com/track",
      },
      failOnStatusCode: false,
    });
    assert.equal(duplicateShip.status(), 409);

    const delivered = await api.patch("/api/admin/orders", {
      headers,
      data: { action: "delivered", orderId },
      failOnStatusCode: false,
    });
    assert.equal(delivered.status(), 200, JSON.stringify(await delivered.json().catch(() => ({}))));

    const refundAfterDelivery = await api.patch("/api/admin/orders", {
      headers,
      data: { action: "refund", orderId },
      failOnStatusCode: false,
    });
    assert.equal(refundAfterDelivery.status(), 409);

    const { data: savedOrder, error: savedOrderError } = await admin.from("shop_orders")
      .select("status,payment_status,tracking_carrier,tracking_number,shipped_at,delivered_at")
      .eq("id", orderId)
      .single();
    assert.ifError(savedOrderError);
    assert.equal(savedOrder.status, "delivered");
    assert.equal(savedOrder.payment_status, "paid");
    assert.equal(savedOrder.tracking_carrier, "UPS");
    assert.ok(savedOrder.tracking_number);
    assert.ok(savedOrder.shipped_at);
    assert.ok(savedOrder.delivered_at);
  } finally {
    await api.dispose();
    await admin.from("shop_order_items").delete().eq("order_id", orderId);
    await admin.from("shop_orders").delete().eq("id", orderId);
    await admin.from("shop_inventory").delete().eq("product_key", productKey);
    await admin.from("admin_users").delete().eq("email", adminEmail);
    await admin.auth.admin.deleteUser(adminUser.id);
  }
});


test("admin communications returns outbound email history", { skip: !isolated }, async () => {
  assert.ok(supabaseURL && anonKey && serviceKey, "isolated Supabase credentials are required");
  assert.match(supabaseURL, /^https?:\/\/(127\.0\.0\.1|localhost)(:|\/)/, "E2E database must be local");

  const admin = createClient(supabaseURL, serviceKey, { auth: { persistSession: false } });
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const adminEmail = `message-admin-${stamp}@e2e.dom.invalid`;
  const password = `Dom-Message-E2E-${stamp}!Aa1`;
  const recipient = `email-log-${stamp}@e2e.dom.invalid`;
  const idempotencyKey = `e2e-email-log-${stamp}`;

  const { data: adminUserData, error: adminUserError } = await admin.auth.admin.createUser({
    email: adminEmail,
    password,
    email_confirm: true,
  });
  assert.ifError(adminUserError);
  const adminUser = adminUserData.user;
  assert.ok(adminUser);

  const { error: allowError } = await admin.from("admin_users").insert({
    email: adminEmail,
    full_name: "E2E Message Admin",
    role: "admin",
  });
  assert.ifError(allowError);

  const { data: notification, error: notificationError } = await admin.from("notification_log").insert({
    recipient_type: "customer",
    recipient_email: recipient,
    email_type: "booking_confirmation",
    status: "sent",
    subject: "E2E outbound email log",
    metadata: { source: "e2e" },
    idempotency_key: idempotencyKey,
    sent_at: new Date().toISOString(),
  }).select("id").single();
  assert.ifError(notificationError);

  const auth = createClient(supabaseURL, anonKey, { auth: { persistSession: false } });
  const { data: signedIn, error: signInError } = await auth.auth.signInWithPassword({ email: adminEmail, password });
  assert.ifError(signInError);
  assert.ok(signedIn.session);

  const api = await request.newContext({ baseURL });
  try {
    const response = await api.get("/api/admin/messages", {
      headers: { Authorization: `Bearer ${signedIn.session.access_token}` },
      failOnStatusCode: false,
    });
    const body = await response.json().catch(() => ({}));
    assert.equal(response.status(), 200, JSON.stringify(body));
    assert.ok(Array.isArray(body.notifications));

    const logged = body.notifications.find((item) => item.id === notification.id);
    assert.ok(logged, "outbound notification should appear in Admin Email Log");
    assert.equal(logged.recipient_email, recipient);
    assert.equal(logged.subject, "E2E outbound email log");
    assert.equal(logged.status, "sent");
    assert.equal(logged.idempotency_key, idempotencyKey);
  } finally {
    await api.dispose();
    await admin.from("notification_log").delete().eq("id", notification.id);
    await admin.from("admin_users").delete().eq("email", adminEmail);
    await admin.auth.admin.deleteUser(adminUser.id);
  }
});


test("client only sees the current QC-approved deliverable revision", { skip: !isolated }, async () => {
  assert.ok(supabaseURL && anonKey && serviceKey, "isolated Supabase credentials are required");
  assert.match(supabaseURL, /^https?:\/\/(127\.0\.0\.1|localhost)(:|\/)/, "E2E database must be local");

  const admin = createClient(supabaseURL, serviceKey, { auth: { persistSession: false } });
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const email = `revision-client-${stamp}@e2e.dom.invalid`;
  const password = `Dom-Revision-E2E-${stamp}!Aa1`;

  const { data: userData, error: userError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  assert.ifError(userError);
  const user = userData.user;
  assert.ok(user);

  const { data: client, error: clientError } = await admin.from("clients").insert({
    company_name: "Revision Client",
    contact_name: "Revision Client",
    email,
    user_id: user.id,
  }).select("id").single();
  assert.ifError(clientError);

  const { data: mission, error: missionError } = await admin.from("mission_requests").insert({
    client_id: client.id,
    requester_name: "Revision Client",
    requester_email: email,
    company: "Revision Client",
    service_type: "aerial_images",
    location: "Revision Site",
    status: "delivered",
  }).select("id").single();
  assert.ifError(missionError);

  const { data: job, error: jobError } = await admin.from("jobs").insert({
    mission_request_id: mission.id,
    client_id: client.id,
    title: "Revision Visibility Mission",
    service_type: "aerial_images",
    location: "Revision Site",
    status: "delivered",
  }).select("id").single();
  assert.ifError(jobError);

  const { data: oldDeliverable, error: oldError } = await admin.from("deliverables").insert({
    job_id: job.id,
    name: "Old Roof Report",
    type: "report",
    storage_url: `${job.id}/old-report.pdf`,
    qc_passed: true,
    client_status: "revision_requested",
    client_feedback: "Please correct the report.",
    revision_number: 1,
    delivered_at: new Date().toISOString(),
  }).select("id").single();
  assert.ifError(oldError);

  const { data: corrected, error: correctedError } = await admin.from("deliverables").insert({
    job_id: job.id,
    name: "Corrected Roof Report",
    type: "report",
    storage_url: `${job.id}/corrected-report.pdf`,
    qc_passed: false,
    client_status: "pending",
    supersedes_deliverable_id: oldDeliverable.id,
    revision_number: 2,
  }).select("id").single();
  assert.ifError(correctedError);

  const auth = createClient(supabaseURL, anonKey, { auth: { persistSession: false } });
  const { data: signedIn, error: signInError } = await auth.auth.signInWithPassword({ email, password });
  assert.ifError(signInError);
  assert.ok(signedIn.session);
  const headers = { Authorization: `Bearer ${signedIn.session.access_token}` };

  const api = await request.newContext({ baseURL });
  try {
    const before = await api.get("/api/client/access", { headers, failOnStatusCode: false });
    const beforeBody = await before.json().catch(() => ({}));
    assert.equal(before.status(), 200, JSON.stringify(beforeBody));
    const clientJobBefore = beforeBody.jobs.find((item) => item.id === job.id);
    assert.ok(clientJobBefore);
    assert.equal(clientJobBefore.deliverables.some((item) => item.id === oldDeliverable.id), false);
    assert.equal(clientJobBefore.deliverables.some((item) => item.id === corrected.id), false);

    const staleDownload = await api.get(`/api/client/deliverables/${oldDeliverable.id}/download`, {
      headers,
      failOnStatusCode: false,
    });
    assert.equal(staleDownload.status(), 404);

    const staleReview = await api.patch(`/api/client/deliverables/${oldDeliverable.id}`, {
      headers: { ...headers, "Content-Type": "application/json" },
      data: { status: "approved" },
      failOnStatusCode: false,
    });
    assert.equal(staleReview.status(), 409);

    const { error: qcError } = await admin.from("deliverables")
      .update({ qc_passed: true, delivered_at: new Date().toISOString() })
      .eq("id", corrected.id);
    assert.ifError(qcError);

    const after = await api.get("/api/client/access", { headers, failOnStatusCode: false });
    const afterBody = await after.json().catch(() => ({}));
    assert.equal(after.status(), 200, JSON.stringify(afterBody));
    const clientJobAfter = afterBody.jobs.find((item) => item.id === job.id);
    assert.ok(clientJobAfter);

    const visibleIds = clientJobAfter.deliverables.map((item) => item.id);
    assert.deepEqual(visibleIds, [corrected.id]);
  } finally {
    await api.dispose();
    await admin.from("deliverables").delete().in("id", [corrected.id, oldDeliverable.id]);
    await admin.from("jobs").delete().eq("id", job.id);
    await admin.from("mission_requests").delete().eq("id", mission.id);
    await admin.from("clients").delete().eq("id", client.id);
    await admin.auth.admin.deleteUser(user.id);
  }
});


test("DOM-assigned pilot submission stops at DOM QC", { skip: !isolated }, async () => {
  assert.ok(supabaseURL && anonKey && serviceKey, "isolated Supabase credentials are required");
  assert.match(supabaseURL, /^https?:\/\/(127\.0\.0\.1|localhost)(:|\/)/, "E2E database must be local");

  const admin = createClient(supabaseURL, serviceKey, { auth: { persistSession: false } });
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const email = `dom-qc-pilot-${stamp}@e2e.dom.invalid`;
  const password = `Dom-QC-E2E-${stamp}!Aa1`;

  const { data: userData, error: userError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  assert.ifError(userError);
  const user = userData.user;
  assert.ok(user);

  const { data: pilot, error: pilotError } = await admin.from("contractors").insert({
    user_id: user.id,
    full_name: "E2E DOM QC Pilot",
    email,
    status: "active",
    part107_verified: true,
    insurance_verified: true,
    insurance_provider: "E2E",
    insurance_policy_number: "DOM-QC-E2E",
    insurance_expires_on: "2099-12-31",
    can_create_missions: false,
  }).select("id").single();
  assert.ifError(pilotError);

  const { data: mission, error: missionError } = await admin.from("mission_requests").insert({
    requester_name: "DOM QC Client",
    requester_email: `dom-qc-client-${stamp}@e2e.dom.invalid`,
    company: "DOM QC Test",
    service_type: "aerial_images",
    location: "DOM QC Site",
    status: "in_progress",
    created_by_contractor_id: null,
    requires_admin_approval: true,
  }).select("id").single();
  assert.ifError(missionError);

  const { data: job, error: jobError } = await admin.from("jobs").insert({
    mission_request_id: mission.id,
    title: "DOM QC Mission",
    service_type: "aerial_images",
    location: "DOM QC Site",
    status: "in_progress",
    delivery_responsibility: "admin",
    scheduled_for: "2099-06-15T14:30:00.000Z",
    completed_at: new Date().toISOString(),
  }).select("id").single();
  assert.ifError(jobError);

  const { data: assignment, error: assignmentError } = await admin.from("mission_assignments").insert({
    job_id: job.id,
    contractor_id: pilot.id,
    status: "in_progress",
    assignment_role: "field",
    assigned_uav: "DJI Matrice 4E · FAA FA3DOMQC",
  }).select("id").single();
  assert.ifError(assignmentError);

  const { data: deliverable, error: deliverableError } = await admin.from("deliverables").insert({
    job_id: job.id,
    name: "DOM QC Aerial Images",
    type: "raw_images",
    storage_url: `${job.id}/dom-qc-images.zip`,
    qc_passed: false,
  }).select("id").single();
  assert.ifError(deliverableError);

  const auth = createClient(supabaseURL, anonKey, { auth: { persistSession: false } });
  const { data: signedIn, error: signInError } = await auth.auth.signInWithPassword({ email, password });
  assert.ifError(signInError);
  assert.ok(signedIn.session);
  const headers = { Authorization: `Bearer ${signedIn.session.access_token}` };

  const api = await request.newContext({ baseURL });
  try {
    const workflowResponse = await api.get(`/api/pilot/missions/${assignment.id}/workflow`, {
      headers,
      failOnStatusCode: false,
    });
    const workflow = await workflowResponse.json().catch(() => ({}));
    assert.equal(workflowResponse.status(), 200, JSON.stringify(workflow));
    assert.equal(workflow.ownership.completionMode, "dom_qc");

    const automatic = new Set(["uav_assigned", "insurance_verified", "schedule_confirmed", "capture_complete", "deliverables_uploaded", "mission_submitted"]);
    for (const item of workflow.items.filter((entry) => entry.required && !entry.completed && !automatic.has(entry.item_key))) {
      const check = await api.post(`/api/pilot/missions/${assignment.id}/workflow`, {
        headers,
        data: { action: "checklist", itemId: item.id, completed: true },
        failOnStatusCode: false,
      });
      assert.equal(check.status(), 200, JSON.stringify(await check.json().catch(() => ({}))));
    }

    const readyResponse = await api.get(`/api/pilot/missions/${assignment.id}/workflow`, {
      headers,
      failOnStatusCode: false,
    });
    const ready = await readyResponse.json().catch(() => ({}));
    assert.equal(readyResponse.status(), 200, JSON.stringify(ready));
    assert.equal(ready.submission.ready, true, JSON.stringify(ready.submission.blockers));

    const submit = await api.post(`/api/pilot/missions/${assignment.id}/workflow`, {
      headers,
      data: { action: "submit_for_qc" },
      failOnStatusCode: false,
    });
    assert.equal(submit.status(), 200, JSON.stringify(await submit.json().catch(() => ({}))));

    const [{ data: assignmentAfter }, { data: jobAfter }, { data: missionAfter }, { data: deliverableAfter }] = await Promise.all([
      admin.from("mission_assignments").select("status").eq("id", assignment.id).single(),
      admin.from("jobs").select("status").eq("id", job.id).single(),
      admin.from("mission_requests").select("status").eq("id", mission.id).single(),
      admin.from("deliverables").select("qc_passed,delivered_at").eq("id", deliverable.id).single(),
    ]);

    assert.equal(assignmentAfter.status, "submitted");
    assert.notEqual(jobAfter.status, "delivered");
    assert.notEqual(missionAfter.status, "delivered");
    assert.equal(deliverableAfter.qc_passed, false);
    assert.equal(deliverableAfter.delivered_at, null);
  } finally {
    await api.dispose();
    await admin.from("mission_checklist_items").delete().eq("assignment_id", assignment.id);
    await admin.from("deliverables").delete().eq("id", deliverable.id);
    await admin.from("mission_assignments").delete().eq("id", assignment.id);
    await admin.from("jobs").delete().eq("id", job.id);
    await admin.from("mission_requests").delete().eq("id", mission.id);
    await admin.from("contractors").delete().eq("id", pilot.id);
    await admin.auth.admin.deleteUser(user.id);
  }
});


test("pilot-owned mission certifies only the corrected current revision", { skip: !isolated }, async () => {
  assert.ok(supabaseURL && anonKey && serviceKey, "isolated Supabase credentials are required");
  assert.match(supabaseURL, /^https?:\/\/(127\.0\.0\.1|localhost)(:|\/)/, "E2E database must be local");

  const admin = createClient(supabaseURL, serviceKey, { auth: { persistSession: false } });
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const email = `owner-revision-${stamp}@e2e.dom.invalid`;
  const password = `Dom-Owner-Revision-${stamp}!Aa1`;

  const { data: userData, error: userError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  assert.ifError(userError);
  const user = userData.user;
  assert.ok(user);

  const { data: pilot, error: pilotError } = await admin.from("contractors").insert({
    user_id: user.id,
    full_name: "E2E Owner Revision Pilot",
    email,
    status: "active",
    part107_verified: true,
    insurance_verified: true,
    insurance_provider: "E2E",
    insurance_policy_number: "OWNER-REVISION-E2E",
    insurance_expires_on: "2099-12-31",
    can_create_missions: true,
    subscription_active: true,
  }).select("id").single();
  assert.ifError(pilotError);

  const { data: mission, error: missionError } = await admin.from("mission_requests").insert({
    requester_name: "Owner Revision Client",
    requester_email: `owner-revision-client-${stamp}@e2e.dom.invalid`,
    company: "Owner Revision Test",
    service_type: "aerial_images",
    location: "Owner Revision Site",
    status: "in_progress",
    created_by_contractor_id: pilot.id,
    requires_admin_approval: false,
  }).select("id").single();
  assert.ifError(missionError);

  const { data: job, error: jobError } = await admin.from("jobs").insert({
    mission_request_id: mission.id,
    title: "Owner Revision Mission",
    service_type: "aerial_images",
    location: "Owner Revision Site",
    status: "in_progress",
    delivery_responsibility: "pilot",
    scheduled_for: "2099-07-15T14:30:00.000Z",
    completed_at: new Date().toISOString(),
  }).select("id").single();
  assert.ifError(jobError);

  const { data: assignment, error: assignmentError } = await admin.from("mission_assignments").insert({
    job_id: job.id,
    contractor_id: pilot.id,
    status: "in_progress",
    assignment_role: "owner",
    assigned_uav: "DJI Matrice 4E · FAA FA3OWNERREV",
  }).select("id").single();
  assert.ifError(assignmentError);

  const { data: prior, error: priorError } = await admin.from("deliverables").insert({
    job_id: job.id,
    name: "Owner Revision v1",
    type: "raw_images",
    storage_url: `${job.id}/owner-v1.zip`,
    qc_passed: true,
    client_status: "revision_requested",
    client_feedback: "Please correct this package.",
    revision_number: 1,
    delivered_at: new Date(Date.now() - 60_000).toISOString(),
  }).select("id").single();
  assert.ifError(priorError);

  const { data: corrected, error: correctedError } = await admin.from("deliverables").insert({
    job_id: job.id,
    name: "Owner Revision v2",
    type: "raw_images",
    storage_url: `${job.id}/owner-v2.zip`,
    qc_passed: false,
    client_status: "pending",
    supersedes_deliverable_id: prior.id,
    revision_number: 2,
  }).select("id").single();
  assert.ifError(correctedError);

  const auth = createClient(supabaseURL, anonKey, { auth: { persistSession: false } });
  const { data: signedIn, error: signInError } = await auth.auth.signInWithPassword({ email, password });
  assert.ifError(signInError);
  assert.ok(signedIn.session);
  const headers = { Authorization: `Bearer ${signedIn.session.access_token}` };

  const api = await request.newContext({ baseURL });
  try {
    const workflowResponse = await api.get(`/api/pilot/missions/${assignment.id}/workflow`, {
      headers,
      failOnStatusCode: false,
    });
    const workflow = await workflowResponse.json().catch(() => ({}));
    assert.equal(workflowResponse.status(), 200, JSON.stringify(workflow));
    assert.equal(workflow.ownership.completionMode, "owner_delivery");

    const automatic = new Set(["uav_assigned", "insurance_verified", "schedule_confirmed", "capture_complete", "deliverables_uploaded", "mission_submitted"]);
    for (const item of workflow.items.filter((entry) => entry.required && !entry.completed && !automatic.has(entry.item_key))) {
      const check = await api.post(`/api/pilot/missions/${assignment.id}/workflow`, {
        headers,
        data: { action: "checklist", itemId: item.id, completed: true },
        failOnStatusCode: false,
      });
      assert.equal(check.status(), 200, JSON.stringify(await check.json().catch(() => ({}))));
    }

    const readyResponse = await api.get(`/api/pilot/missions/${assignment.id}/workflow`, {
      headers,
      failOnStatusCode: false,
    });
    const ready = await readyResponse.json().catch(() => ({}));
    assert.equal(readyResponse.status(), 200, JSON.stringify(ready));
    assert.equal(ready.submission.ready, true, JSON.stringify(ready.submission.blockers));

    const complete = await api.post(`/api/pilot/missions/${assignment.id}/workflow`, {
      headers,
      data: { action: "complete_mission" },
      failOnStatusCode: false,
    });
    assert.equal(complete.status(), 200, JSON.stringify(await complete.json().catch(() => ({}))));

    const [
      { data: assignmentAfter },
      { data: jobAfter },
      { data: missionAfter },
      { data: priorAfter },
      { data: correctedAfter },
    ] = await Promise.all([
      admin.from("mission_assignments").select("status").eq("id", assignment.id).single(),
      admin.from("jobs").select("status").eq("id", job.id).single(),
      admin.from("mission_requests").select("status").eq("id", mission.id).single(),
      admin.from("deliverables").select("qc_passed,client_status,delivered_at").eq("id", prior.id).single(),
      admin.from("deliverables").select("qc_passed,client_status,delivered_at").eq("id", corrected.id).single(),
    ]);

    assert.equal(assignmentAfter.status, "qc_passed");
    assert.equal(jobAfter.status, "delivered");
    assert.equal(missionAfter.status, "delivered");
    assert.equal(priorAfter.client_status, "superseded");
    assert.equal(correctedAfter.qc_passed, true);
    assert.ok(correctedAfter.delivered_at);
  } finally {
    await api.dispose();
    await admin.from("mission_checklist_items").delete().eq("assignment_id", assignment.id);
    await admin.from("notification_log").delete().eq("assignment_id", assignment.id);
    await admin.from("deliverables").delete().in("id", [corrected.id, prior.id]);
    await admin.from("mission_assignments").delete().eq("id", assignment.id);
    await admin.from("jobs").delete().eq("id", job.id);
    await admin.from("mission_requests").delete().eq("id", mission.id);
    await admin.from("contractors").delete().eq("id", pilot.id);
    await admin.auth.admin.deleteUser(user.id);
  }
});


test("admin lead conversion is atomic and idempotent", { skip: !isolated }, async () => {
  assert.ok(supabaseURL && anonKey && serviceKey, "isolated Supabase credentials are required");
  assert.match(supabaseURL, /^https?:\/\/(127\.0\.0\.1|localhost)(:|\/)/, "E2E database must be local");

  const admin = createClient(supabaseURL, serviceKey, { auth: { persistSession: false } });
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const adminEmail = `convert-admin-${stamp}@e2e.dom.invalid`;
  const password = `Dom-Convert-E2E-${stamp}!Aa1`;
  const leadEmail = `convert-lead-${stamp}@e2e.dom.invalid`;

  const { data: adminUserData, error: adminUserError } = await admin.auth.admin.createUser({
    email: adminEmail,
    password,
    email_confirm: true,
  });
  assert.ifError(adminUserError);
  const adminUser = adminUserData.user;
  assert.ok(adminUser);

  const { error: allowError } = await admin.from("admin_users").insert({
    email: adminEmail,
    full_name: "E2E Conversion Admin",
    role: "admin",
  });
  assert.ifError(allowError);

  const { data: lead, error: leadError } = await admin.from("leads").insert({
    name: "E2E Conversion Lead",
    email: leadEmail,
    company: "E2E Conversion Company",
    phone: "555-0199",
    industry: "roofing",
    source: "e2e",
    status: "qualified",
  }).select("id").single();
  assert.ifError(leadError);

  const { data: originalActivity, error: activityError } = await admin.from("lead_activities").insert({
    lead_id: lead.id,
    activity_type: "call",
    summary: "Existing CRM history before conversion",
    created_by: adminEmail,
  }).select("id").single();
  assert.ifError(activityError);

  const auth = createClient(supabaseURL, anonKey, { auth: { persistSession: false } });
  const { data: signedIn, error: signInError } = await auth.auth.signInWithPassword({
    email: adminEmail,
    password,
  });
  assert.ifError(signInError);
  assert.ok(signedIn.session);

  const headers = {
    Authorization: `Bearer ${signedIn.session.access_token}`,
    "Content-Type": "application/json",
  };
  const api = await request.newContext({ baseURL });

  let clientId = null;
  try {
    const first = await api.post(`/api/admin/leads/${lead.id}/convert`, {
      headers,
      data: {},
      failOnStatusCode: false,
    });
    const firstBody = await first.json().catch(() => ({}));
    assert.equal(first.status(), 200, JSON.stringify(firstBody));
    clientId = firstBody.clientId;
    assert.ok(clientId);

    const [{ data: convertedLead }, { data: client }, { data: activities }] = await Promise.all([
      admin.from("leads").select("id,status").eq("id", lead.id).single(),
      admin.from("clients").select("id,lead_id,email,company_name").eq("id", clientId).single(),
      admin.from("lead_activities").select("id,activity_type,summary,created_by").eq("lead_id", lead.id).order("created_at"),
    ]);

    assert.equal(convertedLead.status, "won");
    assert.equal(client.lead_id, lead.id);
    assert.equal(client.email, leadEmail);
    assert.equal(client.company_name, "E2E Conversion Company");
    assert.ok(activities.some((item) => item.id === originalActivity.id && item.summary === "Existing CRM history before conversion"));
    assert.equal(activities.filter((item) => item.summary === "Converted to client (status: Won)").length, 1);

    const second = await api.post(`/api/admin/leads/${lead.id}/convert`, {
      headers,
      data: {},
      failOnStatusCode: false,
    });
    const secondBody = await second.json().catch(() => ({}));
    assert.equal(second.status(), 200, JSON.stringify(secondBody));
    assert.equal(secondBody.clientId, clientId);

    const [{ count: clientCount }, { data: activitiesAfter }] = await Promise.all([
      admin.from("clients").select("id", { count: "exact", head: true }).eq("lead_id", lead.id),
      admin.from("lead_activities").select("summary").eq("lead_id", lead.id),
    ]);
    assert.equal(clientCount, 1);
    assert.equal(activitiesAfter.filter((item) => item.summary === "Converted to client (status: Won)").length, 1);
  } finally {
    await api.dispose();
    if (clientId) await admin.from("clients").delete().eq("id", clientId);
    await admin.from("lead_activities").delete().eq("lead_id", lead.id);
    await admin.from("leads").delete().eq("id", lead.id);
    await admin.from("admin_users").delete().eq("email", adminEmail);
    await admin.auth.admin.deleteUser(adminUser.id);
  }
});


test("admin lead conversion can atomically link an existing client", { skip: !isolated }, async () => {
  assert.ok(supabaseURL && anonKey && serviceKey, "isolated Supabase credentials are required");
  assert.match(supabaseURL, /^https?:\/\/(127\.0\.0\.1|localhost)(:|\/)/, "E2E database must be local");

  const admin = createClient(supabaseURL, serviceKey, { auth: { persistSession: false } });
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const adminEmail = `link-admin-${stamp}@e2e.dom.invalid`;
  const password = `Dom-Link-E2E-${stamp}!Aa1`;
  const customerEmail = `existing-client-${stamp}@e2e.dom.invalid`;

  const { data: adminUserData, error: adminUserError } = await admin.auth.admin.createUser({
    email: adminEmail,
    password,
    email_confirm: true,
  });
  assert.ifError(adminUserError);
  const adminUser = adminUserData.user;
  assert.ok(adminUser);

  const { error: allowError } = await admin.from("admin_users").insert({
    email: adminEmail,
    full_name: "E2E Link Admin",
    role: "admin",
  });
  assert.ifError(allowError);

  const { data: lead, error: leadError } = await admin.from("leads").insert({
    name: "Existing Client Lead",
    email: customerEmail,
    company: "Lead Company Name",
    phone: "555-0111",
    industry: "roofing",
    source: "e2e",
    status: "qualified",
  }).select("id").single();
  assert.ifError(leadError);

  const { data: existingClient, error: clientError } = await admin.from("clients").insert({
    company_name: "Existing Client Company",
    contact_name: "Existing Contact",
    email: customerEmail,
    phone: null,
    industry: null,
    lead_id: null,
  }).select("id,company_name,contact_name").single();
  assert.ifError(clientError);

  const auth = createClient(supabaseURL, anonKey, { auth: { persistSession: false } });
  const { data: signedIn, error: signInError } = await auth.auth.signInWithPassword({
    email: adminEmail,
    password,
  });
  assert.ifError(signInError);
  assert.ok(signedIn.session);

  const api = await request.newContext({ baseURL });
  try {
    const response = await api.post(`/api/admin/leads/${lead.id}/convert`, {
      headers: {
        Authorization: `Bearer ${signedIn.session.access_token}`,
        "Content-Type": "application/json",
      },
      data: { existingClientId: existingClient.id },
      failOnStatusCode: false,
    });
    const body = await response.json().catch(() => ({}));
    assert.equal(response.status(), 200, JSON.stringify(body));
    assert.equal(body.clientId, existingClient.id);

    const [{ data: linkedClient }, { data: convertedLead }, { data: activities }] = await Promise.all([
      admin.from("clients").select("id,lead_id,company_name,contact_name,phone,industry").eq("id", existingClient.id).single(),
      admin.from("leads").select("status").eq("id", lead.id).single(),
      admin.from("lead_activities").select("summary").eq("lead_id", lead.id),
    ]);

    assert.equal(linkedClient.lead_id, lead.id);
    assert.equal(linkedClient.company_name, "Existing Client Company");
    assert.equal(linkedClient.contact_name, "Existing Contact");
    assert.equal(linkedClient.phone, "555-0111");
    assert.equal(linkedClient.industry, "roofing");
    assert.equal(convertedLead.status, "won");
    assert.equal(activities.filter((item) => item.summary === "Linked to existing client (status: Won)").length, 1);
  } finally {
    await api.dispose();
    await admin.from("clients").delete().eq("id", existingClient.id);
    await admin.from("lead_activities").delete().eq("lead_id", lead.id);
    await admin.from("leads").delete().eq("id", lead.id);
    await admin.from("admin_users").delete().eq("email", adminEmail);
    await admin.auth.admin.deleteUser(adminUser.id);
  }
});


test("CRM relationship history remains visible after lead conversion", { skip: !isolated }, async () => {
  assert.ok(supabaseURL && anonKey && serviceKey, "isolated Supabase credentials are required");
  assert.match(supabaseURL, /^https?:\/\/(127\.0\.0\.1|localhost)(:|\/)/, "E2E database must be local");

  const admin = createClient(supabaseURL, serviceKey, { auth: { persistSession: false } });
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const adminEmail = `history-admin-${stamp}@e2e.dom.invalid`;
  const password = `Dom-History-E2E-${stamp}!Aa1`;

  const { data: adminUserData, error: adminUserError } = await admin.auth.admin.createUser({
    email: adminEmail,
    password,
    email_confirm: true,
  });
  assert.ifError(adminUserError);
  const adminUser = adminUserData.user;
  assert.ok(adminUser);

  const { error: allowError } = await admin.from("admin_users").insert({
    email: adminEmail,
    full_name: "E2E History Admin",
    role: "admin",
  });
  assert.ifError(allowError);

  const { data: lead, error: leadError } = await admin.from("leads").insert({
    name: "E2E History Lead",
    email: `history-lead-${stamp}@e2e.dom.invalid`,
    company: "E2E History Company",
    source: "e2e",
    status: "qualified",
  }).select("id").single();
  assert.ifError(leadError);

  const [{ data: contact, error: contactError }, { data: location, error: locationError }, { data: activity, error: activityError }, { data: nextAction, error: nextActionError }, { data: note, error: noteError }] = await Promise.all([
    admin.from("lead_contacts").insert({
      lead_id: lead.id,
      name: "History Contact",
      email: `contact-${stamp}@e2e.dom.invalid`,
      title: "Operations Manager",
      is_primary: true,
    }).select("id").single(),
    admin.from("lead_locations").insert({
      lead_id: lead.id,
      label: "Main Site",
      address: "123 Test Street",
      notes: "Preserve this location",
    }).select("id").single(),
    admin.from("lead_activities").insert({
      lead_id: lead.id,
      activity_type: "meeting",
      summary: "Pre-conversion relationship meeting",
      created_by: adminEmail,
    }).select("id").single(),
    admin.from("lead_next_actions").insert({
      lead_id: lead.id,
      action_type: "follow_up",
      status: "open",
      assigned_to: adminEmail,
      notes: "Follow up after conversion",
    }).select("id").single(),
    admin.from("notes").insert({
      entity_type: "lead",
      entity_id: lead.id,
      author: adminEmail,
      body: "Preserve this CRM note after conversion",
    }).select("id").single(),
  ]);
  assert.ifError(contactError);
  assert.ifError(locationError);
  assert.ifError(activityError);
  assert.ifError(nextActionError);
  assert.ifError(noteError);

  const auth = createClient(supabaseURL, anonKey, { auth: { persistSession: false } });
  const { data: signedIn, error: signInError } = await auth.auth.signInWithPassword({
    email: adminEmail,
    password,
  });
  assert.ifError(signInError);
  assert.ok(signedIn.session);

  const headers = {
    Authorization: `Bearer ${signedIn.session.access_token}`,
    "Content-Type": "application/json",
  };
  const api = await request.newContext({ baseURL });
  let clientId = null;

  try {
    const convert = await api.post(`/api/admin/leads/${lead.id}/convert`, {
      headers,
      data: {},
      failOnStatusCode: false,
    });
    const convertBody = await convert.json().catch(() => ({}));
    assert.equal(convert.status(), 200, JSON.stringify(convertBody));
    clientId = convertBody.clientId;
    assert.ok(clientId);

    const workspace = await api.get("/api/admin/leads/workspace", {
      headers,
      failOnStatusCode: false,
    });
    const body = await workspace.json().catch(() => ({}));
    assert.equal(workspace.status(), 200, JSON.stringify(body));

    assert.ok(body.leads.some((item) => item.id === lead.id && item.status === "won"));
    assert.ok(body.contacts.some((item) => item.id === contact.id && item.lead_id === lead.id));
    assert.ok(body.locations.some((item) => item.id === location.id && item.lead_id === lead.id));
    assert.ok(body.activities.some((item) => item.id === activity.id && item.lead_id === lead.id));
    assert.ok(body.nextActions.some((item) => item.id === nextAction.id && item.lead_id === lead.id));
    assert.ok(body.notes.some((item) => item.id === note.id && item.entity_id === lead.id));
  } finally {
    await api.dispose();
    if (clientId) await admin.from("clients").delete().eq("id", clientId);
    await admin.from("notes").delete().eq("id", note.id);
    await admin.from("lead_next_actions").delete().eq("id", nextAction.id);
    await admin.from("lead_activities").delete().eq("lead_id", lead.id);
    await admin.from("lead_locations").delete().eq("id", location.id);
    await admin.from("lead_contacts").delete().eq("id", contact.id);
    await admin.from("leads").delete().eq("id", lead.id);
    await admin.from("admin_users").delete().eq("email", adminEmail);
    await admin.auth.admin.deleteUser(adminUser.id);
  }
});


test("pilot profile uses structured equipment as the only visible inventory", { skip: !isolated }, async () => {
  assert.ok(supabaseURL && anonKey && serviceKey, "isolated Supabase credentials are required");
  assert.match(supabaseURL, /^https?:\/\/(127\.0\.0\.1|localhost)(:|\/)/, "E2E database must be local");

  const admin = createClient(supabaseURL, serviceKey, { auth: { persistSession: false } });
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const email = `profile-assets-${stamp}@e2e.dom.invalid`;
  const password = `Dom-Profile-Assets-${stamp}!Aa1`;
  const legacyMarker = `LEGACY-EQUIPMENT-${stamp}`;

  const { data: userData, error: userError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  assert.ifError(userError);
  const user = userData.user;
  assert.ok(user);

  const { data: pilot, error: pilotError } = await admin.from("contractors").insert({
    user_id: user.id,
    full_name: "E2E Structured Profile Pilot",
    email,
    status: "active",
    part107_verified: true,
    insurance_verified: true,
    insurance_provider: "E2E",
    insurance_policy_number: "PROFILE-ASSET-E2E",
    insurance_expires_on: "2099-12-31",
    can_create_missions: false,
    subscription_active: true,
    equipment: legacyMarker,
  }).select("id").single();
  assert.ifError(pilotError);

  const { data: asset, error: assetError } = await admin.from("pilot_assets").insert({
    contractor_id: pilot.id,
    asset_type: "uav",
    manufacturer: "DJI",
    model: "Avata 2",
    display_name: "Structured Profile Avata 2",
    registration_number: "FA3PROFILEE2E",
    remote_id: `RID-${stamp}`,
    status: "active",
    capabilities_verified: true,
  }).select("id").single();
  assert.ifError(assetError);

  const { error: capError } = await admin.from("pilot_asset_capabilities").insert([
    { asset_id: asset.id, capability: "rgb_imagery" },
    { asset_id: asset.id, capability: "video" },
  ]);
  assert.ifError(capError);

  const auth = createClient(supabaseURL, anonKey, { auth: { persistSession: false } });
  const { data: signedIn, error: signInError } = await auth.auth.signInWithPassword({ email, password });
  assert.ifError(signInError);
  assert.ok(signedIn.session);

  const browser = await chromium.launch({ headless: true });
  const browserContext = await browser.newContext();
  const storageKey = `sb-${new URL(supabaseURL).hostname.split(".")[0]}-auth-token`;
  await browserContext.addInitScript(({ key, session }) => {
    localStorage.setItem(key, JSON.stringify(session));
  }, { key: storageKey, session: signedIn.session });

  const page = await browserContext.newPage();
  try {
    const response = await page.goto(`${baseURL}/pilot`, { waitUntil: "networkidle", timeout: 45_000 });
    assert.ok(response && response.status() < 400, `pilot dashboard returned ${response?.status()}`);

    await page.getByRole("button", { name: "Profile & Settings" }).click();
    await page.getByText("Aircraft & Equipment", { exact: true }).waitFor({ timeout: 15_000 });
    await page.getByText("Structured Profile Avata 2", { exact: false }).waitFor({ timeout: 15_000 });

    const html = await page.content();
    assert.match(html, /This is your only equipment inventory/);
    assert.match(html, /FAA registration/i);
    assert.doesNotMatch(html, new RegExp(legacyMarker));
    assert.equal(await page.getByText("Equipment", { exact: true }).count(), 0);
  } finally {
    await browserContext.close();
    await browser.close();
    await admin.from("pilot_asset_capabilities").delete().eq("asset_id", asset.id);
    await admin.from("pilot_assets").delete().eq("id", asset.id);
    await admin.from("contractors").delete().eq("id", pilot.id);
    await admin.auth.admin.deleteUser(user.id);
  }
});


test("DOMINIC saved capture plans are private and durable per user", { skip: !isolated }, async () => {
  assert.ok(supabaseURL && anonKey && serviceKey, "isolated Supabase credentials are required");
  assert.match(supabaseURL, /^https?:\/\/(127\.0\.0\.1|localhost)(:|\/)/, "E2E database must be local");

  const admin = createClient(supabaseURL, serviceKey, { auth: { persistSession: false } });
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const password = `Dom-Capture-Plan-${stamp}!Aa1`;
  const emails = [
    `capture-plan-a-${stamp}@e2e.dom.invalid`,
    `capture-plan-b-${stamp}@e2e.dom.invalid`,
  ];

  const users = [];
  for (const email of emails) {
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    assert.ifError(error);
    users.push(data.user);
  }

  const signIn = async (email) => {
    const sb = createClient(supabaseURL, anonKey, { auth: { persistSession: false } });
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    assert.ifError(error);
    assert.ok(data.session);
    return sb;
  };

  const userA = await signIn(emails[0]);
  const userB = await signIn(emails[1]);
  let planId = null;

  try {
    const state = {
      objectDiameterFt: 18,
      objectHeightFt: 14,
      standoffFt: 24,
      overlapPct: 78,
      horizontalFovDeg: 84,
      centerLatitude: 39.95,
      centerLongitude: -75.16,
      baseRelativeAltitudeFt: 5,
      homeLatitude: 39.9501,
      homeLongitude: -75.1601,
      minRelativeAltitudeFt: 0,
      maxRelativeAltitudeFt: 120,
      minStandoffFt: 10,
      maxStandoffFt: 80,
      noFlySectors: [],
      patternLengthFt: 100,
      patternWidthFt: 60,
      patternHeightFt: 40,
      patternAltitudeFt: 75,
      patternStandoffFt: 30,
      patternOverlapPct: 75,
      patternHeadingDeg: 0,
    };

    const { data: inserted, error: insertError } = await userA
      .from("dominic_capture_plans")
      .insert({
        user_id: users[0].id,
        name: "E2E Object Scan",
        mission_type: "object",
        schema_version: 1,
        plan_state: state,
      })
      .select("id,name,plan_state")
      .single();
    assert.ifError(insertError);
    assert.ok(inserted?.id);
    planId = inserted.id;
    assert.equal(inserted.plan_state.standoffFt, 24);

    const { data: hiddenFromB, error: hiddenError } = await userB
      .from("dominic_capture_plans")
      .select("id,name")
      .eq("id", planId);
    assert.ifError(hiddenError);
    assert.deepEqual(hiddenFromB, []);

    const { data: attemptedUpdate, error: updateByBError } = await userB
      .from("dominic_capture_plans")
      .update({ name: "Unauthorized overwrite" })
      .eq("id", planId)
      .select("id");
    assert.ifError(updateByBError);
    assert.deepEqual(attemptedUpdate, []);

    const { data: updatedByA, error: updateByAError } = await userA
      .from("dominic_capture_plans")
      .update({
        name: "E2E Object Scan Updated",
        plan_state: { ...state, standoffFt: 32, overlapPct: 82 },
      })
      .eq("id", planId)
      .select("id,name,plan_state")
      .single();
    assert.ifError(updateByAError);
    assert.equal(updatedByA.name, "E2E Object Scan Updated");
    assert.equal(updatedByA.plan_state.standoffFt, 32);
    assert.equal(updatedByA.plan_state.overlapPct, 82);

    const { data: reopened, error: reopenError } = await userA
      .from("dominic_capture_plans")
      .select("id,name,mission_type,schema_version,plan_state")
      .eq("id", planId)
      .single();
    assert.ifError(reopenError);
    assert.equal(reopened.mission_type, "object");
    assert.equal(reopened.schema_version, 1);
    assert.equal(reopened.plan_state.standoffFt, 32);
  } finally {
    if (planId) await admin.from("dominic_capture_plans").delete().eq("id", planId);
    for (const user of users) await admin.auth.admin.deleteUser(user.id);
  }
});


test("mapping image confirmation updates project summary exactly once", { skip: !isolated }, async () => {
  assert.ok(supabaseURL && anonKey && serviceKey, "isolated Supabase credentials are required");
  assert.match(supabaseURL, /^https?:\/\/(127\.0\.0\.1|localhost)(:|\/)/, "E2E database must be local");

  const admin = createClient(supabaseURL, serviceKey, { auth: { persistSession: false } });
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const email = `mapping-summary-${stamp}@e2e.dom.invalid`;
  const password = `Dom-Mapping-Summary-${stamp}!Aa1`;

  const { data: userData, error: userError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  assert.ifError(userError);
  const user = userData.user;
  assert.ok(user);

  const { data: pilot, error: pilotError } = await admin.from("contractors").insert({
    user_id: user.id,
    full_name: "E2E Mapping Summary Pilot",
    email,
    status: "active",
    part107_verified: true,
    can_create_missions: false,
  }).select("id").single();
  assert.ifError(pilotError);

  const { data: mission, error: missionError } = await admin.from("mission_requests").insert({
    requester_name: "Mapping Summary Client",
    requester_email: `mapping-client-${stamp}@e2e.dom.invalid`,
    company: "Mapping Summary Test",
    service_type: "ortho_survey",
    location: "Mapping Summary Site",
    status: "assigned",
  }).select("id").single();
  assert.ifError(missionError);

  const { data: job, error: jobError } = await admin.from("jobs").insert({
    mission_request_id: mission.id,
    title: "Mapping Summary Mission",
    service_type: "ortho_survey",
    location: "Mapping Summary Site",
    status: "scheduled",
  }).select("id").single();
  assert.ifError(jobError);

  const { data: project, error: projectError } = await admin.from("mapping_projects").insert({
    job_id: job.id,
    contractor_id: pilot.id,
    name: "E2E Mapping Summary Project",
    status: "draft",
  }).select("id,image_count,total_upload_bytes").single();
  assert.ifError(projectError);
  assert.equal(project.image_count, 0);
  assert.equal(Number(project.total_upload_bytes), 0);

  const auth = createClient(supabaseURL, anonKey, { auth: { persistSession: false } });
  const { data: signedIn, error: signInError } = await auth.auth.signInWithPassword({ email, password });
  assert.ifError(signInError);
  assert.ok(signedIn.session);

  const api = await request.newContext({ baseURL });
  const headers = {
    Authorization: `Bearer ${signedIn.session.access_token}`,
    "Content-Type": "application/json",
  };
  const imageIds = [];

  try {
    const first = await api.post(`/api/pilot/mapping/projects/${project.id}/images`, {
      headers,
      data: {
        storage_path: `${project.id}/image-1.jpg`,
        original_filename: "image-1.jpg",
        file_size: 1_234_567,
        mime_type: "image/jpeg",
        checksum: `sha256-first-${stamp}`,
        image_width: 4000,
        image_height: 3000,
      },
      failOnStatusCode: false,
    });
    const firstBody = await first.json().catch(() => ({}));
    assert.equal(first.status(), 200, JSON.stringify(firstBody));
    imageIds.push(firstBody.imageId);

    const { data: afterFirst, error: firstSummaryError } = await admin.from("mapping_projects")
      .select("image_count,total_upload_bytes,status")
      .eq("id", project.id)
      .single();
    assert.ifError(firstSummaryError);
    assert.equal(afterFirst.image_count, 1);
    assert.equal(Number(afterFirst.total_upload_bytes), 1_234_567);
    assert.equal(afterFirst.status, "uploaded");

    const second = await api.post(`/api/pilot/mapping/projects/${project.id}/images`, {
      headers,
      data: {
        storage_path: `${project.id}/image-2.jpg`,
        original_filename: "image-2.jpg",
        file_size: 2_000_001,
        mime_type: "image/jpeg",
        checksum: `sha256-second-${stamp}`,
        image_width: 4000,
        image_height: 3000,
      },
      failOnStatusCode: false,
    });
    const secondBody = await second.json().catch(() => ({}));
    assert.equal(second.status(), 200, JSON.stringify(secondBody));
    imageIds.push(secondBody.imageId);

    const { data: afterSecond, error: secondSummaryError } = await admin.from("mapping_projects")
      .select("image_count,total_upload_bytes")
      .eq("id", project.id)
      .single();
    assert.ifError(secondSummaryError);
    assert.equal(afterSecond.image_count, 2);
    assert.equal(Number(afterSecond.total_upload_bytes), 3_234_568);

    const foreignPath = await api.post(`/api/pilot/mapping/projects/${project.id}/images`, {
      headers,
      data: {
        storage_path: `${crypto.randomUUID()}/foreign.jpg`,
        original_filename: "foreign.jpg",
        file_size: 999,
        mime_type: "image/jpeg",
        checksum: `sha256-foreign-${stamp}`,
      },
      failOnStatusCode: false,
    });
    assert.equal(foreignPath.status(), 403);

    const { data: afterRejected, error: rejectedSummaryError } = await admin.from("mapping_projects")
      .select("image_count,total_upload_bytes")
      .eq("id", project.id)
      .single();
    assert.ifError(rejectedSummaryError);
    assert.equal(afterRejected.image_count, 2);
    assert.equal(Number(afterRejected.total_upload_bytes), 3_234_568);
  } finally {
    await api.dispose();
    if (imageIds.length) await admin.from("mapping_images").delete().in("id", imageIds);
    await admin.from("mapping_projects").delete().eq("id", project.id);
    await admin.from("jobs").delete().eq("id", job.id);
    await admin.from("mission_requests").delete().eq("id", mission.id);
    await admin.from("contractors").delete().eq("id", pilot.id);
    await admin.auth.admin.deleteUser(user.id);
  }
});


test("failed mapping project requeue resets image lifecycle state", { skip: !isolated }, async () => {
  assert.ok(supabaseURL && anonKey && serviceKey, "isolated Supabase credentials are required");
  assert.match(supabaseURL, /^https?:\/\/(127\.0\.0\.1|localhost)(:|\/)/, "E2E database must be local");

  const admin = createClient(supabaseURL, serviceKey, { auth: { persistSession: false } });
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const email = `mapping-retry-${stamp}@e2e.dom.invalid`;
  const password = `Dom-Mapping-Retry-${stamp}!Aa1`;

  const { data: userData, error: userError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  assert.ifError(userError);
  const user = userData.user;
  assert.ok(user);

  const { data: pilot, error: pilotError } = await admin.from("contractors").insert({
    user_id: user.id,
    full_name: "E2E Mapping Retry Pilot",
    email,
    status: "active",
    part107_verified: true,
    can_create_missions: false,
  }).select("id").single();
  assert.ifError(pilotError);

  const { data: mission, error: missionError } = await admin.from("mission_requests").insert({
    requester_name: "Mapping Retry Client",
    requester_email: `mapping-retry-client-${stamp}@e2e.dom.invalid`,
    company: "Mapping Retry Test",
    service_type: "ortho_survey",
    location: "Mapping Retry Site",
    status: "assigned",
  }).select("id").single();
  assert.ifError(missionError);

  const { data: job, error: jobError } = await admin.from("jobs").insert({
    mission_request_id: mission.id,
    title: "Mapping Retry Mission",
    service_type: "ortho_survey",
    location: "Mapping Retry Site",
    status: "scheduled",
  }).select("id").single();
  assert.ifError(jobError);

  const { data: project, error: projectError } = await admin.from("mapping_projects").insert({
    job_id: job.id,
    contractor_id: pilot.id,
    name: "E2E Failed Mapping Project",
    status: "failed",
    error_message: "Prior worker failure",
  }).select("id").single();
  assert.ifError(projectError);

  const { data: images, error: imagesError } = await admin.from("mapping_images").insert([
    {
      mapping_project_id: project.id,
      storage_path: `${project.id}/retry-1.jpg`,
      original_filename: "retry-1.jpg",
      file_size: 1000,
      checksum: `retry-a-${stamp}`,
      lifecycle_status: "failed",
      lifecycle_error: "Prior download failure",
    },
    {
      mapping_project_id: project.id,
      storage_path: `${project.id}/retry-2.jpg`,
      original_filename: "retry-2.jpg",
      file_size: 2000,
      checksum: `retry-b-${stamp}`,
      lifecycle_status: "failed",
      lifecycle_error: "Prior download failure",
    },
  ]).select("id");
  assert.ifError(imagesError);
  assert.equal(images.length, 2);

  const { data: summarized, error: summaryError } = await admin.from("mapping_projects")
    .select("image_count,total_upload_bytes")
    .eq("id", project.id)
    .single();
  assert.ifError(summaryError);
  assert.equal(summarized.image_count, 2);
  assert.equal(Number(summarized.total_upload_bytes), 3000);

  const auth = createClient(supabaseURL, anonKey, { auth: { persistSession: false } });
  const { data: signedIn, error: signInError } = await auth.auth.signInWithPassword({ email, password });
  assert.ifError(signInError);
  assert.ok(signedIn.session);

  const api = await request.newContext({ baseURL });
  try {
    const response = await api.post(`/api/pilot/mapping/projects/${project.id}/queue`, {
      headers: {
        Authorization: `Bearer ${signedIn.session.access_token}`,
        "Content-Type": "application/json",
      },
      data: {
        profile: "standard",
        requested_outputs: ["orthomosaic"],
      },
      failOnStatusCode: false,
    });
    const body = await response.json().catch(() => ({}));
    assert.equal(response.status(), 200, JSON.stringify(body));

    const [{ data: projectAfter }, { data: imageRows }, { data: processingJobs }] = await Promise.all([
      admin.from("mapping_projects").select("status,image_count,total_upload_bytes,error_message").eq("id", project.id).single(),
      admin.from("mapping_images").select("id,lifecycle_status,lifecycle_error").eq("mapping_project_id", project.id).order("created_at"),
      admin.from("mapping_processing_jobs").select("id,status,attempts").eq("mapping_project_id", project.id).order("created_at"),
    ]);

    assert.equal(projectAfter.status, "queued");
    assert.equal(projectAfter.image_count, 2);
    assert.equal(Number(projectAfter.total_upload_bytes), 3000);
    assert.equal(projectAfter.error_message, null);
    assert.deepEqual(new Set(imageRows.map((item) => item.lifecycle_status)), new Set(["stored"]));
    assert.ok(imageRows.every((item) => item.lifecycle_error === null));
    assert.equal(processingJobs.length, 1);
    assert.equal(processingJobs[0].status, "queued");
  } finally {
    await api.dispose();
    await admin.from("mapping_processing_jobs").delete().eq("mapping_project_id", project.id);
    await admin.from("mapping_images").delete().eq("mapping_project_id", project.id);
    await admin.from("mapping_projects").delete().eq("id", project.id);
    await admin.from("jobs").delete().eq("id", job.id);
    await admin.from("mission_requests").delete().eq("id", mission.id);
    await admin.from("contractors").delete().eq("id", pilot.id);
    await admin.auth.admin.deleteUser(user.id);
  }
});


test("DOMINIC HUB simulation schedules persist privately with audit history", { skip: !isolated }, async () => {
  assert.ok(supabaseURL && anonKey && serviceKey, "isolated Supabase credentials are required");
  assert.match(supabaseURL, /^https?:\/\/(127\.0\.0\.1|localhost)(:|\/)/, "E2E database must be local");

  const admin = createClient(supabaseURL, serviceKey, { auth: { persistSession: false } });
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const password = `Dom-Hub-E2E-${stamp}!Aa1`;
  const emails = [
    `hub-user-a-${stamp}@e2e.dom.invalid`,
    `hub-user-b-${stamp}@e2e.dom.invalid`,
  ];

  const users = [];
  for (const email of emails) {
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    assert.ifError(error);
    users.push(data.user);
  }

  const signIn = async (email) => {
    const sb = createClient(supabaseURL, anonKey, { auth: { persistSession: false } });
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    assert.ifError(error);
    assert.ok(data.session);
    return sb;
  };

  const userA = await signIn(emails[0]);
  const userB = await signIn(emails[1]);

  const { error: profileError } = await admin.from("dominic_profiles").insert([
    {
      user_id: users[0].id,
      full_name: "E2E HUB Organization User",
      plan: "organization",
      status: "active",
    },
    {
      user_id: users[1].id,
      full_name: "E2E HUB Free User",
      plan: "free",
      status: "active",
    },
  ]);
  assert.ifError(profileError);

  let missionId = null;

  try {
    const { data: savedId, error: saveError } = await userA.rpc("save_dominic_hub_simulation_service", {
      p_user_id: users[0].id,
      p_name: "E2E LDAR East",
      p_mission_type: "ldar",
      p_aircraft_label: "DOM-401",
      p_route_mode: "LDAR East",
      p_recurrence_label: "MON / WED / FRI",
      p_scheduled_local_time: "06:00",
    });
    assert.ifError(saveError);
    assert.ok(savedId);
    missionId = savedId;

    const [{ data: mission, error: missionError }, { data: events, error: eventError }] = await Promise.all([
      userA.from("dominic_hub_missions")
        .select("id,name,mission_type,aircraft_label,route_mode,recurrence_label,scheduled_local_time,status,simulation_only")
        .eq("id", missionId)
        .single(),
      userA.from("dominic_hub_events")
        .select("mission_id,event_type,summary,details")
        .eq("mission_id", missionId),
    ]);
    assert.ifError(missionError);
    assert.ifError(eventError);
    assert.equal(mission.name, "E2E LDAR East");
    assert.equal(mission.mission_type, "ldar");
    assert.equal(mission.aircraft_label, "DOM-401");
    assert.equal(mission.route_mode, "LDAR East");
    assert.equal(mission.recurrence_label, "MON / WED / FRI");
    assert.equal(mission.status, "ready");
    assert.equal(mission.simulation_only, true);
    assert.equal(events.length, 1);
    assert.equal(events[0].event_type, "simulation_schedule_saved");
    assert.equal(events[0].summary, "Simulation schedule saved");

    const { error: freeSaveError } = await userB.rpc("save_dominic_hub_simulation_service", {
      p_user_id: users[1].id,
      p_name: "Unauthorized Free HUB Mission",
      p_mission_type: "ldar",
      p_aircraft_label: "DOM-401",
      p_route_mode: "LDAR East",
      p_recurrence_label: "DAILY",
      p_scheduled_local_time: "07:00",
    });
    assert.ok(freeSaveError, "Free/Operator-trial users must not persist Organization HUB missions");

    const { data: runningStatus, error: runningError } = await userA.rpc("set_dominic_hub_simulation_status_service", {
      p_user_id: users[0].id,
      p_mission_id: missionId,
      p_status: "running",
    });
    assert.ifError(runningError);
    assert.equal(runningStatus, "running");

    const { data: pausedStatus, error: pausedError } = await userA.rpc("set_dominic_hub_simulation_status_service", {
      p_user_id: users[0].id,
      p_mission_id: missionId,
      p_status: "paused",
    });
    assert.ifError(pausedError);
    assert.equal(pausedStatus, "paused");

    const [{ data: pausedMission, error: pausedMissionError }, { data: statusEvents, error: statusEventsError }] = await Promise.all([
      userA.from("dominic_hub_missions").select("status").eq("id", missionId).single(),
      userA.from("dominic_hub_events").select("event_type,summary,details").eq("mission_id", missionId).order("created_at"),
    ]);
    assert.ifError(pausedMissionError);
    assert.ifError(statusEventsError);
    assert.equal(pausedMission.status, "paused");
    assert.equal(statusEvents.length, 3);
    assert.deepEqual(statusEvents.map((event) => event.summary), [
      "Simulation schedule saved",
      "Simulation mission started",
      "Simulation mission paused",
    ]);

    const { error: crossUserRpcError } = await userB.rpc("set_dominic_hub_simulation_status_service", {
      p_user_id: users[0].id,
      p_mission_id: missionId,
      p_status: "running",
    });
    assert.ok(crossUserRpcError, "cross-user HUB status RPC must be rejected");

    const [{ data: hiddenMission, error: hiddenMissionError }, { data: hiddenEvents, error: hiddenEventsError }] = await Promise.all([
      userB.from("dominic_hub_missions").select("id").eq("id", missionId),
      userB.from("dominic_hub_events").select("id").eq("mission_id", missionId),
    ]);
    assert.ifError(hiddenMissionError);
    assert.ifError(hiddenEventsError);
    assert.deepEqual(hiddenMission, []);
    assert.deepEqual(hiddenEvents, []);

    const { data: unauthorizedUpdate, error: unauthorizedUpdateError } = await userB
      .from("dominic_hub_missions")
      .update({ status: "cancelled" })
      .eq("id", missionId)
      .select("id");
    assert.ifError(unauthorizedUpdateError);
    assert.deepEqual(unauthorizedUpdate, []);

    const { data: stillReady, error: stillReadyError } = await userA
      .from("dominic_hub_missions")
      .select("status")
      .eq("id", missionId)
      .single();
    assert.ifError(stillReadyError);
    assert.equal(stillReady.status, "paused");
  } finally {
    if (missionId) {
      await admin.from("dominic_hub_events").delete().eq("mission_id", missionId);
      await admin.from("dominic_hub_missions").delete().eq("id", missionId);
    }
    for (const user of users) await admin.auth.admin.deleteUser(user.id);
  }
});


test("DOMINIC entitlement endpoint and Mapping API enforce trial and paid tiers", { skip: !isolated }, async () => {
  assert.ok(supabaseURL && anonKey && serviceKey, "isolated Supabase credentials are required");
  assert.match(supabaseURL, /^https?:\/\/(127\.0\.0\.1|localhost)(:|\/)/, "E2E database must be local");

  const admin = createClient(supabaseURL, serviceKey, { auth: { persistSession: false } });
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const email = `dominic-entitlement-${stamp}@e2e.dom.invalid`;
  const password = `Dom-Entitlement-${stamp}!Aa1`;

  const { data: userData, error: userError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  assert.ifError(userError);
  const user = userData.user;
  assert.ok(user);

  const { data: contractor, error: contractorError } = await admin.from("contractors").insert({
    user_id: user.id,
    full_name: "E2E DOMINIC Entitlement Pilot",
    email,
    status: "active",
    part107_verified: true,
    can_create_missions: false,
  }).select("id").single();
  assert.ifError(contractorError);

  const { error: profileError } = await admin.from("dominic_profiles").insert({
    user_id: user.id,
    full_name: "E2E DOMINIC Entitlement Pilot",
    plan: "free",
    status: "active",
    trial_started_at: new Date().toISOString(),
    trial_ends_at: new Date(Date.now() + 7 * 86_400_000).toISOString(),
  });
  assert.ifError(profileError);

  const auth = createClient(supabaseURL, anonKey, { auth: { persistSession: false } });
  const { data: signedIn, error: signInError } = await auth.auth.signInWithPassword({ email, password });
  assert.ifError(signInError);
  assert.ok(signedIn.session);

  const headers = { Authorization: `Bearer ${signedIn.session.access_token}` };
  const api = await request.newContext({ baseURL });

  try {
    const trialAccess = await api.get("/api/dominic/access", { headers, failOnStatusCode: false });
    const trialBody = await trialAccess.json().catch(() => ({}));
    assert.equal(trialAccess.status(), 200, JSON.stringify(trialBody));
    assert.equal(trialBody.access.plan, "free");
    assert.equal(trialBody.access.effectivePlan, "operator");
    assert.equal(trialBody.access.trialActive, true);
    assert.equal(trialBody.features.home, true);
    assert.equal(trialBody.features.capturePlanner, true);
    assert.equal(trialBody.features.mapping, true);
    assert.equal(trialBody.features.hub, false);

    const mappingDuringTrial = await api.get("/api/pilot/mapping/jobs-eligible", {
      headers,
      failOnStatusCode: false,
    });
    assert.equal(mappingDuringTrial.status(), 200, JSON.stringify(await mappingDuringTrial.json().catch(() => ({}))));

    const { error: expireError } = await admin.from("dominic_profiles")
      .update({ trial_ends_at: new Date(Date.now() - 86_400_000).toISOString() })
      .eq("user_id", user.id);
    assert.ifError(expireError);

    const freeAccess = await api.get("/api/dominic/access", { headers, failOnStatusCode: false });
    const freeBody = await freeAccess.json().catch(() => ({}));
    assert.equal(freeAccess.status(), 200, JSON.stringify(freeBody));
    assert.equal(freeBody.access.effectivePlan, "free");
    assert.equal(freeBody.access.trialActive, false);
    assert.equal(freeBody.features.home, true);
    assert.equal(freeBody.features.capturePlanner, true);
    assert.equal(freeBody.features.mapping, false);
    assert.equal(freeBody.features.hub, false);

    const mappingAfterTrial = await api.get("/api/pilot/mapping/jobs-eligible", {
      headers,
      failOnStatusCode: false,
    });
    const mappingAfterBody = await mappingAfterTrial.json().catch(() => ({}));
    assert.equal(mappingAfterTrial.status(), 403, JSON.stringify(mappingAfterBody));
    assert.match(mappingAfterBody.error ?? "", /Operator, Team, or Organization license/i);

    // User-editable claims must not grant the paid pilot benefit.
    assert.ifError((await auth.auth.updateUser({ data: { subscription_active: true, dominic_premium: true } })).error);
    const spoofedSession = await auth.auth.refreshSession();
    assert.ifError(spoofedSession.error);
    headers.Authorization = `Bearer ${spoofedSession.data.session.access_token}`;
    const spoofedBody = await (await api.get("/api/dominic/access", { headers })).json();
    assert.equal(spoofedBody.access.premiumIncluded, false);
    assert.equal(spoofedBody.features.mapping, false);

    assert.ifError((await admin.from("contractors").update({ subscription_active: true }).eq("id", contractor.id)).error);
    const includedBody = await (await api.get("/api/dominic/access", { headers })).json();
    assert.equal(includedBody.access.plan, "free");
    assert.equal(includedBody.access.premiumIncluded, true);
    assert.equal(includedBody.features.mapping, true);
    assert.equal(includedBody.features.hub, true);
    assert.equal((await api.get("/api/pilot/mapping/jobs-eligible", { headers })).status(), 200);

    assert.ifError((await admin.from("contractors").update({ subscription_active: false }).eq("id", contractor.id)).error);
    const canceledBody = await (await api.get("/api/dominic/access", { headers })).json();
    assert.equal(canceledBody.access.premiumIncluded, false);
    assert.equal(canceledBody.features.mapping, false);
    assert.equal((await api.get("/api/pilot/mapping/jobs-eligible", { headers })).status(), 403);

    const { error: upgradeError } = await admin.from("dominic_profiles")
      .update({ plan: "organization" })
      .eq("user_id", user.id);
    assert.ifError(upgradeError);

    const orgAccess = await api.get("/api/dominic/access", { headers, failOnStatusCode: false });
    const orgBody = await orgAccess.json().catch(() => ({}));
    assert.equal(orgAccess.status(), 200, JSON.stringify(orgBody));
    assert.equal(orgBody.access.effectivePlan, "organization");
    assert.equal(orgBody.features.mapping, true);
    assert.equal(orgBody.features.hub, true);
  } finally {
    await api.dispose();
    await admin.from("dominic_profiles").delete().eq("user_id", user.id);
    await admin.from("contractors").delete().eq("id", contractor.id);
    await admin.auth.admin.deleteUser(user.id);
  }
});


test("storefront renders product images and fulfillment state", { skip: !isolated }, async () => {
  assert.ok(supabaseURL && serviceKey, "isolated Supabase credentials are required");
  assert.match(supabaseURL, /^https?:\/\/(127\.0\.0\.1|localhost)(:|\/)/, "E2E database must be local");

  const admin = createClient(supabaseURL, serviceKey, { auth: { persistSession: false } });
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const madeKey = `e2e-made-${stamp}`;
  const stockKey = `e2e-stock-${stamp}`;
  const madeName = `E2E Made Product ${stamp}`;
  const stockName = `E2E Stock Product ${stamp}`;

  const { error: insertError } = await admin.from("shop_inventory").insert([
    {
      product_key: madeKey,
      product_name: madeName,
      description: "Made-to-order storefront rendering fixture",
      unit_amount_cents: 1500,
      variants: [],
      category: "Equipment",
      image_url: "/shop/safety/portable-landing-pad.jpeg",
      active: true,
      fulfillment_mode: "made_to_order",
      available_quantity: null,
      shipping_base_cents: 0,
      shipping_additional_cents: 0,
    },
    {
      product_key: stockKey,
      product_name: stockName,
      description: "Stocked storefront rendering fixture",
      unit_amount_cents: 2500,
      variants: [],
      category: "Safety",
      image_url: "/shop/safety/drone-operation-vest-front.jpeg",
      active: true,
      fulfillment_mode: "stocked",
      available_quantity: 3,
      shipping_base_cents: 0,
      shipping_additional_cents: 0,
    },
  ]);
  assert.ifError(insertError);

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    const response = await page.goto(`${baseURL}/shop/products`, {
      waitUntil: "networkidle",
      timeout: 45_000,
    });
    assert.ok(response && response.status() < 400, `storefront returned ${response?.status()}`);

    const madeCard = page.locator("article").filter({ hasText: madeName });
    await madeCard.getByText(madeName, { exact: true }).waitFor({ timeout: 15_000 });
    await madeCard.getByText("Made to order", { exact: true }).waitFor();
    await madeCard.getByText(/Built when ordered/i).waitFor();
    const madeImage = madeCard.getByRole("img", { name: madeName });
    await madeImage.waitFor();
    assert.match(await madeImage.getAttribute("src") ?? "", /portable-landing-pad/);

    const stockCard = page.locator("article").filter({ hasText: stockName });
    await stockCard.getByText(stockName, { exact: true }).waitFor();
    await stockCard.getByText("3 in stock", { exact: true }).waitFor();
    const stockImage = stockCard.getByRole("img", { name: stockName });
    await stockImage.waitFor();
    assert.match(await stockImage.getAttribute("src") ?? "", /drone-operation-vest-front/);
  } finally {
    await page.close();
    await browser.close();
    await admin.from("shop_inventory").delete().in("product_key", [madeKey, stockKey]);
  }
});


test("admin cannot QC pilot-owned mission deliverables", { skip: !isolated }, async () => {
  assert.ok(supabaseURL && anonKey && serviceKey, "isolated Supabase credentials are required");
  assert.match(supabaseURL, /^https?:\/\/(127\.0\.0\.1|localhost)(:|\/)/, "E2E database must be local");

  const admin = createClient(supabaseURL, serviceKey, { auth: { persistSession: false } });
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const adminEmail = `pilot-qc-admin-${stamp}@e2e.dom.invalid`;
  const password = `Dom-Pilot-QC-${stamp}!Aa1`;

  const { data: adminUserData, error: adminUserError } = await admin.auth.admin.createUser({
    email: adminEmail,
    password,
    email_confirm: true,
  });
  assert.ifError(adminUserError);
  const adminUser = adminUserData.user;
  assert.ok(adminUser);

  const { error: allowError } = await admin.from("admin_users").insert({
    email: adminEmail,
    full_name: "E2E Pilot QC Admin",
    role: "admin",
  });
  assert.ifError(allowError);

  const { data: owner, error: ownerError } = await admin.from("contractors").insert({
    full_name: "Pilot Mission Owner",
    email: `pilot-owner-${stamp}@e2e.dom.invalid`,
    status: "active",
    part107_verified: true,
    can_create_missions: true,
  }).select("id").single();
  assert.ifError(ownerError);

  const { data: mission, error: missionError } = await admin.from("mission_requests").insert({
    requester_name: "Pilot Client",
    requester_email: `pilot-client-${stamp}@e2e.dom.invalid`,
    company: "Pilot Owned Mission",
    service_type: "aerial_images",
    location: "Pilot Owned Site",
    status: "in_progress",
    created_by_contractor_id: owner.id,
    requires_admin_approval: false,
  }).select("id").single();
  assert.ifError(missionError);

  const { data: job, error: jobError } = await admin.from("jobs").insert({
    mission_request_id: mission.id,
    title: "Pilot Owned Mission",
    service_type: "aerial_images",
    location: "Pilot Owned Site",
    status: "in_progress",
    delivery_responsibility: "pilot",
  }).select("id").single();
  assert.ifError(jobError);

  const { data: deliverable, error: deliverableError } = await admin.from("deliverables").insert({
    job_id: job.id,
    name: "Pilot Owned Deliverable",
    type: "raw_images",
    storage_url: `${job.id}/pilot-owned.zip`,
    qc_passed: false,
  }).select("id").single();
  assert.ifError(deliverableError);

  const auth = createClient(supabaseURL, anonKey, { auth: { persistSession: false } });
  const { data: signedIn, error: signInError } = await auth.auth.signInWithPassword({
    email: adminEmail,
    password,
  });
  assert.ifError(signInError);
  assert.ok(signedIn.session);

  const api = await request.newContext({ baseURL });
  try {
    const response = await api.post(`/api/admin/missions/${mission.id}/manage`, {
      headers: {
        Authorization: `Bearer ${signedIn.session.access_token}`,
        "Content-Type": "application/json",
      },
      data: {
        action: "set_deliverable_qc",
        deliverableId: deliverable.id,
        passed: true,
      },
      failOnStatusCode: false,
    });
    const body = await response.json().catch(() => ({}));
    assert.equal(response.status(), 409, JSON.stringify(body));
    assert.match(body.error ?? "", /do not use DOM QC/i);

    const { data: unchanged, error: unchangedError } = await admin.from("deliverables")
      .select("qc_passed,delivered_at")
      .eq("id", deliverable.id)
      .single();
    assert.ifError(unchangedError);
    assert.equal(unchanged.qc_passed, false);
    assert.equal(unchanged.delivered_at, null);
  } finally {
    await api.dispose();
    await admin.from("deliverables").delete().eq("id", deliverable.id);
    await admin.from("jobs").delete().eq("id", job.id);
    await admin.from("mission_requests").delete().eq("id", mission.id);
    await admin.from("contractors").delete().eq("id", owner.id);
    await admin.from("admin_users").delete().eq("email", adminEmail);
    await admin.auth.admin.deleteUser(adminUser.id);
  }
});


test("pilot corrected deliverable links to requested revision", { skip: !isolated }, async () => {
  assert.ok(supabaseURL && anonKey && serviceKey, "isolated Supabase credentials are required");
  assert.match(supabaseURL, /^https?:\/\/(127\.0\.0\.1|localhost)(:|\/)/, "E2E database must be local");

  const admin = createClient(supabaseURL, serviceKey, { auth: { persistSession: false } });
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const email = `revision-pilot-${stamp}@e2e.dom.invalid`;
  const password = `Dom-Revision-E2E-${stamp}!Aa1`;

  const { data: userData, error: userError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  assert.ifError(userError);
  const user = userData.user;
  assert.ok(user);

  const { data: contractor, error: contractorError } = await admin.from("contractors").insert({
    user_id: user.id,
    full_name: "Revision Pilot",
    email,
    status: "active",
    part107_verified: true,
    can_create_missions: true,
  }).select("id").single();
  assert.ifError(contractorError);

  const { data: mission, error: missionError } = await admin.from("mission_requests").insert({
    requester_name: "Revision Client",
    requester_email: `revision-client-${stamp}@e2e.dom.invalid`,
    company: "Revision Test",
    service_type: "aerial_images",
    location: "Revision Site",
    status: "in_progress",
    created_by_contractor_id: contractor.id,
    requires_admin_approval: false,
  }).select("id").single();
  assert.ifError(missionError);

  const { data: job, error: jobError } = await admin.from("jobs").insert({
    mission_request_id: mission.id,
    title: "Revision Test Mission",
    service_type: "aerial_images",
    location: "Revision Site",
    status: "in_progress",
    delivery_responsibility: "pilot",
  }).select("id").single();
  assert.ifError(jobError);

  const { data: assignment, error: assignmentError } = await admin.from("mission_assignments").insert({
    job_id: job.id,
    contractor_id: contractor.id,
    status: "in_progress",
    assignment_role: "owner",
  }).select("id").single();
  assert.ifError(assignmentError);

  const { data: prior, error: priorError } = await admin.from("deliverables").insert({
    job_id: job.id,
    name: "Original Pilot Deliverable",
    type: "raw_images",
    storage_url: `${job.id}/original.zip`,
    storage_provider: "supabase",
    qc_passed: true,
    client_status: "revision_requested",
    client_feedback: "Please correct this set.",
    revision_number: 1,
    delivered_at: new Date().toISOString(),
  }).select("id").single();
  assert.ifError(priorError);

  const correctedPath = `${job.id}/e2e-corrected-${stamp}.zip`;
  const bytes = new TextEncoder().encode("corrected deliverable");
  const { error: uploadError } = await admin.storage
    .from("mission-deliverables")
    .upload(correctedPath, bytes, { contentType: "application/zip", upsert: true });
  assert.ifError(uploadError);

  const auth = createClient(supabaseURL, anonKey, { auth: { persistSession: false } });
  const { data: signedIn, error: signInError } = await auth.auth.signInWithPassword({ email, password });
  assert.ifError(signInError);
  assert.ok(signedIn.session);

  const api = await request.newContext({ baseURL });
  try {
    const response = await api.post(`/api/pilot/missions/${assignment.id}/files`, {
      headers: { Authorization: `Bearer ${signedIn.session.access_token}` },
      data: {
        action: "complete_upload",
        kind: "deliverable",
        name: "Corrected Pilot Deliverable",
        category: "raw_images",
        fileName: "corrected.zip",
        fileSize: bytes.byteLength,
        path: correctedPath,
      },
      failOnStatusCode: false,
    });
    const body = await response.json().catch(() => ({}));
    assert.equal(response.status(), 200, JSON.stringify(body));

    const { data: corrected, error: correctedError } = await admin.from("deliverables")
      .select("id,supersedes_deliverable_id,revision_number,qc_passed,client_status")
      .eq("job_id", job.id)
      .eq("name", "Corrected Pilot Deliverable")
      .single();
    assert.ifError(correctedError);
    assert.equal(corrected.supersedes_deliverable_id, prior.id);
    assert.equal(corrected.revision_number, 2);
    assert.equal(corrected.qc_passed, false);
    assert.notEqual(corrected.client_status, "superseded");
  } finally {
    await api.dispose();
    await admin.storage.from("mission-deliverables").remove([correctedPath]);
    await admin.from("deliverables").delete().eq("job_id", job.id);
    await admin.from("mission_checklist_items").delete().eq("assignment_id", assignment.id);
    await admin.from("mission_assignments").delete().eq("id", assignment.id);
    await admin.from("jobs").delete().eq("id", job.id);
    await admin.from("mission_requests").delete().eq("id", mission.id);
    await admin.from("contractors").delete().eq("id", contractor.id);
    await admin.auth.admin.deleteUser(user.id);
  }
});


test("pilot owner certification exposes only corrected deliverable revision", { skip: !isolated }, async () => {
  assert.ok(supabaseURL && anonKey && serviceKey, "isolated Supabase credentials are required");
  assert.match(supabaseURL, /^https?:\/\/(127\.0\.0\.1|localhost)(:|\/)/, "E2E database must be local");

  const admin = createClient(supabaseURL, serviceKey, { auth: { persistSession: false } });
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const password = `Dom-Owner-Revision-${stamp}!Aa1`;
  const ownerEmail = `owner-revision-${stamp}@e2e.dom.invalid`;
  const clientEmail = `client-revision-${stamp}@e2e.dom.invalid`;

  const createUser = async (email) => {
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    assert.ifError(error);
    return data.user;
  };
  const ownerUser = await createUser(ownerEmail);
  const clientUser = await createUser(clientEmail);

  const { data: owner, error: ownerError } = await admin.from("contractors").insert({
    user_id: ownerUser.id,
    full_name: "Revision Mission Owner",
    email: ownerEmail,
    status: "active",
    part107_verified: true,
    insurance_verified: true,
    insurance_provider: "E2E",
    insurance_policy_number: "REVISION-E2E",
    insurance_expires_on: "2099-12-31",
    can_create_missions: true,
  }).select("id").single();
  assert.ifError(ownerError);

  const { data: client, error: clientError } = await admin.from("clients").insert({
    company_name: "Revision Client",
    contact_name: "Revision Client",
    email: clientEmail,
    user_id: clientUser.id,
  }).select("id").single();
  assert.ifError(clientError);

  const { data: mission, error: missionError } = await admin.from("mission_requests").insert({
    client_id: client.id,
    requester_name: "Revision Client",
    requester_email: clientEmail,
    company: "Revision Client",
    service_type: "aerial_images",
    location: "Revision Certification Site",
    status: "in_progress",
    created_by_contractor_id: owner.id,
    requires_admin_approval: false,
  }).select("id").single();
  assert.ifError(missionError);

  const { data: job, error: jobError } = await admin.from("jobs").insert({
    mission_request_id: mission.id,
    client_id: client.id,
    title: "Revision Certification Mission",
    service_type: "aerial_images",
    location: "Revision Certification Site",
    status: "in_progress",
    delivery_responsibility: "pilot",
    completed_at: new Date().toISOString(),
  }).select("id").single();
  assert.ifError(jobError);

  const { data: assignment, error: assignmentError } = await admin.from("mission_assignments").insert({
    job_id: job.id,
    contractor_id: owner.id,
    status: "in_progress",
    assignment_role: "owner",
    assigned_uav: "E2E Registered UAV",
  }).select("id").single();
  assert.ifError(assignmentError);

  const { data: prior, error: priorError } = await admin.from("deliverables").insert({
    job_id: job.id,
    name: "Rejected Revision",
    type: "raw_images",
    storage_url: `${job.id}/revision-1.zip`,
    storage_provider: "supabase",
    qc_passed: true,
    client_status: "revision_requested",
    client_feedback: "Please correct this.",
    revision_number: 1,
    delivered_at: new Date().toISOString(),
  }).select("id").single();
  assert.ifError(priorError);

  const { data: corrected, error: correctedError } = await admin.from("deliverables").insert({
    job_id: job.id,
    name: "Corrected Revision",
    type: "raw_images",
    storage_url: `${job.id}/revision-2.zip`,
    storage_provider: "supabase",
    qc_passed: false,
    supersedes_deliverable_id: prior.id,
    revision_number: 2,
  }).select("id").single();
  assert.ifError(correctedError);

  const ownerAuth = createClient(supabaseURL, anonKey, { auth: { persistSession: false } });
  const { data: ownerSignedIn, error: ownerSignInError } = await ownerAuth.auth.signInWithPassword({
    email: ownerEmail,
    password,
  });
  assert.ifError(ownerSignInError);
  assert.ok(ownerSignedIn.session);

  const clientAuth = createClient(supabaseURL, anonKey, { auth: { persistSession: false } });
  const { data: clientSignedIn, error: clientSignInError } = await clientAuth.auth.signInWithPassword({
    email: clientEmail,
    password,
  });
  assert.ifError(clientSignInError);
  assert.ok(clientSignedIn.session);

  const api = await request.newContext({ baseURL });
  try {
    const beforeResponse = await api.get("/api/client/access", {
      headers: { Authorization: `Bearer ${clientSignedIn.session.access_token}` },
      failOnStatusCode: false,
    });
    const before = await beforeResponse.json().catch(() => ({}));
    assert.equal(beforeResponse.status(), 200, JSON.stringify(before));
    const beforeJob = before.jobs.find((item) => item.id === job.id);
    assert.ok(beforeJob);
    assert.equal(beforeJob.deliverables.length, 0, "no rejected or pre-approval correction should be client-visible");

    const workflowResponse = await api.get(`/api/pilot/missions/${assignment.id}/workflow`, {
      headers: { Authorization: `Bearer ${ownerSignedIn.session.access_token}` },
      failOnStatusCode: false,
    });
    const workflow = await workflowResponse.json().catch(() => ({}));
    assert.equal(workflowResponse.status(), 200, JSON.stringify(workflow));

    const requiredIds = workflow.items
      .filter((item) => item.required && item.item_key !== "mission_submitted")
      .map((item) => item.id);
    if (requiredIds.length) {
      const { error: checklistError } = await admin.from("mission_checklist_items")
        .update({ completed: true, completed_at: new Date().toISOString() })
        .in("id", requiredIds);
      assert.ifError(checklistError);
    }

    const completeResponse = await api.post(`/api/pilot/missions/${assignment.id}/workflow`, {
      headers: { Authorization: `Bearer ${ownerSignedIn.session.access_token}` },
      data: { action: "complete_mission" },
      failOnStatusCode: false,
    });
    const completeBody = await completeResponse.json().catch(() => ({}));
    assert.equal(completeResponse.status(), 200, JSON.stringify(completeBody));

    const [{ data: priorAfter }, { data: correctedAfter }] = await Promise.all([
      admin.from("deliverables").select("client_status,qc_passed").eq("id", prior.id).single(),
      admin.from("deliverables").select("client_status,qc_passed,delivered_at").eq("id", corrected.id).single(),
    ]);
    assert.equal(priorAfter.client_status, "superseded");
    assert.equal(correctedAfter.qc_passed, true);
    assert.ok(correctedAfter.delivered_at);

    const afterResponse = await api.get("/api/client/access", {
      headers: { Authorization: `Bearer ${clientSignedIn.session.access_token}` },
      failOnStatusCode: false,
    });
    const after = await afterResponse.json().catch(() => ({}));
    assert.equal(afterResponse.status(), 200, JSON.stringify(after));
    const afterJob = after.jobs.find((item) => item.id === job.id);
    assert.ok(afterJob);
    assert.equal(afterJob.deliverables.length, 1);
    assert.equal(afterJob.deliverables[0].id, corrected.id);
    assert.equal(afterJob.deliverables[0].revision_number, 2);
  } finally {
    await api.dispose();
    await admin.from("notification_log").delete().eq("assignment_id", assignment.id);
    await admin.from("mission_activity_events").delete().eq("job_id", job.id);
    await admin.from("deliverables").delete().eq("job_id", job.id);
    await admin.from("mission_checklist_items").delete().eq("assignment_id", assignment.id);
    await admin.from("mission_assignments").delete().eq("id", assignment.id);
    await admin.from("jobs").delete().eq("id", job.id);
    await admin.from("mission_requests").delete().eq("id", mission.id);
    await admin.from("clients").delete().eq("id", client.id);
    await admin.from("contractors").delete().eq("id", owner.id);
    await admin.auth.admin.deleteUser(clientUser.id);
    await admin.auth.admin.deleteUser(ownerUser.id);
  }
});


test("DOM QC handoff exposes only corrected deliverable revision", { skip: !isolated }, async () => {
  assert.ok(supabaseURL && anonKey && serviceKey, "isolated Supabase credentials are required");
  assert.match(supabaseURL, /^https?:\/\/(127\.0\.0\.1|localhost)(:|\/)/, "E2E database must be local");

  const admin = createClient(supabaseURL, serviceKey, { auth: { persistSession: false } });
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const password = `Dom-QC-Revision-${stamp}!Aa1`;
  const adminEmail = `qc-admin-${stamp}@e2e.dom.invalid`;
  const clientEmail = `qc-client-${stamp}@e2e.dom.invalid`;

  const makeUser = async (email) => {
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    assert.ifError(error);
    return data.user;
  };
  const adminUser = await makeUser(adminEmail);
  const clientUser = await makeUser(clientEmail);

  const { error: allowError } = await admin.from("admin_users").insert({
    email: adminEmail,
    full_name: "E2E QC Admin",
    role: "admin",
  });
  assert.ifError(allowError);

  const { data: client, error: clientError } = await admin.from("clients").insert({
    company_name: "DOM QC Revision Client",
    contact_name: "DOM QC Client",
    email: clientEmail,
    user_id: clientUser.id,
  }).select("id").single();
  assert.ifError(clientError);

  const { data: mission, error: missionError } = await admin.from("mission_requests").insert({
    client_id: client.id,
    requester_name: "DOM QC Client",
    requester_email: clientEmail,
    company: "DOM QC Revision Client",
    service_type: "aerial_images",
    location: "DOM QC Site",
    status: "in_progress",
  }).select("id").single();
  assert.ifError(missionError);

  const { data: job, error: jobError } = await admin.from("jobs").insert({
    mission_request_id: mission.id,
    client_id: client.id,
    title: "DOM QC Revision Mission",
    service_type: "aerial_images",
    location: "DOM QC Site",
    status: "in_progress",
    delivery_responsibility: "admin",
  }).select("id").single();
  assert.ifError(jobError);

  const { data: prior, error: priorError } = await admin.from("deliverables").insert({
    job_id: job.id,
    name: "DOM Rejected Revision",
    type: "raw_images",
    storage_url: `${job.id}/dom-revision-1.zip`,
    storage_provider: "supabase",
    qc_passed: true,
    client_status: "revision_requested",
    client_feedback: "Please correct this output.",
    revision_number: 1,
    delivered_at: new Date().toISOString(),
  }).select("id").single();
  assert.ifError(priorError);

  const { data: corrected, error: correctedError } = await admin.from("deliverables").insert({
    job_id: job.id,
    name: "DOM Corrected Revision",
    type: "raw_images",
    storage_url: `${job.id}/dom-revision-2.zip`,
    storage_provider: "supabase",
    qc_passed: false,
    supersedes_deliverable_id: prior.id,
    revision_number: 2,
  }).select("id").single();
  assert.ifError(correctedError);

  const adminAuth = createClient(supabaseURL, anonKey, { auth: { persistSession: false } });
  const { data: adminSession, error: adminSignInError } = await adminAuth.auth.signInWithPassword({
    email: adminEmail,
    password,
  });
  assert.ifError(adminSignInError);
  assert.ok(adminSession.session);

  const clientAuth = createClient(supabaseURL, anonKey, { auth: { persistSession: false } });
  const { data: clientSession, error: clientSignInError } = await clientAuth.auth.signInWithPassword({
    email: clientEmail,
    password,
  });
  assert.ifError(clientSignInError);
  assert.ok(clientSession.session);

  const api = await request.newContext({ baseURL });
  try {
    const beforeResponse = await api.get("/api/client/access", {
      headers: { Authorization: `Bearer ${clientSession.session.access_token}` },
      failOnStatusCode: false,
    });
    const before = await beforeResponse.json().catch(() => ({}));
    assert.equal(beforeResponse.status(), 200, JSON.stringify(before));
    const beforeJob = before.jobs.find((item) => item.id === job.id);
    assert.ok(beforeJob);
    assert.equal(beforeJob.deliverables.length, 0);

    const qcResponse = await api.post(`/api/admin/missions/${mission.id}/manage`, {
      headers: {
        Authorization: `Bearer ${adminSession.session.access_token}`,
        "Content-Type": "application/json",
      },
      data: {
        action: "set_deliverable_qc",
        deliverableId: corrected.id,
        passed: true,
      },
      failOnStatusCode: false,
    });
    const qcBody = await qcResponse.json().catch(() => ({}));
    assert.equal(qcResponse.status(), 200, JSON.stringify(qcBody));

    const [{ data: priorAfter }, { data: correctedAfter }] = await Promise.all([
      admin.from("deliverables").select("client_status,qc_passed").eq("id", prior.id).single(),
      admin.from("deliverables").select("client_status,qc_passed,delivered_at").eq("id", corrected.id).single(),
    ]);
    assert.equal(priorAfter.client_status, "superseded");
    assert.equal(correctedAfter.qc_passed, true);
    assert.ok(correctedAfter.delivered_at);

    const afterResponse = await api.get("/api/client/access", {
      headers: { Authorization: `Bearer ${clientSession.session.access_token}` },
      failOnStatusCode: false,
    });
    const after = await afterResponse.json().catch(() => ({}));
    assert.equal(afterResponse.status(), 200, JSON.stringify(after));
    const afterJob = after.jobs.find((item) => item.id === job.id);
    assert.ok(afterJob);
    assert.equal(afterJob.deliverables.length, 1);
    assert.equal(afterJob.deliverables[0].id, corrected.id);
    assert.equal(afterJob.deliverables[0].revision_number, 2);
  } finally {
    await api.dispose();
    await admin.from("notification_log").delete().eq("job_id", job.id);
    await admin.from("mission_activity_events").delete().eq("job_id", job.id);
    await admin.from("deliverables").delete().eq("job_id", job.id);
    await admin.from("jobs").delete().eq("id", job.id);
    await admin.from("mission_requests").delete().eq("id", mission.id);
    await admin.from("clients").delete().eq("id", client.id);
    await admin.from("admin_users").delete().eq("email", adminEmail);
    await admin.auth.admin.deleteUser(clientUser.id);
    await admin.auth.admin.deleteUser(adminUser.id);
  }
});


test("pilot cannot update another pilot CRM account", { skip: !isolated }, async () => {
  assert.ok(supabaseURL && anonKey && serviceKey, "isolated Supabase credentials are required");
  assert.match(supabaseURL, /^https?:\/\/(127\.0\.0\.1|localhost)(:|\/)/, "E2E database must be local");

  const admin = createClient(supabaseURL, serviceKey, { auth: { persistSession: false } });
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const password = `Dom-CRM-Isolation-${stamp}!Aa1`;
  const attackerEmail = `crm-attacker-${stamp}@e2e.dom.invalid`;
  const ownerEmail = `crm-owner-${stamp}@e2e.dom.invalid`;

  const users = [];
  for (const email of [attackerEmail, ownerEmail]) {
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    assert.ifError(error);
    users.push(data.user);
  }

  const { data: contractors, error: contractorError } = await admin.from("contractors").insert([
    { user_id: users[0].id, full_name: "CRM Attacker", email: attackerEmail, status: "active", part107_verified: true, can_create_missions: false },
    { user_id: users[1].id, full_name: "CRM Owner", email: ownerEmail, status: "active", part107_verified: true, can_create_missions: false },
  ]).select("id,user_id");
  assert.ifError(contractorError);
  const attacker = contractors.find((item) => item.user_id === users[0].id);
  const owner = contractors.find((item) => item.user_id === users[1].id);
  assert.ok(attacker && owner);

  const { data: account, error: accountError } = await admin.from("pilot_crm_accounts").insert({
    contractor_id: owner.id,
    company_name: "Protected CRM Company",
    contact_name: "Protected Contact",
    email: `protected-${stamp}@example.com`,
    status: "prospect",
    notes: "Owner-only notes",
    match_status: "clear",
    outreach_allowed: true,
  }).select("id").single();
  assert.ifError(accountError);

  const auth = createClient(supabaseURL, anonKey, { auth: { persistSession: false } });
  const { data: signedIn, error: signInError } = await auth.auth.signInWithPassword({
    email: attackerEmail,
    password,
  });
  assert.ifError(signInError);
  assert.ok(signedIn.session);

  const api = await request.newContext({ baseURL });
  try {
    const response = await api.patch("/api/pilot/crm", {
      headers: {
        Authorization: `Bearer ${signedIn.session.access_token}`,
        "Content-Type": "application/json",
      },
      data: {
        id: account.id,
        status: "won",
        notes: "Unauthorized overwrite",
        nextAction: "Take over",
      },
      failOnStatusCode: false,
    });
    const body = await response.json().catch(() => ({}));
    assert.equal(response.status(), 404, JSON.stringify(body));

    const { data: unchanged, error: unchangedError } = await admin.from("pilot_crm_accounts")
      .select("status,notes,next_action,contractor_id")
      .eq("id", account.id)
      .single();
    assert.ifError(unchangedError);
    assert.equal(unchanged.contractor_id, owner.id);
    assert.equal(unchanged.status, "prospect");
    assert.equal(unchanged.notes, "Owner-only notes");
    assert.equal(unchanged.next_action, null);
  } finally {
    await api.dispose();
    await admin.from("crm_ownership_reviews").delete().eq("pilot_crm_account_id", account.id);
    await admin.from("pilot_crm_accounts").delete().eq("id", account.id);
    await admin.from("contractors").delete().in("id", [attacker.id, owner.id]);
    for (const user of users) await admin.auth.admin.deleteUser(user.id);
  }
});


test("lead conversion preserves CRM history and links the client", { skip: !isolated }, async () => {
  assert.ok(supabaseURL && anonKey && serviceKey, "isolated Supabase credentials are required");
  assert.match(supabaseURL, /^https?:\/\/(127\.0\.0\.1|localhost)(:|\/)/, "E2E database must be local");

  const admin = createClient(supabaseURL, serviceKey, { auth: { persistSession: false } });
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const adminEmail = `convert-admin-${stamp}@e2e.dom.invalid`;
  const password = `Dom-Convert-E2E-${stamp}!Aa1`;
  const leadEmail = `convert-lead-${stamp}@e2e.dom.invalid`;

  const { data: adminUserData, error: adminUserError } = await admin.auth.admin.createUser({
    email: adminEmail,
    password,
    email_confirm: true,
  });
  assert.ifError(adminUserError);
  const adminUser = adminUserData.user;
  assert.ok(adminUser);

  const { error: allowError } = await admin.from("admin_users").insert({
    email: adminEmail,
    full_name: "E2E Convert Admin",
    role: "admin",
  });
  assert.ifError(allowError);

  const { data: lead, error: leadError } = await admin.from("leads").insert({
    name: "Conversion Contact",
    email: leadEmail,
    phone: "555-0101",
    company: "Conversion Company",
    industry: "construction",
    source: "e2e",
    status: "qualified",
  }).select("id").single();
  assert.ifError(leadError);

  const { data: contact, error: contactError } = await admin.from("lead_contacts").insert({
    lead_id: lead.id,
    name: "Secondary Estimator",
    email: `estimator-${stamp}@e2e.dom.invalid`,
    phone: "555-0102",
    title: "Estimator",
    is_primary: false,
  }).select("id").single();
  assert.ifError(contactError);

  const { data: location, error: locationError } = await admin.from("lead_locations").insert({
    lead_id: lead.id,
    label: "Main Yard",
    address: "123 E2E Test Ave",
    notes: "Keep this location after conversion",
  }).select("id").single();
  assert.ifError(locationError);

  const { data: existingActivity, error: activityError } = await admin.from("lead_activities").insert({
    lead_id: lead.id,
    activity_type: "call",
    summary: "Initial qualification call",
    created_by: adminEmail,
  }).select("id").single();
  assert.ifError(activityError);

  const auth = createClient(supabaseURL, anonKey, { auth: { persistSession: false } });
  const { data: signedIn, error: signInError } = await auth.auth.signInWithPassword({
    email: adminEmail,
    password,
  });
  assert.ifError(signInError);
  assert.ok(signedIn.session);

  const api = await request.newContext({ baseURL });
  let clientId = null;
  try {
    const response = await api.post(`/api/admin/leads/${lead.id}/convert`, {
      headers: {
        Authorization: `Bearer ${signedIn.session.access_token}`,
        "Content-Type": "application/json",
      },
      data: {},
      failOnStatusCode: false,
    });
    const body = await response.json().catch(() => ({}));
    assert.equal(response.status(), 200, JSON.stringify(body));
    clientId = body.clientId;
    assert.ok(clientId);

    const [{ data: leadAfter }, { data: clientAfter }, { data: contacts }, { data: locations }, { data: activities }] = await Promise.all([
      admin.from("leads").select("status").eq("id", lead.id).single(),
      admin.from("clients").select("lead_id,company_name,contact_name,email,phone,industry").eq("id", clientId).single(),
      admin.from("lead_contacts").select("id,name,email").eq("lead_id", lead.id),
      admin.from("lead_locations").select("id,label,address,notes").eq("lead_id", lead.id),
      admin.from("lead_activities").select("id,activity_type,summary").eq("lead_id", lead.id).order("created_at"),
    ]);

    assert.equal(leadAfter.status, "won");
    assert.equal(clientAfter.lead_id, lead.id);
    assert.equal(clientAfter.company_name, "Conversion Company");
    assert.equal(clientAfter.contact_name, "Conversion Contact");
    assert.equal(clientAfter.email, leadEmail);
    assert.equal(clientAfter.phone, "555-0101");
    assert.equal(clientAfter.industry, "construction");

    assert.ok(contacts.some((item) => item.id === contact.id && item.name === "Secondary Estimator"));
    assert.ok(locations.some((item) => item.id === location.id && item.label === "Main Yard"));
    assert.ok(activities.some((item) => item.id === existingActivity.id && item.summary === "Initial qualification call"));
    assert.ok(activities.some((item) => item.activity_type === "status_change" && /Converted to client/i.test(item.summary)));
  } finally {
    await api.dispose();
    if (clientId) await admin.from("clients").delete().eq("id", clientId);
    await admin.from("lead_activities").delete().eq("lead_id", lead.id);
    await admin.from("lead_locations").delete().eq("lead_id", lead.id);
    await admin.from("lead_contacts").delete().eq("lead_id", lead.id);
    await admin.from("leads").delete().eq("id", lead.id);
    await admin.from("admin_users").delete().eq("email", adminEmail);
    await admin.auth.admin.deleteUser(adminUser.id);
  }
});


test("CRM ownership review blocks and then releases pilot outreach", { skip: !isolated }, async () => {
  assert.ok(supabaseURL && anonKey && serviceKey, "isolated Supabase credentials are required");
  assert.match(supabaseURL, /^https?:\/\/(127\.0\.0\.1|localhost)(:|\/)/, "E2E database must be local");

  const admin = createClient(supabaseURL, serviceKey, { auth: { persistSession: false } });
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const password = `Dom-CRM-Review-${stamp}!Aa1`;
  const pilotEmail = `crm-review-pilot-${stamp}@e2e.dom.invalid`;
  const adminEmail = `crm-review-admin-${stamp}@e2e.dom.invalid`;
  const sharedDomain = `shared-${stamp}.example.com`;

  const makeUser = async (email) => {
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    assert.ifError(error);
    return data.user;
  };
  const pilotUser = await makeUser(pilotEmail);
  const adminUser = await makeUser(adminEmail);

  const { data: pilot, error: pilotError } = await admin.from("contractors").insert({
    user_id: pilotUser.id,
    full_name: "CRM Review Pilot",
    email: pilotEmail,
    status: "active",
    part107_verified: true,
    can_create_missions: false,
  }).select("id").single();
  assert.ifError(pilotError);

  const { error: allowError } = await admin.from("admin_users").insert({
    email: adminEmail,
    full_name: "CRM Review Admin",
    role: "admin",
  });
  assert.ifError(allowError);

  const { data: protectedClient, error: protectedClientError } = await admin.from("clients").insert({
    company_name: "Protected Network Company",
    contact_name: "DOM Contact",
    email: `dom-contact@${sharedDomain}`,
  }).select("id").single();
  assert.ifError(protectedClientError);

  const pilotAuth = createClient(supabaseURL, anonKey, { auth: { persistSession: false } });
  const { data: pilotSession, error: pilotSignInError } = await pilotAuth.auth.signInWithPassword({
    email: pilotEmail,
    password,
  });
  assert.ifError(pilotSignInError);
  assert.ok(pilotSession.session);

  const adminAuth = createClient(supabaseURL, anonKey, { auth: { persistSession: false } });
  const { data: adminSession, error: adminSignInError } = await adminAuth.auth.signInWithPassword({
    email: adminEmail,
    password,
  });
  assert.ifError(adminSignInError);
  assert.ok(adminSession.session);

  const api = await request.newContext({ baseURL });
  let accountId = null;
  let reviewId = null;
  try {
    const createResponse = await api.post("/api/pilot/crm", {
      headers: {
        Authorization: `Bearer ${pilotSession.session.access_token}`,
        "Content-Type": "application/json",
      },
      data: {
        companyName: "Possible Overlap Company",
        contactName: "Pilot Prospect",
        email: `pilot-prospect@${sharedDomain}`,
        website: `https://${sharedDomain}`,
        notes: "Pilot-owned prospect under review",
      },
      failOnStatusCode: false,
    });
    const createBody = await createResponse.json().catch(() => ({}));
    assert.equal(createResponse.status(), 200, JSON.stringify(createBody));
    accountId = createBody.account?.id;
    assert.ok(accountId);
    assert.equal(createBody.account.match_status, "coordination_required");
    assert.equal(createBody.account.outreach_allowed, false);

    const { data: review, error: reviewError } = await admin.from("crm_ownership_reviews")
      .select("id,status")
      .eq("pilot_crm_account_id", accountId)
      .single();
    assert.ifError(reviewError);
    reviewId = review.id;

    const blockedResponse = await api.patch("/api/pilot/crm", {
      headers: {
        Authorization: `Bearer ${pilotSession.session.access_token}`,
        "Content-Type": "application/json",
      },
      data: { id: accountId, logContact: true, status: "contacted" },
      failOnStatusCode: false,
    });
    const blockedBody = await blockedResponse.json().catch(() => ({}));
    assert.equal(blockedResponse.status(), 403, JSON.stringify(blockedBody));
    assert.match(blockedBody.error ?? "", /ownership review/i);

    const approveResponse = await api.patch("/api/admin/crm/ownership", {
      headers: {
        Authorization: `Bearer ${adminSession.session.access_token}`,
        "Content-Type": "application/json",
      },
      data: { id: reviewId, decision: "pilot_owned_approved" },
      failOnStatusCode: false,
    });
    const approveBody = await approveResponse.json().catch(() => ({}));
    assert.equal(approveResponse.status(), 200, JSON.stringify(approveBody));

    const allowedResponse = await api.patch("/api/pilot/crm", {
      headers: {
        Authorization: `Bearer ${pilotSession.session.access_token}`,
        "Content-Type": "application/json",
      },
      data: { id: accountId, logContact: true, status: "contacted", nextAction: "Follow up next week" },
      failOnStatusCode: false,
    });
    const allowedBody = await allowedResponse.json().catch(() => ({}));
    assert.equal(allowedResponse.status(), 200, JSON.stringify(allowedBody));

    const { data: accountAfter, error: accountAfterError } = await admin.from("pilot_crm_accounts")
      .select("status,match_status,outreach_allowed,last_contacted_at,next_action")
      .eq("id", accountId)
      .single();
    assert.ifError(accountAfterError);
    assert.equal(accountAfter.status, "contacted");
    assert.equal(accountAfter.match_status, "approved");
    assert.equal(accountAfter.outreach_allowed, true);
    assert.ok(accountAfter.last_contacted_at);
    assert.equal(accountAfter.next_action, "Follow up next week");
  } finally {
    await api.dispose();
    if (reviewId) await admin.from("crm_ownership_reviews").delete().eq("id", reviewId);
    if (accountId) await admin.from("pilot_crm_accounts").delete().eq("id", accountId);
    await admin.from("clients").delete().eq("id", protectedClient.id);
    await admin.from("contractors").delete().eq("id", pilot.id);
    await admin.from("admin_users").delete().eq("email", adminEmail);
    await admin.auth.admin.deleteUser(adminUser.id);
    await admin.auth.admin.deleteUser(pilotUser.id);
  }
});


test("pilot equipment inventory exists only in Profile and Settings", { skip: !isolated }, async () => {
  assert.ok(supabaseURL && anonKey && serviceKey, "isolated Supabase credentials are required");
  assert.match(supabaseURL, /^https?:\/\/(127\.0\.0\.1|localhost)(:|\/)/, "E2E database must be local");

  const admin = createClient(supabaseURL, serviceKey, { auth: { persistSession: false } });
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const email = `equipment-ui-${stamp}@e2e.dom.invalid`;
  const password = `Dom-Equipment-UI-${stamp}!Aa1`;

  const { data: userData, error: userError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  assert.ifError(userError);
  const user = userData.user;
  assert.ok(user);

  const { data: contractor, error: contractorError } = await admin.from("contractors").insert({
    user_id: user.id,
    full_name: "Equipment UI Pilot",
    email,
    status: "active",
    part107_verified: true,
    can_create_missions: false,
  }).select("id").single();
  assert.ifError(contractorError);

  const auth = createClient(supabaseURL, anonKey, { auth: { persistSession: false } });
  const { data: signedIn, error: signInError } = await auth.auth.signInWithPassword({ email, password });
  assert.ifError(signInError);
  assert.ok(signedIn.session);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const storageKey = `sb-${new URL(supabaseURL).hostname.split(".")[0]}-auth-token`;
  await context.addInitScript(({ key, session }) => {
    localStorage.setItem(key, JSON.stringify(session));
  }, { key: storageKey, session: signedIn.session });

  const page = await context.newPage();
  try {
    const response = await page.goto(`${baseURL}/pilot`, { waitUntil: "networkidle", timeout: 45_000 });
    assert.ok(response && response.status() < 400);

    const sidebar = page.locator("aside");
    await page.getByRole("button", { name: /Flight Operations/i }).click();
    const flightOperations = sidebar.locator("nav").getByText("Flight Operations", { exact: true }).locator("..").locator("..");
    assert.equal(await flightOperations.getByText("Equipment", { exact: true }).count(), 0, "equipment should not exist as a second Flight Operations menu item");

    await page.getByRole("button", { name: /Profile & Settings/i }).click();
    await page.getByText("Aircraft & Equipment", { exact: true }).waitFor({ timeout: 10_000 });

    const profileText = await page.locator("#main-content").innerText();
    assert.match(profileText, /Aircraft & Equipment/i);
    assert.match(profileText, /only equipment inventory/i);
    assert.match(profileText, /FAA registration/i);
  } finally {
    await page.close();
    await context.close();
    await browser.close();
    await admin.from("contractors").delete().eq("id", contractor.id);
    await admin.auth.admin.deleteUser(user.id);
  }
});


test("DOMINIC flight audits persist and remain pilot-owned", { skip: !isolated }, async () => {
  assert.ok(supabaseURL && anonKey && serviceKey, "isolated Supabase credentials are required");
  assert.match(supabaseURL, /^https?:\/\/(127\.0\.0\.1|localhost)(:|\/)/, "E2E database must be local");

  const admin = createClient(supabaseURL, serviceKey, { auth: { persistSession: false } });
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const password = `Dom-Flight-Audit-${stamp}!Aa1`;
  const pilotAEmail = `flight-audit-a-${stamp}@e2e.dom.invalid`;
  const pilotBEmail = `flight-audit-b-${stamp}@e2e.dom.invalid`;

  const createUser = async (email) => {
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    assert.ifError(error);
    assert.ok(data.user);
    return data.user;
  };
  const userA = await createUser(pilotAEmail);
  const userB = await createUser(pilotBEmail);

  const { data: contractors, error: contractorError } = await admin.from("contractors").insert([
    {
      user_id: userA.id,
      full_name: "Flight Audit Pilot A",
      email: pilotAEmail,
      status: "active",
      part107_verified: true,
      can_create_missions: true,
    },
    {
      user_id: userB.id,
      full_name: "Flight Audit Pilot B",
      email: pilotBEmail,
      status: "active",
      part107_verified: true,
      can_create_missions: true,
    },
  ]).select("id,user_id");
  assert.ifError(contractorError);
  const contractorA = contractors.find((item) => item.user_id === userA.id);
  const contractorB = contractors.find((item) => item.user_id === userB.id);
  assert.ok(contractorA && contractorB);

  const signIn = async (email) => {
    const client = createClient(supabaseURL, anonKey, { auth: { persistSession: false } });
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    assert.ifError(error);
    assert.ok(data.session);
    return data.session;
  };
  const sessionA = await signIn(pilotAEmail);
  const sessionB = await signIn(pilotBEmail);

  const apiA = await request.newContext({
    baseURL,
    extraHTTPHeaders: { Authorization: `Bearer ${sessionA.access_token}` },
  });
  const apiB = await request.newContext({
    baseURL,
    extraHTTPHeaders: { Authorization: `Bearer ${sessionB.access_token}` },
  });

  let runId = null;
  try {
    const createResponse = await apiA.post("/api/pilot/dominic/flights", {
      data: {
        missionType: "object",
        aircraft: {
          vendor: "simulator",
          model: "DOMINIC Virtual Aircraft",
          aircraftId: `audit-aircraft-${stamp}`,
        },
        capabilities: { telemetry: true, photoCapture: true },
        payload: {
          id: "generic-wide-rgb",
          name: "Generic Wide RGB Camera",
          kind: "rgb",
          horizontalFovDeg: 84,
          verticalFovDeg: 60,
        },
        plan: {
          mode: "full",
          checkpointCount: 1,
          checkpointIds: ["audit-checkpoint-1"],
        },
        calibration: { ready: true },
        coverageSummary: { coveragePct: 0 },
      },
      failOnStatusCode: false,
    });
    const createBody = await createResponse.json().catch(() => ({}));
    assert.equal(createResponse.status(), 201, JSON.stringify(createBody));
    runId = createBody.run?.id;
    assert.ok(runId);

    const ownerListResponse = await apiA.get("/api/pilot/dominic/flights?limit=10", {
      failOnStatusCode: false,
    });
    const ownerList = await ownerListResponse.json().catch(() => ({}));
    assert.equal(ownerListResponse.status(), 200, JSON.stringify(ownerList));
    assert.ok(ownerList.runs.some((run) => run.id === runId));
    const listed = ownerList.runs.find((run) => run.id === runId);
    assert.equal(listed.payload_snapshot?.name, "Generic Wide RGB Camera");

    const otherListResponse = await apiB.get("/api/pilot/dominic/flights?limit=10", {
      failOnStatusCode: false,
    });
    const otherList = await otherListResponse.json().catch(() => ({}));
    assert.equal(otherListResponse.status(), 200, JSON.stringify(otherList));
    assert.equal(otherList.runs.some((run) => run.id === runId), false);

    const foreignPatchResponse = await apiB.patch("/api/pilot/dominic/flights", {
      data: { runId, status: "complete", completedAtMs: Date.now() },
      failOnStatusCode: false,
    });
    assert.equal(foreignPatchResponse.status(), 404);

    const capturedAtMs = Date.now();
    const finishResponse = await apiA.patch("/api/pilot/dominic/flights", {
      data: {
        runId,
        status: "complete",
        completedAtMs: capturedAtMs,
        coverageSummary: { coveragePct: 100 },
        events: [{
          atMs: capturedAtMs,
          phase: "COMPLETE",
          message: "E2E flight complete.",
          checkpointId: "audit-checkpoint-1",
          aircraftState: { flightMode: "LANDED", batteryPercent: 88 },
        }],
        observations: [{
          id: `audit-observation-${stamp}`,
          checkpointId: "audit-checkpoint-1",
          capturedAtMs,
          latitude: 39.95,
          longitude: -75.16,
          relativeAltitudeFt: 30,
          cameraAngle: -25,
          sharpnessScore: 0.94,
          exposureScore: 0.91,
          usable: true,
          imageReference: "e2e://capture/1",
        }],
      },
      failOnStatusCode: false,
    });
    const finishBody = await finishResponse.json().catch(() => ({}));
    assert.equal(finishResponse.status(), 200, JSON.stringify(finishBody));
    assert.equal(finishBody.eventsRecorded, 1);
    assert.equal(finishBody.observationsRecorded, 1);

    const [{ data: run }, { data: events }, { data: observations }] = await Promise.all([
      admin.from("dominic_flight_runs")
        .select("contractor_id,status,payload_snapshot,coverage_summary,completed_at")
        .eq("id", runId)
        .single(),
      admin.from("dominic_flight_events")
        .select("phase,message,checkpoint_id,aircraft_state")
        .eq("flight_run_id", runId),
      admin.from("dominic_capture_observations")
        .select("checkpoint_id,usable,image_reference,metadata")
        .eq("flight_run_id", runId),
    ]);

    assert.equal(run.contractor_id, contractorA.id);
    assert.equal(run.status, "complete");
    assert.equal(run.payload_snapshot.name, "Generic Wide RGB Camera");
    assert.equal(run.coverage_summary.coveragePct, 100);
    assert.ok(run.completed_at);
    assert.equal(events.length, 1);
    assert.equal(events[0].message, "E2E flight complete.");
    assert.equal(events[0].aircraft_state.flightMode, "LANDED");
    assert.equal(observations.length, 1);
    assert.equal(observations[0].checkpoint_id, "audit-checkpoint-1");
    assert.equal(observations[0].usable, true);
    assert.equal(observations[0].metadata.clientObservationId, `audit-observation-${stamp}`);
  } finally {
    await apiA.dispose();
    await apiB.dispose();
    if (runId) {
      await admin.from("dominic_capture_observations").delete().eq("flight_run_id", runId);
      await admin.from("dominic_flight_events").delete().eq("flight_run_id", runId);
      await admin.from("dominic_flight_runs").delete().eq("id", runId);
    }
    await admin.from("contractors").delete().in("id", [contractorA.id, contractorB.id]);
    await admin.auth.admin.deleteUser(userA.id);
    await admin.auth.admin.deleteUser(userB.id);
  }
});

test("DOMINIC maintenance queue includes older urgent work and stays user-owned", { skip: !isolated }, async () => {
  assert.ok(supabaseURL && anonKey && serviceKey, "isolated Supabase credentials are required");
  assert.match(supabaseURL, /^https?:\/\/(127\.0\.0\.1|localhost)(:|\/)/, "E2E database must be local");
  const admin = createClient(supabaseURL, serviceKey, { auth: { persistSession: false } });
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const password = `Dom-Queue-${stamp}!Aa1`;
  const users = [];
  let browser;
  let browserContext;
  try {
    for (const suffix of ["owner", "other"]) {
      const { data, error } = await admin.auth.admin.createUser({ email: `queue-${suffix}-${stamp}@e2e.dom.invalid`, password, email_confirm: true });
      assert.ifError(error);
      users.push(data.user);
    }
    const { data: assets, error: assetError } = await admin.from("dominic_assets").insert([
      { user_id: users[0].id, name: "Queue Tank 17", asset_type: "tank", external_ref: `QUEUE-TANK-${stamp}`, location_label: "North terminal" },
      { user_id: users[0].id, name: "Queue transfer line", asset_type: "pipeline", location_label: "Dock" },
      { user_id: users[1].id, name: "Other operator private tank", asset_type: "tank" },
    ]).select("id,name");
    assert.ifError(assetError);
    const tank = assets.find((asset) => asset.name === "Queue Tank 17");
    const pipe = assets.find((asset) => asset.name === "Queue transfer line");
    const privateTank = assets.find((asset) => asset.name === "Other operator private tank");
    const { randomUUID } = await import("node:crypto");
    const prefix = randomUUID().slice(0, 24);
    const rows = Array.from({ length: 201 }, (_, index) => ({
      id: `${prefix}${String(index).padStart(12, "0")}`,
      user_id: users[0].id,
      asset_id: index === 200 ? pipe.id : tank.id,
      issue_type: "corrosion",
      title: index === 200 ? "Older critical transfer line defect" : `Queue issue ${index}`,
      severity: index === 200 ? "critical" : "low",
      status: index === 198 ? "verified" : index === 199 ? "resolved" : index === 3 ? "in_progress" : "open",
      first_seen_at: index === 200 ? "2026-01-01T00:00:00Z" : new Date().toISOString(),
      last_seen_at: index === 200 ? "2026-01-02T00:00:00Z" : new Date().toISOString(),
      metadata: index === 199 ? { verificationRequired: true, verificationStatus: "required" }
        : index === 3 ? { maintenanceWorkOrder: "QUEUE-WO-778" } : {},
    }));
    const { error: issueError } = await admin.from("dominic_issues").insert([
      ...rows,
      { id: randomUUID(), user_id: users[1].id, asset_id: privateTank.id, issue_type: "corrosion", title: "Other operator private critical defect", severity: "critical", status: "open", first_seen_at: new Date().toISOString(), last_seen_at: new Date().toISOString(), metadata: {} },
    ]);
    assert.ifError(issueError);
    const auth = createClient(supabaseURL, anonKey, { auth: { persistSession: false } });
    const { data: signedIn, error: signInError } = await auth.auth.signInWithPassword({ email: users[0].email, password });
    assert.ifError(signInError);
    const { data: hidden, error: hiddenError } = await auth.from("dominic_issues").select("id").eq("user_id", users[1].id).range(0, 199);
    assert.ifError(hiddenError);
    assert.deepEqual(hidden, [], "another operator's queue must remain private");

    browser = await chromium.launch({ headless: true });
    browserContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await browserContext.addInitScript(({ key, session }) => localStorage.setItem(key, JSON.stringify(session)), {
      key: `sb-${new URL(supabaseURL).hostname.split(".")[0]}-auth-token`, session: signedIn.session,
    });
    const page = await browserContext.newPage();
    const errors = [];
    const issueQueries = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("request", (req) => {
      if (req.url().includes("/rest/v1/dominic_issues?")) issueQueries.push(new URL(req.url()));
    });
    await page.goto(`${baseURL}/dominic`, { waitUntil: "networkidle", timeout: 45_000 });
    await page.getByRole("button", { name: "Assets & inspections", exact: true }).click();
    const queue = page.getByRole("region", { name: "Maintenance work queue" });
    await queue.getByText("Showing 1–10 of 200 issues", { exact: true }).waitFor();
    assert.ok(issueQueries.some((url) => url.searchParams.get("offset") === "200"), "queue must fetch past the first 200 issues");
    assert.ok(issueQueries.every((url) => url.searchParams.get("user_id") === `eq.${users[0].id}`), "queue queries must explicitly scope ownership");
    assert.match(await queue.locator("article").first().innerText(), /Older critical transfer line defect/);
    assert.ok(!(await queue.innerText()).includes("Other operator private"));
    await queue.screenshot({ path: "/tmp/dom-maintenance-queue-desktop.png" });
    await queue.locator("article").first().getByRole("button", { name: "Open issue", exact: true }).click();
    await page.locator("#dominic-issue-details").getByText("Older critical transfer line defect", { exact: true }).waitFor();
    await queue.getByRole("button", { name: "Next", exact: true }).click();
    await queue.getByText("Showing 11–20 of 200 issues", { exact: true }).waitFor();
    await queue.getByRole("textbox", { name: "Search maintenance work" }).fill("QUEUE-WO-778");
    await queue.getByText("Showing 1–1 of 1 issues", { exact: true }).waitFor();
    assert.match(await queue.locator("article").innerText(), /Queue issue 3/);
    await queue.getByRole("textbox", { name: "Search maintenance work" }).fill("");
    await queue.getByRole("button", { name: /^Awaiting verification/ }).click();
    await queue.getByText("Showing 1–1 of 1 issues", { exact: true }).waitFor();
    assert.match(await queue.locator("article").innerText(), /Queue issue 199/);
    await queue.getByRole("combobox", { name: "Maintenance priority filter" }).selectOption("escalated");
    await queue.getByText("No work matches these filters.", { exact: true }).waitFor();
    await queue.getByRole("button", { name: /^All active work/ }).click();
    await queue.getByText("Showing 1–1 of 1 issues", { exact: true }).waitFor();
    assert.match(await queue.locator("article").innerText(), /Older critical transfer line defect/);
    await page.setViewportSize({ width: 390, height: 844 });
    await queue.scrollIntoViewIfNeeded();
    assert.ok(await queue.evaluate((node) => node.scrollWidth <= node.clientWidth + 1), "queue controls must fit a narrow viewport");
    await queue.screenshot({ path: "/tmp/dom-maintenance-queue-mobile.png" });
    await queue.locator("article").getByRole("button", { name: "Open issue", exact: true }).click();
    await page.locator("#dominic-issue-details").getByText("Older critical transfer line defect", { exact: true }).waitFor({ state: "visible" });
    assert.deepEqual(errors, []);
  } finally {
    await browserContext?.close();
    await browser?.close();
    for (const user of users.reverse()) {
      await admin.from("dominic_issue_events").delete().eq("user_id", user.id);
      await admin.from("dominic_issues").delete().eq("user_id", user.id);
      await admin.from("dominic_assets").delete().eq("user_id", user.id);
      await admin.auth.admin.deleteUser(user.id);
    }
  }
});

test("DOMINIC keeps the working project across planning and inspection and opens the requested output", { skip: !isolated, timeout: 180_000 }, async () => {
  assert.ok(supabaseURL && anonKey && serviceKey);
  assert.match(supabaseURL, /^https?:\/\/(127\.0\.0\.1|localhost)(:|\/)/);
  const admin = createClient(supabaseURL, serviceKey, { auth: { persistSession: false } });
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const email = `continuity-${stamp}@e2e.dom.invalid`;
  const password = `Dom-Continuity-${stamp}!Aa1`;
  const { data: created, error: userError } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  assert.ifError(userError);
  const user = created.user;
  let contractor, mission, job, project, browser, intruder;
  const inspectionStoragePaths = [];
  const previewTimers = new Set();
  try {
    const seed = async (table, row) => {
      const { data, error } = await admin.from(table).insert(row).select("*").single();
      assert.ifError(error);
      return data;
    };
    contractor = await seed("contractors", { user_id: user.id, full_name: "Workflow operator", email, status: "active" });
    await seed("dominic_profiles", { user_id: user.id, plan: "organization", status: "active" });
    mission = await seed("mission_requests", { requester_name: "Workflow client", requester_email: email, service_type: "aerial_images", location: "Workflow site", status: "approved" });
    job = await seed("jobs", { mission_request_id: mission.id, title: "Workflow mission", service_type: "aerial_images", location: "Workflow site", status: "scheduled" });
    project = await seed("mapping_projects", { job_id: job.id, contractor_id: contractor.id, name: "Working reconstruction", status: "uploaded", image_count: 20 });
    const auth = createClient(supabaseURL, anonKey, { auth: { persistSession: false } });
    const { data: login, error: loginError } = await auth.auth.signInWithPassword({ email, password });
    assert.ifError(loginError);
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await context.addInitScript(({ key, session }) => {
      localStorage.setItem(key, JSON.stringify(session));
      localStorage.setItem("dom-cookie-consent", "essential");
    }, { key: `sb-${new URL(supabaseURL).hostname.split(".")[0]}-auth-token`, session: login.session });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    // WebSocket routing installs an init script, so register it before navigation.
    page.setDefaultTimeout(15_000);
    page.setDefaultNavigationTimeout(45_000);
    await page.route(`${baseURL}/api/dominic/ai/status`, (route) => route.fulfill({
      status: 200, contentType: "application/json", body: JSON.stringify({ configured: true, provider: "fixture", model: "fixture" }),
    }));
    const fixtureImage = await readFile(new URL("../public/images/dominic-demo/refinery-aerial-v1.webp", import.meta.url));
    const jpeg = await sharp(fixtureImage).resize({ width: 960 }).jpeg({ quality: 80 }).toBuffer();
    const jpegSize = await sharp(jpeg).metadata();
    let previewSequence = 0;
    let sendingPreview = true;
    let arFixtureEnabled = false;
    let arPositionErrorM = 0.01;
    const previewCommands = [];
    await page.routeWebSocket(/^ws:\/\/127\.0\.0\.1:8787\/?$/, (socket) => {
      const protocol = "dominic.flight-bridge.v1";
      socket.send(JSON.stringify({ type: "hello", protocol, bridgeId: "preview-e2e", adapterVersion: "preview-e2e", vendor: "dji", aircraftId: "preview-aircraft", capabilities: { telemetry: true, cameraPreview: true, photoCapture: false, arm: false, takeoff: false, goTo: false, velocityControl: false, yawControl: false, gimbalControl: false, videoCapture: false, pauseResume: false, returnHome: false, land: false, obstacleSensing: false, rtk: false } }));
      const timer = setInterval(() => {
        if (!sendingPreview) return;
        const id = `browser-preview-${stamp}-${++previewSequence}`;
        // Synthetic calibration/pose verifies overlay rendering and rejection only,
        // not registration of this generated image to a physical refinery.
        const registration = arFixtureEnabled ? {
          coordinateFrameId: "browser-survey-fixture",
          calibration: { id: "synthetic-calibration", aircraftId: "preview-aircraft", model: "rectified-pinhole", width: jpegSize.width, height: jpegSize.height, cameraSource: "wide", zoomRatio: 1, fx: 500, fy: 500, cx: jpegSize.width / 2, cy: jpegSize.height / 2, maxReprojectionErrorPx: 0.5 },
          pose: { timestampMs: Date.now(), cameraPositionM: [0, 0, 0], worldToCameraRotation: [1, 0, 0, 0, 1, 0, 0, 0, 1], positionErrorM: arPositionErrorM, orientationErrorDeg: 0.01 },
          anchors: [{ id: "synthetic-target", label: "Synthetic AR target", coordinateFrameId: "browser-survey-fixture", positionM: [0, 0, 10], positionErrorM: 0.01 }],
        } : undefined;
        socket.send(JSON.stringify({ type: "camera_preview", protocol, sequence: previewSequence, frame: { width: jpegSize.width, height: jpegSize.height, jpegBase64: jpeg.toString("base64"), registration, capture: { id, aircraftId: "preview-aircraft", capturedAtMs: Date.now(), mimeType: "image/jpeg", latitude: 0, longitude: 0, relativeAltitudeFt: 0, headingDeg: 0, gimbalPitchDeg: 0, cameraSource: "wide", zoomRatio: 1, previewFrame: { width: jpegSize.width, height: jpegSize.height, telemetryAvailable: false } } } }));
      }, 500);
      socket.onMessage((raw) => previewCommands.push(JSON.parse(String(raw))));
      previewTimers.add(timer);
      socket.onClose(() => { clearInterval(timer); previewTimers.delete(timer); });
    });
    await page.goto(`${baseURL}/dominic`, { waitUntil: "networkidle", timeout: 45_000 });
    await page.locator('summary[title="Operations"]').click();
    await page.getByRole("button", { name: "DOMINIC HUB", exact: true }).click();
    await page.getByRole("button", { name: "Choose operations project", exact: true }).click();
    await page.getByRole("button").filter({ hasText: "Working reconstruction" }).click();
    await page.getByText("Working reconstruction", { exact: true }).waitFor();
    await page.getByRole("button", { name: "Processing", exact: true }).click();
    await page.getByRole("button", { name: "3D Object", exact: true }).click();
    assert.equal(await page.locator("#mapper-processing-profile").inputValue(), "object_3d");
    // Leaving a project used to unmount it and reset this processing choice.
    await page.getByRole("button", { name: "Assets & inspections", exact: true }).click();
    await page.getByRole("region", { name: "Maintenance work queue" }).waitFor();
    await page.getByRole("button", { name: "Capture plans", exact: true }).click();
    await page.getByRole("textbox", { name: "Capture plan name" }).waitFor();
    await page.screenshot({ path: "/tmp/dom-navigation-desktop.png" });
    assert.equal(await page.getByRole("combobox", { name: "Capture plan project", exact: true }).inputValue(), project.id);
    await page.getByRole("textbox", { name: "Capture plan name" }).fill("Workflow capture plan");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await page.getByText("Capture plan saved.", { exact: true }).waitFor();
    const planResult = await admin.from("dominic_capture_plans").select("*").eq("user_id", user.id).eq("name", "Workflow capture plan").single();
    assert.ifError(planResult.error);
    const savedPlan = planResult.data;
    assert.equal(savedPlan.plan_state.mappingProjectId, project.id);
    const inspectedAsset = await seed("dominic_assets", { user_id: user.id, name: "Workflow tank", asset_type: "tank" });
    const inspection = await seed("dominic_inspections", { user_id: user.id, asset_id: inspectedAsset.id, mapping_project_id: project.id, capture_plan_id: null, inspection_type: "visual", status: "review", objective: "Verify coating condition" });
    const privateBucket = await admin.storage.getBucket("dominic-inspection-evidence");
    assert.ifError(privateBucket.error);
    assert.equal(privateBucket.data.public, false, "inspection evidence must stay private");
    const evidencePath = `${user.id}/dominic-inspections/${inspection.id}/current.webp`;
    const previousPath = `${user.id}/dominic-inspections/${inspection.id}/previous.webp`;
    for (const path of [evidencePath, previousPath]) {
      const uploaded = await admin.storage.from("dominic-inspection-evidence").upload(path, fixtureImage, { contentType: "image/webp" });
      assert.ifError(uploaded.error); inspectionStoragePaths.push(path);
    }
    const anonymousImage = await context.request.get(`${supabaseURL}/storage/v1/object/public/dominic-inspection-evidence/${evidencePath}`);
    assert.ok(anonymousImage.status() >= 400, "private inspection image must reject public downloads");
    const baselineInspection = await seed("dominic_inspections", { user_id: user.id, asset_id: inspectedAsset.id, inspection_type: "visual", status: "complete" });
    const baselineMedia = await seed("dominic_inspection_media", { user_id: user.id, asset_id: inspectedAsset.id, inspection_id: baselineInspection.id, media_type: "image", sensor_mode: "rgb", storage_path: previousPath, original_filename: "previous.webp" });
    const currentMedia = await seed("dominic_inspection_media", { user_id: user.id, asset_id: inspectedAsset.id, inspection_id: inspection.id, media_type: "image", sensor_mode: "rgb", storage_path: evidencePath, original_filename: "current.webp" });
    await seed("dominic_media_screening_jobs", { media_id: currentMedia.id, user_id: user.id, inspection_id: inspection.id, status: "failed", lease_expires_at: new Date(Date.now() - 1000).toISOString(), last_error: "Fixture interrupted screening" });
    const coatingFinding = await seed("dominic_findings", { user_id: user.id, asset_id: inspectedAsset.id, inspection_id: inspection.id, finding_type: "corrosion", title: "Workflow coating wear", severity: "medium", review_status: "needs_review", description: "Inspect the east tank rim.", spatial_anchor: { mediaId: currentMedia.id, imageRegion: { x: .2, y: .2, width: .2, height: .2 } }, detector: { mediaId: currentMedia.id, baselineSourceMediaId: baselineMedia.id, comparisonNote: "Fixture comparison requires review." } });
    const outsider = await admin.auth.admin.createUser({ email: `records-outsider-${stamp}@e2e.dom.invalid`, password, email_confirm: true });
    assert.ifError(outsider.error);
    intruder = outsider.data.user;
    await seed("dominic_capture_plans", { user_id: intruder.id, name: "Private outsider plan", mission_type: "roof", plan_state: { mappingProjectId: project.id } });
    const outsiderAsset = await seed("dominic_assets", { user_id: intruder.id, name: "Private outsider tank", asset_type: "tank" });
    const outsiderInspection = await seed("dominic_inspections", { user_id: intruder.id, asset_id: outsiderAsset.id, mapping_project_id: project.id, capture_plan_id: savedPlan.id, inspection_type: "visual" });
    await seed("dominic_findings", { user_id: intruder.id, asset_id: outsiderAsset.id, inspection_id: outsiderInspection.id, finding_type: "corrosion", title: "Private outsider finding" });
    const ownedRecords = await context.request.get(`${baseURL}/api/pilot/mapping/projects/${project.id}`, { headers: { Authorization: `Bearer ${login.session.access_token}` } });
    assert.equal(ownedRecords.status(), 200);
    const ownedBody = await ownedRecords.json();
    assert.deepEqual(ownedBody.capturePlans.map((item) => item.id), [savedPlan.id]);
    assert.deepEqual(ownedBody.inspections.map((item) => item.id), [inspection.id]);
    assert.equal(ownedBody.findings.length, 1);
    assert.equal(JSON.stringify(ownedBody).includes("Private outsider"), false);
    assert.ifError((await admin.from("dominic_inspections").update({ capture_plan_id: savedPlan.id }).eq("id", inspection.id)).error);
    assert.ifError((await admin.from("dominic_capture_plans").update({ plan_state: { ...savedPlan.plan_state, inspectionId: inspection.id, assetId: inspectedAsset.id, assetName: inspectedAsset.name, inspectionType: "visual" } }).eq("id", savedPlan.id)).error);
    await page.getByRole("button", { name: "Return to current project", exact: true }).click();
    await page.getByRole("button", { name: "Plans & inspections", exact: true }).click();
    const records = page.getByRole("region", { name: "Project plans and inspections", exact: true });
    await records.getByText("Workflow capture plan", { exact: true }).waitFor();
    await records.getByText("Workflow coating wear", { exact: false }).waitFor();
    await page.screenshot({ path: "/tmp/dom-navigation-project-records.png" });
    await records.getByRole("button", { name: "Open capture plan Workflow capture plan", exact: true }).click();
    await page.waitForFunction(() => document.querySelector('[aria-label="Capture plan name"]')?.value === "Workflow capture plan");
    await page.getByRole("button", { name: "Update", exact: true }).click();
    await page.getByText("Capture plan saved.", { exact: true }).waitFor();
    const reloadedPlan = await admin.from("dominic_capture_plans").select("plan_state").eq("id", savedPlan.id).single();
    assert.ifError(reloadedPlan.error);
    assert.equal(reloadedPlan.data.plan_state.inspectionId, inspection.id);
    assert.equal(reloadedPlan.data.plan_state.mappingProjectId, project.id);
    await page.getByRole("button", { name: "DOMINIC HUB", exact: true }).click();
    const hub = page.getByRole("region", { name: "HUB project operations", exact: true });
    await hub.getByRole("heading", { name: "Working reconstruction", exact: true }).waitFor();
    await hub.getByText("Workflow coating wear", { exact: false }).waitFor();
    assert.equal((await hub.textContent()).includes("Private outsider"), false, "HUB must not expose forged cross-account links");
    assert.equal(await page.getByText("512 ppm", { exact: true }).count(), 0, "project operations must not mix in simulated gas readings");
    await page.screenshot({ path: "/tmp/dom-navigation-hub-operations-desktop.png" });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole("navigation", { name: "DOMINIC field navigation", exact: true }).waitFor({ state: "visible" });
    await page.screenshot({ path: "/tmp/dom-navigation-hub-operations-mobile.png" });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), "HUB operations must fit mobile");
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.getByRole("navigation", { name: "DOMINIC field navigation", exact: true }).waitFor({ state: "hidden" });
    const hubProjectURL = `${baseURL}/api/pilot/mapping/projects/${project.id}`;
    await page.route(hubProjectURL, (route) => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Fixture operations unavailable" }) }));
    await hub.getByRole("button", { name: "Refresh project operations", exact: true }).click();
    await hub.getByRole("alert").filter({ hasText: "Fixture operations unavailable" }).waitFor();
    assert.equal(await hub.getByText("Workflow coating wear", { exact: false }).count(), 0, "failed refresh must hide stale operational records");
    await page.unroute(hubProjectURL);
    await hub.getByRole("button", { name: "Refresh project operations", exact: true }).click();
    await hub.getByRole("button", { name: "Review HUB inspection Workflow tank", exact: true }).waitFor();
    await hub.getByRole("button", { name: "Review HUB inspection Workflow tank", exact: true }).click();
    await page.getByRole("combobox", { name: "Project inspection", exact: true }).waitFor();
    assert.equal(await page.getByRole("combobox", { name: "Project inspection", exact: true }).inputValue(), inspection.id);
    await page.getByRole("button", { name: "DOMINIC HUB", exact: true }).click();
    await hub.getByRole("button", { name: "Open HUB live capture Workflow capture plan", exact: true }).click();
    await page.getByRole("button", { name: "Connect Aircraft Bridge", exact: true }).waitFor();
    await page.getByText("Aircraft disconnected", { exact: true }).waitFor();
    assert.equal(await page.getByRole("textbox", { name: "Capture plan name" }).inputValue(), "Workflow capture plan", "Live Flight must retain saved geometry while opening the camera workspace");
    await page.getByRole("button", { name: "Return to current project", exact: true }).click();
    await page.getByRole("button", { name: "Plans & inspections", exact: true }).click();
    await records.getByRole("button", { name: "Review inspection of Workflow tank", exact: true }).click();
    const intelligent = page.getByRole("region", { name: "Intelligent Inspection", exact: true });
    await intelligent.getByRole("combobox", { name: "Project inspection" }).waitFor();
    assert.equal(await intelligent.getByRole("combobox", { name: "Project inspection" }).inputValue(), inspection.id);
    let recoveryRequests = 0;
    const screeningURL = `${baseURL}/api/dominic/inspections/${inspection.id}/analyze-media`;
    await page.route(screeningURL, async (route) => {
      recoveryRequests += 1;
      assert.equal(route.request().postDataJSON().mediaId, currentMedia.id, "retry must reuse saved evidence");
      const claimed = await admin.rpc("claim_dominic_media_screening", { p_media_id: currentMedia.id, p_user_id: user.id });
      assert.ifError(claimed.error); assert.equal(claimed.data.decision, "claimed");
      const finished = await admin.rpc("finish_dominic_media_screening", {
        p_media_id: currentMedia.id, p_user_id: user.id, p_run_id: claimed.data.runId,
        p_summary: { summary: "Controlled recovery result", candidateCount: 0, analyzedAt: new Date().toISOString() }, p_candidates: [],
      });
      assert.ifError(finished.error); assert.equal(finished.data, true);
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ configured: true, candidateCount: 0 }) });
    });
    await intelligent.getByText("Fixture interrupted screening", { exact: true }).waitFor();
    assert.equal(recoveryRequests, 0, "failed work must not retry automatically");
    await intelligent.getByRole("button", { name: "Retry screening", exact: true }).click();
    await intelligent.getByRole("button", { name: "Screened", exact: true }).waitFor();
    assert.equal(await intelligent.getByRole("button", { name: "Screened", exact: true }).isDisabled(), true);
    // Simulate a terminated attempt. Polling must reveal both the active lease
    // and its expiry, with no provider request until the operator retries.
    assert.ifError((await admin.from("dominic_media_screening_jobs").update({ status: "processing", lease_expires_at: new Date(Date.now() + 8000).toISOString() }).eq("media_id", currentMedia.id)).error);
    await intelligent.getByRole("button", { name: "Screening…", exact: true }).waitFor();
    assert.equal(await intelligent.getByRole("button", { name: "Screening…", exact: true }).isDisabled(), true);
    await intelligent.getByRole("button", { name: "Retry interrupted screening", exact: true }).waitFor();
    assert.equal(recoveryRequests, 1, "lease expiry must not enqueue a retry");
    await intelligent.getByRole("button", { name: "Retry interrupted screening", exact: true }).click();
    await intelligent.getByRole("button", { name: "Screened", exact: true }).waitFor();
    assert.equal(recoveryRequests, 2);
    await page.unroute(screeningURL);
    await intelligent.getByRole("button", { name: "Open callout Workflow coating wear", exact: true }).click();
    const callout = page.getByRole("dialog", { name: "Workflow coating wear", exact: true });
    await callout.getByRole("img", { name: "Current inspection evidence", exact: true }).waitFor();
    await callout.getByRole("button", { name: "Overlay previous image", exact: true }).click();
    await callout.getByRole("slider", { name: "Horizontal alignment" }).focus();
    await callout.getByRole("slider", { name: "Horizontal alignment" }).press("ArrowRight");
    await callout.getByRole("textbox", { name: "Note for report" }).fill("Confirm east-rim coating loss before assigning repair.");
    await callout.getByRole("button", { name: "Save report note", exact: true }).click();
    await callout.getByText("Report note saved.", { exact: true }).waitFor();
    const noteResult = await admin.from("dominic_findings").select("detector").eq("id", coatingFinding.id).single();
    assert.ifError(noteResult.error);
    assert.equal(noteResult.data.detector.reportNote, "Confirm east-rim coating loss before assigning repair.");
    assert.equal(noteResult.data.detector.mediaId, currentMedia.id, "saving notes must preserve detection provenance");
    await callout.getByRole("button", { name: "Close callout", exact: true }).click();
    const incoming = await seed("dominic_findings", { user_id: user.id, asset_id: inspectedAsset.id, inspection_id: inspection.id, finding_type: "visual_anomaly", title: "Incoming capture alert", severity: "low", review_status: "needs_review", detector: { mediaId: currentMedia.id }, spatial_anchor: { imageRegion: { x: .6, y: .3, width: .1, height: .1 } } });
    await intelligent.getByRole("button", { name: "Open callout Incoming capture alert", exact: true }).waitFor({ timeout: 12_000 });
    await intelligent.screenshot({ path: "/tmp/dom-navigation-intelligent-inspection.png" });
    const [reportPage] = await Promise.all([context.waitForEvent("page"), intelligent.getByRole("link", { name: "Generate illustrated report" }).click()]);
    await reportPage.getByRole("heading", { name: "Workflow tank — inspection report", exact: true }).waitFor();
    await reportPage.getByText("Confirm east-rim coating loss before assigning repair.", { exact: false }).waitFor();
    await reportPage.waitForFunction(() => [...document.images].length >= 3 && [...document.images].every((image) => image.complete && image.naturalWidth > 0));
    assert.equal(await reportPage.getByRole("button", { name: "Print / Save PDF", exact: true }).isEnabled(), true);
    await reportPage.screenshot({ path: "/tmp/dom-navigation-illustrated-inspection-report.png" });
    const pdf = await reportPage.pdf({ format: "A4", printBackground: true });
    assert.ok(pdf.length > 50_000, "illustrated PDF must include the source images");
    await reportPage.close();
    const outsidersLogin = await createClient(supabaseURL, anonKey, { auth: { persistSession: false } }).auth.signInWithPassword({ email: `records-outsider-${stamp}@e2e.dom.invalid`, password });
    assert.ifError(outsidersLogin.error);
    const privateHeaders = { Authorization: `Bearer ${outsidersLogin.data.session.access_token}` };
    assert.equal((await context.request.get(`${baseURL}/api/dominic/inspections/${inspection.id}/report`, { headers: privateHeaders })).status(), 404);
    assert.equal((await context.request.patch(`${baseURL}/api/dominic/findings/${coatingFinding.id}/report-note`, { headers: privateHeaders, data: { note: "Unauthorized", included: false } })).status(), 404);
    const ownerHeaders = { Authorization: `Bearer ${login.session.access_token}` };
    assert.equal((await context.request.patch(`${baseURL}/api/dominic/findings/${coatingFinding.id}/report-note`, { headers: ownerHeaders, data: { note: "x".repeat(2001), included: true } })).status(), 400);
    assert.equal((await context.request.patch(`${baseURL}/api/dominic/findings/${incoming.id}/report-note`, { headers: ownerHeaders, data: { note: "Exclude provisional alert", included: false } })).status(), 200);
    const hiddenMedia = await seed("dominic_inspection_media", { user_id: user.id, asset_id: inspectedAsset.id, inspection_id: inspection.id, media_type: "image", sensor_mode: "rgb", storage_path: `${intruder.id}/private.webp` });
    await seed("dominic_findings", { user_id: user.id, asset_id: inspectedAsset.id, inspection_id: inspection.id, finding_type: "visual_anomaly", title: "Untrusted evidence reference", severity: "low", review_status: "needs_review", detector: { mediaId: hiddenMedia.id } });
    const safeReport = await context.request.get(`${baseURL}/api/dominic/inspections/${inspection.id}/report`, { headers: ownerHeaders });
    assert.equal(safeReport.status(), 200);
    assert.equal((await safeReport.json()).media.find((item) => item.id === hiddenMedia.id).url, null, "forged foreign storage paths must never be signed");
    await intelligent.getByRole("button", { name: "Open asset & capture setup", exact: true }).click();
    await page.getByRole("button", { name: "Review Evidence", exact: true, pressed: true }).waitFor();
    // Actual browser transport -> private storage -> owned inspection row.
    // The photorealistic fixture is a preview, not a physical aircraft test.
    let screenedPreviewFrames = 0;
    let previewScreeningRequests = 0;
    let holdPreviewScreening = false;
    let releasePreviewScreening;
    let previewScreeningError = false;
    // Controlled model response tests frame -> candidate -> callout. This does
    // not claim to validate model accuracy or physical aircraft imagery.
    await page.route(`${baseURL}/api/dominic/inspections/${inspection.id}/analyze-media`, async (route) => {
      previewScreeningRequests += 1;
      const { mediaId } = route.request().postDataJSON();
      const source = await admin.from("dominic_inspection_media").select("id,metadata,user_id,inspection_id").eq("id", mediaId).single();
      assert.ifError(source.error);
      assert.equal(source.data.user_id, user.id);
      assert.equal(source.data.inspection_id, inspection.id);
      assert.equal(source.data.metadata.source, "camera_preview");
      if (holdPreviewScreening) await new Promise((resolve) => { releasePreviewScreening = resolve; });
      if (previewScreeningError) {
        await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ code: "VISION_NOT_CONFIGURED", error: "Controlled fixture: screening unavailable" }) });
        return;
      }
      const candidate = await seed("dominic_findings", { user_id: user.id, asset_id: inspectedAsset.id, inspection_id: inspection.id, finding_type: "visual_anomaly", title: `Preview fixture anomaly ${++screenedPreviewFrames}`, severity: "medium", review_status: "needs_review", detector: { provider: "controlled-browser-fixture", mediaId }, spatial_anchor: { mediaId, imageRegion: { x: .25, y: .25, width: .2, height: .2 } } });
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ configured: true, mediaId, candidateCount: 1, findings: [candidate] }) });
    });
    const inspectionCard = page.getByText("Verify coating condition", { exact: true }).locator("..").locator("..").filter({ has: page.getByRole("button", { name: "Plan Capture", exact: true }) });
    await inspectionCard.getByRole("button", { name: "Plan Capture", exact: true }).click();
    await page.getByRole("button", { name: "Live Drone", exact: false }).click();
    await page.getByRole("button", { name: "Connect Aircraft Bridge", exact: true }).click();
    try {
      await page.getByText("Camera preview connected", { exact: true }).waitFor({ timeout: 12_000 });
    } catch (error) {
      console.error("Preview connection diagnostic", { sentFrames: previewSequence, alerts: await page.getByRole("alert").allTextContents(), statuses: await page.getByRole("status").allTextContents(), pageErrors: errors });
      await page.screenshot({ path: "/tmp/dom-navigation-live-preview-failure.png" });
      throw error;
    }
    await page.waitForFunction(() => [...document.images].some((img) => img.alt === "Current aircraft camera preview" && img.complete && img.naturalWidth > 0));
    await page.getByRole("checkbox", { name: "Show calibrated AR", exact: true }).check();
    await page.locator('[aria-label="AR registration status"]').waitFor();
    assert.equal(await page.locator('svg[aria-label="Calibrated AR projections"]').count(), 0, "uncalibrated preview must never fabricate AR markers");
    arFixtureEnabled = true;
    await page.getByRole("img", { name: "Calibrated AR projections", exact: true }).waitFor();
    await page.getByText("AR projections available — verify physical alignment", { exact: true }).waitFor();
    await page.screenshot({ path: "/tmp/dom-navigation-calibrated-ar-fixture.png" });
    arPositionErrorM = 3;
    await page.getByRole("img", { name: "Calibrated AR projections", exact: true }).waitFor({ state: "detached" });
    await page.getByText("AR hidden — no anchors meet alignment bounds", { exact: true }).waitFor();
    arFixtureEnabled = false;

    await page.getByRole("button", { name: "Inspect this frame", exact: true }).click();
    await page.getByText("Frame saved. Review its callouts and add report notes.", { exact: true }).waitFor({ timeout: 20_000 });
    const previewRows = await admin.from("dominic_inspection_media").select("*").eq("inspection_id", inspection.id).like("source_capture_id", `browser-preview-${stamp}-%`);
    assert.ifError(previewRows.error);
    assert.equal(previewRows.data.length, 1);
    const savedPreview = previewRows.data[0];
    inspectionStoragePaths.push(savedPreview.storage_path);
    assert.equal(screenedPreviewFrames, 1, "a saved eligible frame must reach the AI screening queue");
    assert.equal(savedPreview.metadata.source, "camera_preview");
    assert.equal(savedPreview.sensor_mode, "rgb");
    assert.equal(savedPreview.latitude, null, "missing GPS must not become an invented zero coordinate");
    assert.equal(savedPreview.metadata.gimbalPitchDeg, null);
    assert.equal(savedPreview.metadata.previewFrame.telemetryAvailable, false);
    const previewImage = await auth.storage.from("dominic-inspection-evidence").download(savedPreview.storage_path);
    assert.ifError(previewImage.error);
    assert.ok(previewImage.data.size > 10_000);
    assert.equal(previewCommands.filter((message) => message.type === "command").length, 0, "preview inspection must not issue shutter or aircraft commands");
    await page.getByRole("button", { name: "Review frames & report", exact: true }).click();
    await page.getByRole("button", { name: "Open callout Preview fixture anomaly 1", exact: true }).click({ timeout: 12_000 });
    const previewCallout = page.getByRole("dialog", { name: "Preview fixture anomaly 1", exact: true });
    await previewCallout.getByRole("img", { name: "Current inspection evidence", exact: true }).waitFor();
    await previewCallout.getByRole("textbox", { name: "Note for report" }).fill("Review this saved camera frame before confirming.");
    await previewCallout.getByRole("button", { name: "Save report note", exact: true }).click();
    await previewCallout.getByText("Report note saved.", { exact: true }).waitFor();
    await previewCallout.getByRole("button", { name: "Close callout", exact: true }).click();
    // Camera images are replaced on every frame; scroll a stable control instead.
    await page.getByRole("checkbox", { name: "Sample for inspection every 30 seconds", exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: "/tmp/dom-navigation-live-inspection-preview.png" });
    await page.getByRole("checkbox", { name: "Sample for inspection every 30 seconds", exact: true }).check();
    const sampleDeadline = Date.now() + 38_000;
    let sampledRows = previewRows.data;
    while (sampledRows.length < 2 && Date.now() < sampleDeadline) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      const sampleQuery = await admin.from("dominic_inspection_media").select("*").eq("inspection_id", inspection.id).like("source_capture_id", `browser-preview-${stamp}-%`);
      assert.ifError(sampleQuery.error);
      sampledRows = sampleQuery.data;
    }
    assert.equal(sampledRows.length, 2, "opt-in sampling must save a subsequent current camera frame");
    await page.getByText("Frame saved. Review its callouts and add report notes.", { exact: true }).waitFor();
    assert.equal(screenedPreviewFrames, 2, "sampling must screen each saved eligible frame");
    inspectionStoragePaths.push(...sampledRows.filter((row) => row.id !== savedPreview.id).map((row) => row.storage_path));
    await page.getByRole("checkbox", { name: "Sample for inspection every 30 seconds", exact: true }).uncheck();
    const cadence = page.getByRole("combobox", { name: "Preview screening cadence", exact: true });
    assert.equal(await cadence.inputValue(), "30", "faster screening must be explicitly selected");
    await cadence.selectOption("5");
    holdPreviewScreening = true;
    const fastSampling = page.getByRole("checkbox", { name: "Sample for inspection every 5 seconds", exact: true });
    await fastSampling.check();
    const fastDeadline = Date.now() + 12_000;
    while (!releasePreviewScreening && Date.now() < fastDeadline) await new Promise((resolve) => setTimeout(resolve, 200));
    assert.equal(typeof releasePreviewScreening, "function", "the 5-second cadence must start a screening job");
    // Keep the provider pending past another interval: neither saves nor jobs may pile up.
    await new Promise((resolve) => setTimeout(resolve, 6500));
    assert.equal(previewScreeningRequests, 3);
    const busyRows = await admin.from("dominic_inspection_media").select("*").eq("inspection_id", inspection.id).like("source_capture_id", `browser-preview-${stamp}-%`);
    assert.ifError(busyRows.error);
    assert.equal(busyRows.data.length, 3, "backpressure must also prevent an evidence-upload backlog");
    await page.getByRole("status", { name: "Automatic preview screening status", exact: true }).filter({ hasText: "Waiting for the current save and screening job" }).waitFor();
    await page.screenshot({ path: "/tmp/dom-navigation-bounded-live-screening.png" });
    await fastSampling.uncheck();
    holdPreviewScreening = false;
    releasePreviewScreening();
    await page.getByText("Frame saved. Review its callouts and add report notes.", { exact: true }).waitFor();
    assert.equal(screenedPreviewFrames, 3);
    previewScreeningError = true;
    await fastSampling.check();
    await page.getByText("Frame saved, but AI screening is not configured. Automatic sampling stopped.", { exact: true }).waitFor({ timeout: 12_000 });
    assert.equal(await fastSampling.isChecked(), false, "provider errors must turn automatic sampling off");
    await new Promise((resolve) => setTimeout(resolve, 6000));
    assert.equal(previewScreeningRequests, 4, "an unavailable provider must not be retried by the sampling timer");
    const finalPreviewRows = await admin.from("dominic_inspection_media").select("*").eq("inspection_id", inspection.id).like("source_capture_id", `browser-preview-${stamp}-%`);
    assert.ifError(finalPreviewRows.error);
    assert.equal(finalPreviewRows.data.length, 4, "the failed screening must retain its saved evidence");
    inspectionStoragePaths.push(...finalPreviewRows.data.filter((row) => !inspectionStoragePaths.includes(row.storage_path)).map((row) => row.storage_path));
    previewScreeningError = false;
    await cadence.selectOption("30");
    await page.getByRole("checkbox", { name: "Sample for inspection every 30 seconds", exact: true }).check();
    sendingPreview = false;
    await page.getByText("Preview paused — frame inspection unavailable", { exact: true }).waitFor({ timeout: 8000 });
    assert.equal(await page.getByRole("button", { name: "Inspect this frame", exact: true }).isDisabled(), true);
    await page.getByRole("status", { name: "Automatic preview screening status", exact: true }).filter({ hasText: "waiting for a current camera frame" }).waitFor();
    assert.equal(previewScreeningRequests, 4, "stale frames must not reach AI screening");
    await page.getByRole("checkbox", { name: "Sample for inspection every 30 seconds", exact: true }).uncheck();
    await page.getByRole("button", { name: "Disconnect Aircraft Bridge", exact: true }).click();
    await page.getByText("Aircraft disconnected", { exact: true }).waitFor();
    await page.getByRole("button", { name: "Assets & inspections", exact: true }).click();
    await page.getByRole("button", { name: "Return to current project", exact: true }).click();
    await page.getByText("Working reconstruction", { exact: true }).waitFor();
    await page.getByRole("button", { name: "Processing", exact: true }).click();
    assert.equal(await page.locator("#mapper-processing-profile").inputValue(), "object_3d");

    // Persisted output records exercise navigation, without claiming that this
    // UI regression test runs NodeODM or flies an aircraft.
    const { error: outputError } = await admin.from("deliverables").insert([
      { job_id: job.id, name: "Workflow orthomosaic", type: "orthomosaic" },
      { job_id: job.id, name: "Workflow 3D model", type: "3d_model" },
    ]);
    assert.ifError(outputError);
    const { error: completedError } = await admin.from("mapping_projects").update({ status: "completed" }).eq("id", project.id);
    assert.ifError(completedError);
    await page.getByRole("button", { name: "Refresh DOMINIC project data" }).click();
    await page.getByRole("button", { name: "Map & 3D", exact: true }).click();
    await page.getByRole("button", { name: "3D View", exact: true }).click();
    await page.getByRole("button", { name: "3D View", exact: true, pressed: true }).waitFor();
    await page.getByRole("button", { name: "3D Model", exact: true, pressed: true }).waitFor();
    await page.getByRole("button", { name: "Map View", exact: true }).click();
    await page.getByRole("button", { name: "Map View", exact: true, pressed: true }).waitFor();
    await page.getByRole("button", { name: "Orthomosaic", exact: true, pressed: true }).waitFor();
    await page.getByRole("button", { name: "3D Model", exact: true, pressed: false }).click();
    await page.getByRole("button", { name: "3D Model", exact: true, pressed: true }).waitFor();
    await page.getByRole("button", { name: "Reports & exports", exact: true }).click();
    await page.waitForFunction(() => {
      const top = document.getElementById("dominic-deliverables")?.getBoundingClientRect().top;
      return top != null && top >= 0 && top < window.innerHeight;
    });
    assert.equal(await page.getByRole("button", { name: "Auto Markup", exact: true }).count(), 0);
    await page.getByRole("button", { name: "Live Flight", exact: true }).click();
    await page.getByRole("button", { name: "Connect Aircraft Bridge", exact: true }).waitFor();
    await page.getByText("Aircraft disconnected", { exact: true }).waitFor();
    assert.equal(await page.getByRole("heading", { name: "Demo refinery inspection", exact: true }).count(), 0);
    assert.equal(await page.getByRole("button", { name: "Next sample frame", exact: true }).count(), 0);
    assert.equal(previewCommands.filter((message) => message.type === "command").length, 0, "opening Live Flight must not issue aircraft commands");
    await page.getByRole("button", { name: "AR View", exact: true }).click();
    assert.equal(await page.getByRole("checkbox", { name: "Show calibrated AR", exact: true }).isChecked(), true);
    await page.getByText("AR hidden — current camera preview required", { exact: true }).waitFor();
    assert.equal(await page.getByRole("img", { name: "Calibrated AR projections", exact: true }).count(), 0);
    assert.equal(previewCommands.filter((message) => message.type === "command").length, 0, "AR workspace must not issue aircraft commands");
    await page.getByRole("navigation", { name: "DOMINIC navigation", exact: true }).getByRole("button", { name: "AI Copilot", exact: true }).click();
    const copilot = page.getByRole("region", { name: "AI Inspection Copilot", exact: true });
    await copilot.getByRole("heading", { name: "Evidence-based next actions", exact: true }).waitFor();
    await copilot.getByRole("combobox", { name: "Project inspection", exact: true }).selectOption(inspection.id);
    await copilot.getByRole("button", { name: "Review candidate Preview fixture anomaly 1", exact: true }).click();
    const copilotCallout = copilot.getByRole("dialog", { name: "Preview fixture anomaly 1", exact: true });
    await copilotCallout.getByRole("img", { name: "Current inspection evidence", exact: true }).waitFor();
    assert.equal(await page.getByRole("button", { name: "Add to sample checklist", exact: true }).count(), 0);
    assert.equal(previewCommands.filter((message) => message.type === "command").length, 0, "Copilot review must not issue aircraft commands");
    await copilotCallout.getByRole("button", { name: "Close callout", exact: true }).click();
    await page.screenshot({ path: "/tmp/dom-navigation-simulation-desktop.png" });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole("navigation", { name: "DOMINIC field navigation", exact: true }).waitFor({ state: "visible" });
    await page.getByRole("navigation", { name: "DOMINIC field navigation", exact: true }).getByRole("button", { name: "AI Copilot", exact: true }).click();
    await copilot.getByRole("heading", { name: "Evidence-based next actions", exact: true }).waitFor();
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), "Copilot must fit the mobile viewport");
    await page.screenshot({ path: "/tmp/dom-navigation-copilot-mobile.png" });
    await page.getByRole("button", { name: "Photos", exact: true }).click();
    await page.locator("#dominic-source-imagery").waitFor({ state: "visible" });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), "project UI must fit the mobile viewport");
    await page.screenshot({ path: "/tmp/dom-navigation-mobile.png" });
    await page.getByRole("button", { name: "Capture plans", exact: true }).click();
    await page.getByRole("textbox", { name: "Capture plan name" }).waitFor();
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), "planner UI must fit the mobile viewport");
    await page.screenshot({ path: "/tmp/dom-navigation-mobile-planner.png" });
    await page.getByRole("button", { name: "Live Flight", exact: true }).click();
    await page.getByRole("button", { name: "Connect Aircraft Bridge", exact: true }).waitFor();
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), "Live Flight UI must fit the mobile viewport");
    await page.screenshot({ path: "/tmp/dom-navigation-simulation-mobile.png" });
    const fieldDock = page.getByRole("navigation", { name: "DOMINIC field navigation", exact: true });
    const modules = page.getByRole("dialog", { name: "All DOMINIC modules", exact: true });
    const previousOverflow = await page.evaluate(() => document.body.style.overflow);
    await fieldDock.getByRole("button", { name: "All modules", exact: true }).click();
    await modules.waitFor();
    await modules.getByRole("button", { name: "DOMINIC HUB", exact: true }).waitFor();
    await modules.getByRole("button", { name: "AR View", exact: true }).waitFor();
    await modules.getByRole("button", { name: "Plans & inspections", exact: true }).waitFor();
    await modules.getByRole("button", { name: "Close module menu", exact: true }).focus();
    await page.keyboard.press("Shift+Tab");
    assert.equal(await modules.getByRole("button", { name: "DOMINIC HUB", exact: true }).evaluate((element) => element === document.activeElement), true, "reverse Tab must wrap to the last module");
    for (let index = 0; index < 16; index++) {
      await page.keyboard.press("Tab");
      assert.ok(await page.evaluate(() => document.activeElement?.closest("dialog")?.open === true), "module menu must keep keyboard focus inside the modal");
    }
    await page.keyboard.press("Escape");
    await modules.waitFor({ state: "hidden" });
    assert.equal(await page.locator(":focus").getAttribute("aria-label"), "All modules", "Escape must restore focus to the menu trigger");
    assert.equal(await page.evaluate(() => document.body.style.overflow), previousOverflow);
    await fieldDock.getByRole("button", { name: "All modules", exact: true }).click();
    await modules.getByRole("button", { name: "AR View", exact: true }).click();
    await modules.waitFor({ state: "hidden" });
    await page.getByRole("checkbox", { name: "Show calibrated AR", exact: true }).waitFor();
    assert.equal(await page.getByRole("checkbox", { name: "Show calibrated AR", exact: true }).isChecked(), true);
    await fieldDock.getByRole("button", { name: "All modules", exact: true }).click();
    await modules.getByRole("button", { name: "DOMINIC HUB", exact: true }).click();
    await hub.getByRole("heading", { name: "Working reconstruction", exact: true }).waitFor();
    await hub.getByRole("button", { name: "Open HUB live capture Workflow capture plan", exact: true }).click();
    await page.waitForFunction(() => document.querySelector('[aria-label="Capture plan name"]')?.value === "Workflow capture plan");
    assert.equal(previewCommands.filter((message) => message.type === "command").length, 0, "mobile module navigation must not issue aircraft commands");
    await page.setViewportSize({ width: 320, height: 640 });
    await fieldDock.getByRole("button", { name: "All modules", exact: true }).click();
    await page.screenshot({ path: "/tmp/dom-navigation-all-modules-small-mobile.png" });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), "module menu must fit a 320px viewport");
    await modules.getByRole("button", { name: "Close module menu", exact: true }).click();
    await modules.waitFor({ state: "hidden" });
    assert.equal(await page.evaluate(() => document.body.style.overflow), previousOverflow);
    // Removing the mobile menu on rotation must also release its scroll lock.
    await fieldDock.getByRole("button", { name: "All modules", exact: true }).click();
    await page.setViewportSize({ width: 1440, height: 1000 });
    await modules.waitFor({ state: "detached" });
    assert.equal(await page.evaluate(() => document.body.style.overflow), previousOverflow);
    // The same menu must apply existing licensing and project-selection gates.
    assert.ifError((await admin.from("dominic_profiles").update({ plan: "free" }).eq("user_id", user.id)).error);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${baseURL}/dominic`, { waitUntil: "networkidle" });
    await fieldDock.getByRole("button", { name: "All modules", exact: true }).click();
    assert.equal(await modules.getByRole("button", { name: "Plans & inspections", exact: true }).count(), 0, "project-only modules require a selected project");
    await modules.getByRole("button", { name: "DOMINIC HUB", exact: true }).click();
    await page.waitForURL("**/dominic/licensing", { timeout: 15_000 });
    assert.deepEqual(errors, []);
  } finally {
    for (const timer of previewTimers) clearInterval(timer);
    await browser?.close();
    if (job) await admin.from("deliverables").delete().eq("job_id", job.id);
    if (intruder) {
      await admin.from("dominic_findings").delete().eq("user_id", intruder.id);
      await admin.from("dominic_inspections").delete().eq("user_id", intruder.id);
      await admin.from("dominic_assets").delete().eq("user_id", intruder.id);
      await admin.from("dominic_capture_plans").delete().eq("user_id", intruder.id);
      await admin.auth.admin.deleteUser(intruder.id);
    }
    if (inspectionStoragePaths.length) await admin.storage.from("dominic-inspection-evidence").remove(inspectionStoragePaths);
    await admin.from("dominic_findings").delete().eq("user_id", user.id);
    await admin.from("dominic_inspection_media").delete().eq("user_id", user.id);
    await admin.from("dominic_inspections").delete().eq("user_id", user.id);
    await admin.from("dominic_assets").delete().eq("user_id", user.id);
    await admin.from("dominic_capture_plans").delete().eq("user_id", user.id);
    if (project) await admin.from("mapping_projects").delete().eq("id", project.id);
    if (job) await admin.from("jobs").delete().eq("id", job.id);
    if (mission) await admin.from("mission_requests").delete().eq("id", mission.id);
    await admin.from("dominic_profiles").delete().eq("user_id", user.id);
    if (contractor) await admin.from("contractors").delete().eq("id", contractor.id);
    await admin.auth.admin.deleteUser(user.id);
  }
});


test("DOMINIC screening claims recover safely without duplicate findings or cross-owner access", { skip: !isolated, timeout: 90_000 }, async () => {
  assert.ok(supabaseURL && anonKey && serviceKey);
  assert.match(supabaseURL, /^https?:\/\/(127\.0\.0\.1|localhost)(:|\/)/);
  const admin = createClient(supabaseURL, serviceKey, { auth: { persistSession: false } });
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const password = `Screening-${stamp}!Aa1`;
  const users = [];
  let asset, inspection;
  const seed = async (table, row) => {
    const result = await admin.from(table).insert(row).select("*").single();
    assert.ifError(result.error); return result.data;
  };
  try {
    const clients = [];
    for (const role of ["owner", "outsider"]) {
      const email = `screening-${role}-${stamp}@e2e.dom.invalid`;
      const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
      assert.ifError(created.error); users.push(created.data.user);
      const client = createClient(supabaseURL, anonKey, { auth: { persistSession: false } });
      const login = await client.auth.signInWithPassword({ email, password });
      assert.ifError(login.error); clients.push({ client, token: login.data.session.access_token });
    }
    const owner = users[0];
    asset = await seed("dominic_assets", { user_id: owner.id, name: "Recovery tank", asset_type: "tank" });
    inspection = await seed("dominic_inspections", { user_id: owner.id, asset_id: asset.id, inspection_type: "visual", ai_summary: { issueId: "preserved-context" } });
    const media = await seed("dominic_inspection_media", { user_id: owner.id, asset_id: asset.id, inspection_id: inspection.id, sensor_mode: "rgb", media_type: "image", storage_path: `${owner.id}/dominic-inspections/${inspection.id}/recovery.jpg` });
    const args = { p_media_id: media.id, p_user_id: owner.id };
    const claims = await Promise.all(Array.from({ length: 8 }, () => admin.rpc("claim_dominic_media_screening", args)));
    claims.forEach((result) => assert.ifError(result.error));
    assert.equal(claims.filter((result) => result.data.decision === "claimed").length, 1);
    assert.equal(claims.filter((result) => result.data.decision === "busy").length, 7);
    const first = claims.find((result) => result.data.decision === "claimed").data;
    const api = async (token) => {
      const response = await fetch(`${baseURL}/api/dominic/inspections/${inspection.id}/analyze-media`, {
        method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ mediaId: media.id }),
      });
      return { status: response.status, body: await response.json() };
    };
    assert.equal((await api(clients[0].token)).status, 409, "active claims must be visible before provider configuration");
    assert.equal((await api(clients[1].token)).status, 404);
    assert.ok((await clients[0].client.rpc("claim_dominic_media_screening", args)).error, "owners cannot claim jobs directly");
    assert.ok((await createClient(supabaseURL, anonKey).rpc("claim_dominic_media_screening", args)).error, "anonymous claims must be denied");
    assert.equal((await clients[0].client.from("dominic_media_screening_jobs").select("media_id")).data.length, 1);
    assert.deepEqual((await clients[1].client.from("dominic_media_screening_jobs").select("media_id")).data, []);
    assert.ok((await clients[0].client.from("dominic_media_screening_jobs").update({ status: "succeeded" }).eq("media_id", media.id)).error, "client writes cannot bypass the lease");
    assert.ok((await admin.rpc("claim_dominic_media_screening", { ...args, p_user_id: users[1].id })).error);
    assert.ifError((await admin.from("dominic_media_screening_jobs").update({ lease_expires_at: new Date(Date.now() - 10_000).toISOString() }).eq("media_id", media.id)).error);
    const retry = await admin.rpc("claim_dominic_media_screening", args);
    assert.ifError(retry.error); assert.equal(retry.data.decision, "claimed"); assert.equal(retry.data.attemptCount, 2);
    assert.notEqual(retry.data.runId, first.runId);
    const summary = { summary: "Saved screening", candidateCount: 1, analyzedAt: new Date().toISOString() };
    const candidates = [{ finding_type: "visual_anomaly", title: "Recovery candidate", description: "Review image", severity: "medium", confidence: .8, fingerprint: `vision:${media.id}:recovery`, spatial_anchor: { mediaId: media.id }, detector: { mediaId: media.id } }];
    const finish = (runId, extra = {}) => admin.rpc("finish_dominic_media_screening", { ...args, p_run_id: runId, p_summary: summary, p_candidates: candidates, ...extra });
    const obsolete = await finish(first.runId); assert.ifError(obsolete.error); assert.equal(obsolete.data, false);
    assert.equal((await admin.from("dominic_findings").select("id").eq("inspection_id", inspection.id)).data.length, 0);
    // Invalid final writes must roll back findings, media, inspection, and job together.
    assert.ok((await finish(retry.data.runId, { p_candidates: [{ ...candidates[0], severity: "invalid" }] })).error);
    assert.equal((await admin.from("dominic_media_screening_jobs").select("status").eq("media_id", media.id).single()).data.status, "processing");
    const finished = await finish(retry.data.runId, { p_candidates: [candidates[0], candidates[0]] }); assert.ifError(finished.error); assert.equal(finished.data, true);
    const repeatedFinish = await finish(retry.data.runId); assert.ifError(repeatedFinish.error); assert.equal(repeatedFinish.data, false);
    const findings = await admin.from("dominic_findings").select("id").eq("inspection_id", inspection.id);
    assert.ifError(findings.error); assert.equal(findings.data.length, 1);
    const inspected = await admin.from("dominic_inspections").select("status,ai_summary").eq("id", inspection.id).single();
    assert.equal(inspected.data.status, "review"); assert.equal(inspected.data.ai_summary.issueId, "preserved-context");
    assert.equal((await admin.from("dominic_inspection_media").select("analysis_status").eq("id", media.id).single()).data.analysis_status, "review");
    assert.ifError((await admin.from("dominic_findings").update({ review_status: "confirmed" }).eq("id", findings.data[0].id)).error);
    const cached = await api(clients[0].token);
    assert.equal(cached.status, 200); assert.equal(cached.body.cached, true); assert.deepEqual(cached.body.findings, [], "cached results must preserve human decisions");
    assert.equal((await admin.rpc("claim_dominic_media_screening", args)).data.decision, "cached");
    const second = await seed("dominic_inspection_media", { user_id: owner.id, asset_id: asset.id, inspection_id: inspection.id, sensor_mode: "rgb", media_type: "image" });
    const secondArgs = { p_media_id: second.id, p_user_id: owner.id };
    const secondClaim = await admin.rpc("claim_dominic_media_screening", secondArgs);
    assert.ifError(secondClaim.error);
    const failed = await admin.rpc("finish_dominic_media_screening", { ...secondArgs, p_run_id: secondClaim.data.runId, p_summary: { error: "Provider unavailable" }, p_candidates: [], p_error: "Provider unavailable" });
    assert.ifError(failed.error); assert.equal(failed.data, true);
    assert.equal((await admin.from("dominic_inspection_media").select("analysis_status").eq("id", second.id).single()).data.analysis_status, "failed");
    const failedRetry = await admin.rpc("claim_dominic_media_screening", secondArgs);
    assert.ifError(failedRetry.error); assert.equal(failedRetry.data.attemptCount, 2);
    assert.ok((await clients[0].client.rpc("finish_dominic_media_screening", { ...secondArgs, p_run_id: failedRetry.data.runId, p_summary: {}, p_candidates: [] })).error);
  } finally {
    if (inspection) {
      await admin.from("dominic_findings").delete().eq("inspection_id", inspection.id);
      await admin.from("dominic_inspection_media").delete().eq("inspection_id", inspection.id);
      await admin.from("dominic_inspections").delete().eq("id", inspection.id);
    }
    if (asset) await admin.from("dominic_assets").delete().eq("id", asset.id);
    for (const user of users) await admin.auth.admin.deleteUser(user.id);
  }
});

test("DOMINIC live findings survive returning to a saved inspection and retain older urgent work", { skip: !isolated, timeout: 120_000 }, async () => {
  assert.ok(supabaseURL && anonKey && serviceKey);
  assert.match(supabaseURL, /^https?:\/\/(127\.0\.0\.1|localhost)(:|\/)/);
  const admin = createClient(supabaseURL, serviceKey, { auth: { persistSession: false } });
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const password = `Feed-${stamp}!Aa1`;
  const users = [];
  let browser, contractor, mission, job, project;
  const seed = async (table, row) => {
    const result = await admin.from(table).insert(row).select("*").single();
    assert.ifError(result.error); return result.data;
  };
  try {
    for (const role of ["owner", "outsider"]) {
      const result = await admin.auth.admin.createUser({ email: `feed-${role}-${stamp}@e2e.dom.invalid`, password, email_confirm: true });
      assert.ifError(result.error); users.push(result.data.user);
    }
    const owner = users[0];
    contractor = await seed("contractors", { user_id: owner.id, full_name: "Feed operator", email: owner.email, status: "active" });
    await seed("dominic_profiles", { user_id: owner.id, plan: "organization", status: "active" });
    mission = await seed("mission_requests", { requester_name: "Feed client", requester_email: owner.email, service_type: "aerial_images", location: "Feed site", status: "approved" });
    job = await seed("jobs", { mission_request_id: mission.id, title: "Feed mission", service_type: "aerial_images", location: "Feed site", status: "scheduled" });
    project = await seed("mapping_projects", { job_id: job.id, contractor_id: contractor.id, name: "Feed project", status: "uploaded", image_count: 20 });
    const auth = createClient(supabaseURL, anonKey, { auth: { persistSession: false } });
    const login = await auth.auth.signInWithPassword({ email: owner.email, password });
    assert.ifError(login.error);
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await context.addInitScript(({ key, session }) => {
      localStorage.setItem(key, JSON.stringify(session)); localStorage.setItem("dom-cookie-consent", "essential");
      // Controller browsers may have AbortController without newer static helpers.
      Object.defineProperty(AbortSignal, "any", { configurable: true, value: undefined });
      Object.defineProperty(AbortSignal, "timeout", { configurable: true, value: undefined });
    }, { key: `sb-${new URL(supabaseURL).hostname.split(".")[0]}-auth-token`, session: login.data.session });
    const page = await context.newPage();
    page.setDefaultTimeout(15_000); page.setDefaultNavigationTimeout(45_000);
    const errors = [];
    let screeningRequests = 0, findingRequests = 0;
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("request", (req) => {
      if (/\/analyze-media$/.test(req.url())) screeningRequests += 1;
      if (/\/rest\/v1\/dominic_findings(?:\?|$)/.test(req.url())) findingRequests += 1;
    });
    const openHub = async () => {
      const button = page.getByRole("navigation", { name: "DOMINIC navigation", exact: true }).getByRole("button", { name: "DOMINIC HUB", exact: true });
      if (!await button.isVisible()) await page.locator('summary[title="Operations"]').click();
      await button.click();
    };
    const chooseProject = async () => {
      await openHub();
      await page.getByRole("button", { name: "Choose operations project", exact: true }).click();
      await page.getByRole("button").filter({ hasText: "Feed project" }).click();
    };
    await page.goto(`${baseURL}/dominic`, { waitUntil: "networkidle" });
    await chooseProject();
    await page.getByRole("button", { name: "Capture plans", exact: true }).click();
    await page.getByRole("textbox", { name: "Capture plan name", exact: true }).fill("Feed capture plan");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await page.getByText("Capture plan saved.", { exact: true }).waitFor();
    const saved = await admin.from("dominic_capture_plans").select("*").eq("user_id", owner.id).eq("name", "Feed capture plan").single();
    assert.ifError(saved.error);
    const asset = await seed("dominic_assets", { user_id: owner.id, name: "Feed tank", asset_type: "tank" });
    const inspection = await seed("dominic_inspections", { user_id: owner.id, asset_id: asset.id, mapping_project_id: project.id, capture_plan_id: saved.data.id, inspection_type: "visual", sensor_modes: ["rgb"], status: "review" });
    const planState = { ...saved.data.plan_state, mappingProjectId: project.id, inspectionId: inspection.id, assetId: asset.id, assetName: asset.name, inspectionType: "visual" };
    assert.ifError((await admin.from("dominic_capture_plans").update({ plan_state: planState }).eq("id", saved.data.id)).error);
    const common = { user_id: owner.id, asset_id: asset.id, inspection_id: inspection.id, finding_type: "visual_anomaly", review_status: "needs_review" };
    const critical = await seed("dominic_findings", { ...common, title: "Older critical candidate", severity: "critical", observed_at: "2001-01-01T00:00:00Z" });
    await seed("dominic_findings", { ...common, title: "Older high candidate", severity: "high", observed_at: "2002-01-01T00:00:00Z" });
    assert.ifError((await admin.from("dominic_findings").insert(Array.from({ length: 18 }, (_, i) => ({ ...common, title: `Recent candidate ${i}`, severity: "low" })))).error);
    const privateAsset = await seed("dominic_assets", { user_id: users[1].id, name: "Private outsider asset", asset_type: "tank" });
    const privateInspection = await seed("dominic_inspections", { user_id: users[1].id, asset_id: privateAsset.id, inspection_type: "visual" });
    await seed("dominic_findings", { user_id: users[1].id, asset_id: privateAsset.id, inspection_id: privateInspection.id, finding_type: "visual_anomaly", severity: "critical", review_status: "needs_review", title: "Private outsider candidate" });
    await seed("dominic_capture_plans", { user_id: owner.id, name: "Forged inspection link", mission_type: saved.data.mission_type, plan_state: { ...planState, inspectionId: privateInspection.id, assetId: privateAsset.id, assetName: "Untrusted cached asset" } });
    const feed = page.getByRole("region", { name: "Live inspection findings", exact: true });
    const openPlan = async (name) => {
      await openHub();
      await page.getByRole("region", { name: "HUB project operations", exact: true }).getByRole("button", { name: `Open HUB live capture ${name}`, exact: true }).click();
    };
    await openPlan("Feed capture plan");
    await feed.getByText("20 NEED REVIEW", { exact: true }).waitFor();
    assert.equal(await feed.getByRole("article").count(), 12);
    assert.equal(await feed.getByRole("article").nth(0).getAttribute("aria-label"), "Older critical candidate");
    assert.equal(await feed.getByRole("article").nth(1).getAttribute("aria-label"), "Older high candidate");
    assert.equal((await feed.textContent()).includes("Private outsider"), false);
    assert.equal(await page.getByRole("button", { name: "Review frames & report", exact: true }).isEnabled(), true, "owned saved plans must restore the inspection link");
    assert.equal(await page.getByRole("textbox", { name: "Capture plan name", exact: true }).inputValue(), "Feed capture plan", "restoring inspection context must preserve saved geometry and name");
    await page.reload({ waitUntil: "networkidle" });
    await chooseProject(); await openPlan("Feed capture plan");
    await feed.getByText("20 NEED REVIEW", { exact: true }).waitFor();
    await feed.getByRole("article", { name: "Older critical candidate", exact: true }).waitFor();
    assert.ifError((await admin.from("dominic_findings").update({ review_status: "dismissed" }).eq("id", critical.id)).error);
    await feed.getByText("19 NEED REVIEW", { exact: true }).waitFor();
    assert.equal(await feed.getByRole("article", { name: "Older critical candidate", exact: true }).count(), 0, "reviews made elsewhere must remove stale candidates");
    await feed.getByRole("article", { name: "Older high candidate", exact: true }).getByRole("button", { name: "Dismiss", exact: true }).click();
    await feed.getByText("18 NEED REVIEW", { exact: true }).waitFor();
    const findingURL = /\/rest\/v1\/dominic_findings(?:\?|$)/;
    await page.route(findingURL, (route) => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ message: "Fixture findings unavailable" }) }));
    await feed.getByRole("button", { name: "Refresh findings", exact: true }).click();
    await feed.getByRole("alert").filter({ hasText: "Saved findings could not be refreshed" }).waitFor();
    assert.equal(await feed.getByRole("article").count(), 0, "failed refreshes must hide stale review controls");
    await feed.getByText("REVIEW COUNT UNAVAILABLE", { exact: true }).waitFor();
    await page.unroute(findingURL); await feed.getByRole("button", { name: "Refresh findings", exact: true }).click();
    await feed.getByText("18 NEED REVIEW", { exact: true }).waitFor();
    await context.setOffline(true);
    await feed.getByRole("alert").filter({ hasText: "Offline" }).waitFor();
    await context.setOffline(false);
    await feed.getByText("18 NEED REVIEW", { exact: true }).waitFor();
    await page.evaluate(() => { Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" }); document.dispatchEvent(new Event("visibilitychange")); });
    const beforeHidden = findingRequests;
    await new Promise((resolve) => setTimeout(resolve, 4000));
    assert.equal(findingRequests, beforeHidden, "hidden tabs must not poll the findings database");
    await page.evaluate(() => { Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" }); document.dispatchEvent(new Event("visibilitychange")); });
    await feed.getByText("18 NEED REVIEW", { exact: true }).waitFor();
    await feed.screenshot({ path: "/tmp/dom-navigation-persisted-live-findings-desktop.png" });
    await page.setViewportSize({ width: 390, height: 844 });
    await feed.screenshot({ path: "/tmp/dom-navigation-persisted-live-findings-mobile.png" });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
    await page.setViewportSize({ width: 1440, height: 1000 });
    // Wait for desktop layout to finish before inspecting the Operations menu;
    // compact mode collapses the sidebar and leaves its menu state intact.
    await page.getByRole("button", { name: "Expand DOMINIC sidebar", exact: true }).click();
    await openPlan("Forged inspection link");
    await page.getByRole("alert").filter({ hasText: "The saved inspection link is unavailable" }).waitFor();
    assert.equal(await feed.count(), 0);
    assert.equal(await page.getByRole("button", { name: "Review frames & report", exact: true }).isDisabled(), true);
    assert.equal((await page.textContent("body")).includes("Private outsider candidate"), false);
    assert.equal(screeningRequests, 0, "loading and reviewing saved findings must not create AI screening jobs");
    assert.deepEqual(errors, []);
  } finally {
    if (browser) await browser.close();
    const ids = users.map((user) => user.id);
    if (ids.length) {
      await admin.from("dominic_findings").delete().in("user_id", ids);
      await admin.from("dominic_inspections").delete().in("user_id", ids);
      await admin.from("dominic_assets").delete().in("user_id", ids);
      await admin.from("dominic_capture_plans").delete().in("user_id", ids);
    }
    if (project) await admin.from("mapping_projects").delete().eq("id", project.id);
    if (job) await admin.from("jobs").delete().eq("id", job.id);
    if (mission) await admin.from("mission_requests").delete().eq("id", mission.id);
    if (contractor) await admin.from("contractors").delete().eq("id", contractor.id);
    for (const user of users) await admin.auth.admin.deleteUser(user.id);
  }
});

test("DOMINIC reports and paged review include findings beyond the row limit and keep evidence private", { skip: !isolated, timeout: 180_000 }, async () => {
  assert.ok(supabaseURL && anonKey && serviceKey);
  assert.match(supabaseURL, /^https?:\/\/(127\.0\.0\.1|localhost)(:|\/)/);
  assert.match(baseURL, /^https?:\/\/(127\.0\.0\.1|localhost)(:|\/|$)/);
  const admin = createClient(supabaseURL, serviceKey, { auth: { persistSession: false } });
  const { randomUUID } = await import("node:crypto");
  const stamp = `${Date.now()}-${randomUUID().slice(0, 8)}`;
  const password = `Dom-Report-${stamp}!Aa1`;
  const users = [];
  let browser;
  let reviewMission, reviewJob, reviewProject, reviewContractor;
  const storagePaths = [];
  try {
    for (const name of ["owner", "outsider"]) {
      const { data, error } = await admin.auth.admin.createUser({ email: `report-${name}-${stamp}@e2e.dom.invalid`, password, email_confirm: true });
      assert.ifError(error); users.push(data.user);
    }
    const seed = async (table, row) => {
      const { data, error } = await admin.from(table).insert(row).select("*").single();
      assert.ifError(error); return data;
    };
    const asset = await seed("dominic_assets", { user_id: users[0].id, name: "Large inspection tank", asset_type: "storage_tank" });
    const inspection = await seed("dominic_inspections", { user_id: users[0].id, asset_id: asset.id, inspection_type: "visual", sensor_modes: ["rgb"], objective: "Review recorded RGB evidence", status: "review" });
    const prior = await seed("dominic_inspections", { user_id: users[0].id, asset_id: asset.id, inspection_type: "visual", sensor_modes: ["rgb"] });
    const foreignAsset = await seed("dominic_assets", { user_id: users[1].id, name: "Private outsider tank", asset_type: "storage_tank" });
    const foreignInspection = await seed("dominic_inspections", { user_id: users[1].id, asset_id: foreignAsset.id, inspection_type: "visual" });
    const foreignMedia = await seed("dominic_inspection_media", { user_id: users[1].id, asset_id: foreignAsset.id, inspection_id: foreignInspection.id, media_type: "image", sensor_mode: "rgb", storage_path: `${users[1].id}/private-report.webp` });
    const image = await readFile(new URL("../public/images/dominic-demo/refinery-aerial-v1.webp", import.meta.url));
    for (const filename of ["current-report.webp", "previous-report.webp"]) {
      const path = `${users[0].id}/${filename}`;
      const { error } = await admin.storage.from("dominic-inspection-evidence").upload(path, image, { contentType: "image/webp" });
      assert.ifError(error); storagePaths.push(path);
    }
    const baseline = await seed("dominic_inspection_media", { user_id: users[0].id, asset_id: asset.id, inspection_id: prior.id, media_type: "image", sensor_mode: "rgb", storage_path: storagePaths[1] });
    const prefix = randomUUID().slice(0, 24);
    const media = Array.from({ length: 1005 }, (_, index) => ({ id: `${prefix}${String(index).padStart(12, "0")}`, user_id: users[0].id, asset_id: asset.id, inspection_id: inspection.id, media_type: "image", sensor_mode: "rgb", storage_path: index === 1004 ? storagePaths[0] : null }));
    const findings = media.map((item, index) => ({
      id: item.id, user_id: users[0].id, asset_id: asset.id, inspection_id: inspection.id, finding_type: "visual_anomaly",
      title: index === 1004 ? "Old critical roof defect" : index === 1003 ? "Old high-priority seam candidate" : `Report candidate ${index}`,
      severity: index === 1004 ? "critical" : index === 1003 ? "high" : "low",
      review_status: index < 3 || index === 1004 ? "confirmed" : "needs_review", sensor_mode: "rgb",
      observed_at: index >= 1003 ? "2001-01-01T00:00:00Z" : "2026-01-01T00:00:00Z",
      detector: index === 1004 ? { mediaId: item.id } : index === 0 ? { mediaId: foreignMedia.id, baselineSourceMediaId: foreignMedia.id } : index === 1 ? { baselineSourceMediaId: baseline.id } : {},
    }));
    for (let start = 0; start < media.length; start += 500) {
      assert.ifError((await admin.from("dominic_inspection_media").insert(media.slice(start, start + 500))).error);
      assert.ifError((await admin.from("dominic_findings").insert(findings.slice(start, start + 500))).error);
    }
    for (const [title, review_status, detector] of [["Dismissed critical finding", "dismissed", {}], ["Excluded critical finding", "confirmed", { reportIncluded: false }], ["Excluded candidate", "needs_review", { reportIncluded: false, mediaId: media[1004].id }]]) {
      await seed("dominic_findings", { user_id: users[0].id, asset_id: asset.id, inspection_id: inspection.id, finding_type: "visual_anomaly", title, severity: "critical", review_status, detector });
    }
    await seed("dominic_findings", { user_id: users[1].id, asset_id: foreignAsset.id, inspection_id: foreignInspection.id, finding_type: "visual_anomaly", title: "Outsider private critical defect", severity: "critical", review_status: "needs_review" });
    const auth = createClient(supabaseURL, anonKey, { auth: { persistSession: false } });
    const { data: login, error: loginError } = await auth.auth.signInWithPassword({ email: users[0].email, password });
    assert.ifError(loginError);
    const api = await request.newContext();
    try {
      const url = `${baseURL}/api/dominic/inspections/${inspection.id}/report`;
      assert.equal((await api.get(url)).status(), 401);
      const response = await api.get(url, { headers: { Authorization: `Bearer ${login.session.access_token}` } });
      assert.equal(response.status(), 200);
      assert.equal(response.headers()["cache-control"], "private, no-store");
      const body = await response.json();
      assert.equal(body.findings.length, 1008, "report must not stop at the default 1000-row response limit");
      assert.equal(new Set(body.findings.map((row) => row.id)).size, 1008);
      assert.ok(body.findings.some((row) => row.id === findings[1004].id));
      assert.deepEqual(body.media.map((row) => row.id), [media[1004].id], "only included, owned source evidence should be signed");
      assert.ok(body.media[0].url);
      assert.deepEqual(body.baselineMedia.map((row) => row.id), [baseline.id]);
      assert.ok(body.baselineMedia[0].url);
      const outsider = await createClient(supabaseURL, anonKey, { auth: { persistSession: false } }).auth.signInWithPassword({ email: users[1].email, password });
      assert.ifError(outsider.error);
      assert.equal((await api.get(url, { headers: { Authorization: `Bearer ${outsider.data.session.access_token}` } })).status(), 404);
      const reviewURL = `${baseURL}/api/dominic/inspections/${inspection.id}/review`;
      const headers = { Authorization: `Bearer ${login.session.access_token}` };
      assert.equal((await api.get(reviewURL)).status(), 401);
      assert.equal((await api.get(reviewURL, { headers: { Authorization: `Bearer ${outsider.data.session.access_token}` } })).status(), 404);
      const firstPageResponse = await api.get(reviewURL, { headers });
      assert.equal(firstPageResponse.status(), 200);
      assert.equal(firstPageResponse.headers()["cache-control"], "private, no-store");
      const firstPage = await firstPageResponse.json();
      assert.equal(firstPage.mediaTotal, 1005); assert.equal(firstPage.findingTotal, 1008);
      assert.equal(firstPage.needsReview, 1002); assert.equal(firstPage.confirmedTotal, 5);
      assert.equal(firstPage.media.length, 12); assert.equal(firstPage.findings.length, 12);
      assert.ok(firstPage.copilotFindings.length <= 12); assert.ok(firstPage.copilotMedia.length <= 24);
      assert.ok(firstPage.linkedFindings.every((row) => row.findings.length <= 12));
      assert.equal(firstPage.findings[0].title, "Excluded candidate");
      assert.equal(firstPage.findings[1].title, "Old high-priority seam candidate");
      const lastPage = await (await api.get(`${reviewURL}?mediaPage=999999999&findingPage=999999999`, { headers })).json();
      assert.equal(lastPage.mediaPage, 83); assert.equal(lastPage.findingPage, 83);
      assert.equal(lastPage.media.length, 9); assert.equal(lastPage.findings.length, 12);
      assert.equal((await api.get(`${reviewURL}?filter=deleted`, { headers })).status(), 400);
      assert.equal((await api.get(`${reviewURL}?findingPage=-1`, { headers })).status(), 400);
      const literalSearch = await (await api.get(`${reviewURL}?search=%25_`, { headers })).json();
      assert.equal(literalSearch.matchingTotal, 0, "search characters must not become SQL wildcards");
      assert.equal(literalSearch.findings.length, 0);
      const foreignRead = await auth.rpc("read_dominic_inspection_review", { p_inspection_id: foreignInspection.id, p_asset_id: foreignAsset.id });
      assert.ifError(foreignRead.error); assert.equal(foreignRead.data, null, "direct RPC must not expose another owner's inspection");
      const wrongAsset = await auth.rpc("read_dominic_inspection_review", { p_inspection_id: inspection.id, p_asset_id: foreignAsset.id });
      assert.ifError(wrongAsset.error); assert.equal(wrongAsset.data, null);
      const anonymousRead = await createClient(supabaseURL, anonKey, { auth: { persistSession: false } }).rpc("read_dominic_inspection_review", { p_inspection_id: inspection.id, p_asset_id: asset.id });
      assert.equal(anonymousRead.error?.code, "42501", "anonymous RPC execution must be revoked");
      const oneFinding = await (await api.get(`${url}?findingId=${findings[1004].id}`, { headers })).json();
      assert.equal(oneFinding.findings.length, 1); assert.deepEqual(oneFinding.media.map((row) => row.id), [media[1004].id]);
      assert.equal((await api.get(`${url}?findingId=${foreignMedia.id}`, { headers })).status(), 404);
      const excluded = firstPage.findings[0];
      const excludedEvidence = await (await api.get(`${url}?findingId=${excluded.id}`, { headers })).json();
      assert.equal(excludedEvidence.findings.length, 1);
      assert.deepEqual(excludedEvidence.media.map((row) => row.id), [media[1004].id], "review must show linked evidence even when excluded from printing");

    } finally { await api.dispose(); }
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await context.addInitScript(({ key, session }) => localStorage.setItem(key, JSON.stringify(session)), { key: `sb-${new URL(supabaseURL).hostname.split(".")[0]}-auth-token`, session: login.session });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`${baseURL}/dominic/inspections/${inspection.id}/report`, { waitUntil: "domcontentloaded" });
    const summary = page.getByRole("region", { name: "Inspection review summary", exact: true });
    await summary.waitFor();
    for (const [label, count] of [["Included findings", "1005"], ["Confirmed findings", "4"], ["Candidates awaiting review", "1001"], ["Critical / high findings", "2"]]) {
      assert.equal(await summary.locator("dt").filter({ hasText: new RegExp(`^${label}$`) }).locator("..").locator("dd").textContent(), count);
    }
    assert.equal(await page.locator("article").count(), 1005);
    assert.equal(await page.locator("article").nth(0).getAttribute("aria-label"), "Old critical roof defect");
    assert.equal(await page.locator("article").nth(1).getAttribute("aria-label"), "Old high-priority seam candidate");
    await page.getByRole("article", { name: "Old high-priority seam candidate", exact: true }).getByText("Candidate — inspector review required", { exact: true }).waitFor();
    assert.equal(await page.getByText("Outsider private critical defect", { exact: true }).count(), 0);
    assert.equal(await page.getByText("Excluded critical finding", { exact: true }).count(), 0);
    assert.equal(await page.getByText("Dismissed critical finding", { exact: true }).count(), 0);
    await page.waitForFunction(() => document.images.length === 2 && [...document.images].every((image) => image.complete && image.naturalWidth > 0));
    assert.equal(await page.getByRole("button", { name: "Print / Save PDF", exact: true }).isEnabled(), true);
    const consent = page.getByRole("region", { name: "Cookie consent", exact: true });
    await consent.waitFor();
    const essentialOnly = consent.getByRole("button", { name: "Essential Only", exact: true });
    const luminance = await essentialOnly.evaluate((button) => {
      const channels = getComputedStyle(button).color.match(/[\d.]+/g).slice(0, 3).map(Number).map((channel) => {
        const value = channel / 255;
        return value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4;
      });
      return .2126 * channels[0] + .7152 * channels[1] + .0722 * channels[2];
    });
    assert.ok(1.05 / (luminance + .05) >= 4.5, "essential cookie choice must be readable on the white banner");
    await page.emulateMedia({ media: "print" });
    assert.equal(await consent.isVisible(), false, "cookie banners must not cover printed inspection evidence");
    assert.equal(await summary.isVisible(), true);
    assert.equal(await page.locator("article").first().isVisible(), true);
    await page.emulateMedia({ media: "screen" });
    await essentialOnly.click();
    await page.screenshot({ path: "/tmp/dom-navigation-complete-report-desktop.png" });
    await page.setViewportSize({ width: 390, height: 844 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), "report summary must fit mobile");
    await page.screenshot({ path: "/tmp/dom-navigation-complete-report-mobile.png" });
    reviewContractor = await seed("contractors", { user_id: users[0].id, full_name: "Large review operator", email: users[0].email, status: "active" });
    await seed("dominic_profiles", { user_id: users[0].id, plan: "organization", status: "active" });
    reviewMission = await seed("mission_requests", { requester_name: "Large review client", requester_email: users[0].email, service_type: "aerial_images", location: "Review site", status: "approved" });
    reviewJob = await seed("jobs", { mission_request_id: reviewMission.id, title: "Large review mission", service_type: "aerial_images", location: "Review site", status: "scheduled" });
    reviewProject = await seed("mapping_projects", { job_id: reviewJob.id, contractor_id: reviewContractor.id, name: "Large review project", status: "uploaded", image_count: 1005 });
    assert.ifError((await admin.from("dominic_inspections").update({ mapping_project_id: reviewProject.id }).eq("id", inspection.id)).error);
    await page.route(`${baseURL}/api/dominic/ai/status`, (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ configured: false }) }));
    const reviewQueries = [];
    let reviewRequests = 0;
    page.on("request", (req) => {
      if (new URL(req.url()).pathname === `/api/dominic/inspections/${inspection.id}/review`) reviewQueries.push(new URL(req.url()));
      if (/\/findings\/[^/]+\/review$/.test(req.url()) && req.method() === "POST") reviewRequests++;
    });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(`${baseURL}/dominic`, { waitUntil: "domcontentloaded" });
    await page.locator('summary[title="Operations"]').click();
    await page.getByRole("button", { name: "DOMINIC HUB", exact: true }).click();
    await page.getByRole("button", { name: "Choose operations project", exact: true }).click();
    await page.getByRole("button").filter({ hasText: "Large review project" }).click();
    await page.getByRole("navigation", { name: "DOMINIC navigation", exact: true }).getByRole("button", { name: "AI Copilot", exact: true }).click();
    const review = page.getByRole("region", { name: "AI Inspection Copilot", exact: true });
    const queue = review.getByRole("region", { name: "Finding review queue", exact: true });
    await queue.getByText("Showing 1–12 of 1008 matching findings · 1008 saved total", { exact: true }).waitFor();
    assert.equal(await queue.getByRole("article").count(), 12, "finding cards must remain bounded to one page");
    assert.equal(await queue.getByRole("article").first().getAttribute("aria-label"), "Excluded candidate", "report exclusion must not hide an urgent unreviewed candidate");
    assert.equal(await queue.getByRole("article").nth(1).getAttribute("aria-label"), "Old high-priority seam candidate");
    await review.getByText("1002 NEED REVIEW", { exact: true }).waitFor();
    const evidencePages = review.getByRole("navigation", { name: "Inspection evidence pages", exact: true });
    await evidencePages.getByText("Showing 1–12 of 1005 evidence items", { exact: true }).waitFor();
    await evidencePages.getByRole("button", { name: "Last evidence page", exact: true }).click();
    await evidencePages.getByText("Showing 997–1005 of 1005 evidence items", { exact: true }).waitFor();
    assert.equal(await review.locator('[role="article"][aria-label^="Evidence "]').count(), 9);
    await queue.getByRole("button", { name: "Last finding page", exact: true }).click();
    await queue.getByText("Showing 997–1008 of 1008 matching findings · 1008 saved total", { exact: true }).waitFor();
    await queue.getByRole("combobox", { name: "Finding review status", exact: true }).selectOption("confirmed");
    await queue.getByText("Showing 1–5 of 5 matching findings · 1008 saved total", { exact: true }).waitFor();
    await queue.getByRole("combobox", { name: "Finding review status", exact: true }).selectOption("pending");
    await queue.getByRole("textbox", { name: "Search saved findings", exact: true }).fill("Old high-priority");
    await queue.getByText("Showing 1–1 of 1 matching findings · 1008 saved total", { exact: true }).waitFor();
    await queue.getByRole("button", { name: "Review saved finding Old high-priority seam candidate", exact: true }).click();
    const details = review.getByRole("dialog", { name: "Old high-priority seam candidate", exact: true });
    await details.waitFor();
    await details.getByRole("button", { name: "Close callout", exact: true }).click();
    await queue.getByRole("article", { name: "Old high-priority seam candidate", exact: true }).getByRole("button", { name: "Dismiss", exact: true }).click();
    await queue.getByText("No matching findings.", { exact: true }).waitFor();
    const dismissed = await admin.from("dominic_findings").select("review_status").eq("id", findings[1003].id).single();
    assert.ifError(dismissed.error); assert.equal(dismissed.data.review_status, "dismissed"); assert.equal(reviewRequests, 1);
    assert.ok(reviewQueries.some((url) => url.searchParams.get("mediaPage") === "83"), "evidence must load its last page from the server");
    assert.ok(reviewQueries.some((url) => url.searchParams.get("findingPage") === "83"), "findings must load their last page from the server");
    assert.ok(reviewQueries.some((url) => url.searchParams.get("search") === "Old high-priority"), "search must run on the server, beyond visible findings");
    assert.equal(await review.getByText("Outsider private critical defect", { exact: true }).count(), 0);
    const findingRoute = new RegExp(`/api/dominic/inspections/${inspection.id}/review\\?`);
    await page.route(findingRoute, (route) => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ message: "Fixture refresh failed" }) }));
    await review.getByRole("button", { name: "Refresh inspection evidence", exact: true }).click();
    await review.getByText("REVIEW COUNT UNAVAILABLE", { exact: true }).waitFor();
    assert.equal(await queue.getByRole("article").count(), 0, "failed refresh must remove stale review controls");
    await page.unroute(findingRoute);
    await review.getByRole("button", { name: "Refresh inspection evidence", exact: true }).click();
    await review.getByText("1001 NEED REVIEW", { exact: true }).waitFor();
    await queue.getByRole("textbox", { name: "Search saved findings", exact: true }).fill("");
    await queue.getByRole("combobox", { name: "Finding review status", exact: true }).selectOption("all");
    await queue.getByText("Showing 1–12 of 1008 matching findings · 1008 saved total", { exact: true }).waitFor();
    await page.screenshot({ path: "/tmp/dom-navigation-paged-review-desktop.png" });
    await page.setViewportSize({ width: 390, height: 844 });
    // The workspace responds to matchMedia and animates its sidebar grid for 180ms.
    // Wait for that resize to settle before measuring the mobile layout.
    await page.waitForFunction(() => document.documentElement.scrollWidth <= window.innerWidth + 1, null, { timeout: 5000 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), "paged review controls must fit mobile");
    await queue.screenshot({ path: "/tmp/dom-navigation-paged-review-mobile.png" });
    assert.deepEqual(errors, []);
  } finally {
    await browser?.close();
    if (storagePaths.length) await admin.storage.from("dominic-inspection-evidence").remove(storagePaths);
    for (const user of users.reverse()) {
      await admin.from("dominic_findings").delete().eq("user_id", user.id);
      await admin.from("dominic_inspection_media").delete().eq("user_id", user.id);
      await admin.from("dominic_inspections").delete().eq("user_id", user.id);
      await admin.from("dominic_assets").delete().eq("user_id", user.id);
      await admin.from("dominic_profiles").delete().eq("user_id", user.id);
      if (reviewProject && user.id === reviewContractor.user_id) await admin.from("mapping_projects").delete().eq("id", reviewProject.id);
      if (reviewJob && user.id === reviewContractor.user_id) await admin.from("jobs").delete().eq("id", reviewJob.id);
      if (reviewMission && user.id === reviewContractor.user_id) await admin.from("mission_requests").delete().eq("id", reviewMission.id);
      if (reviewContractor && user.id === reviewContractor.user_id) await admin.from("contractors").delete().eq("id", reviewContractor.id);
      await admin.auth.admin.deleteUser(user.id);
    }
  }
});

test("public DOMINIC sample uses photorealistic imagery and never mutates account data", { skip: !isolated }, async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await context.addInitScript(() => localStorage.setItem("dom-cookie-consent", "essential"));
    const page = await context.newPage();
    const mutations = [];
    const accountRequests = [];
    const errors = [];
    page.on("request", (req) => {
      if (["POST", "PATCH", "PUT", "DELETE"].includes(req.method()) && /\/api\/|\/rest\/v1|\/storage\/v1/.test(req.url())) mutations.push(req.url());
      if (/\/api\/(dominic|pilot)|\/rest\/v1/.test(req.url())) accountRequests.push(req.url());
    });
    page.on("pageerror", (error) => errors.push(error.message));
    // Wait for the page content; unrelated background requests need not go idle.
    await page.goto(baseURL, { waitUntil: "domcontentloaded" });
    assert.equal(await page.getByRole("link", { name: "Explore DOMINIC", exact: true }).getAttribute("href"), "/dominic/demo");
    await page.goto(`${baseURL}/dominic/demo`, { waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: "Demo refinery inspection", exact: true }).waitFor();
    const photograph = page.getByRole("img", { name: "Photorealistic generated sample aerial image of a refinery tank, transfer pipes and industrial building", exact: true });
    await photograph.waitFor();
    await page.waitForFunction(() => [...document.images].some((img) => img.alt.startsWith("Photorealistic") && img.complete && img.naturalWidth > 0));
    await page.getByRole("button", { name: "Open sample project", exact: true }).click();
    await page.getByRole("button", { name: "B-07", exact: true }).click();
    await page.getByRole("heading", { name: "Missing north-face coverage", exact: true }).waitFor();
    await page.screenshot({ path: "/tmp/dom-navigation-public-demo-desktop.png" });
    await page.getByRole("button", { name: "Live Flight simulation", exact: true }).click();
    await page.getByRole("button", { name: "Next sample frame", exact: true }).click();
    await page.getByText("Tank 17 pass complete. Transfer line is next.", { exact: true }).waitFor();
    await page.setViewportSize({ width: 390, height: 844 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), "public demo must fit a phone");
    await page.screenshot({ path: "/tmp/dom-navigation-public-demo-mobile.png" });
    assert.deepEqual(mutations, []);
    assert.deepEqual(accountRequests, []);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test("DOMINIC finding review commits atomically and concurrent retries preserve one issue history", { skip: !isolated, timeout: 120_000 }, async () => {
  assert.ok(supabaseURL && anonKey && serviceKey);
  assert.match(supabaseURL, /^https?:\/\/(127\.0\.0\.1|localhost)(:|\/)/);
  assert.match(baseURL, /^https?:\/\/(127\.0\.0\.1|localhost)(:|\/|$)/);
  const admin = createClient(supabaseURL, serviceKey, { auth: { persistSession: false } });
  const { randomUUID } = await import("node:crypto");
  const stamp = `${Date.now()}-${randomUUID().slice(0, 8)}`;
  const password = `Dom-Atomic-${stamp}!Aa1`;
  const users = [];
  const api = await request.newContext();
  try {
    for (const name of ["owner", "outsider"]) {
      const created = await admin.auth.admin.createUser({ email: `atomic-${name}-${stamp}@e2e.dom.invalid`, password, email_confirm: true });
      assert.ifError(created.error); users.push(created.data.user);
    }
    const seed = async (table, row) => {
      const result = await admin.from(table).insert(row).select("*").single(); assert.ifError(result.error); return result.data;
    };
    const asset = await seed("dominic_assets", { user_id: users[0].id, name: "Atomic coating tank", asset_type: "storage_tank" });
    const inspection = await seed("dominic_inspections", { user_id: users[0].id, asset_id: asset.id, inspection_type: "visual" });
    const media = await seed("dominic_inspection_media", { user_id: users[0].id, asset_id: asset.id, inspection_id: inspection.id, media_type: "image", sensor_mode: "rgb", storage_path: `${users[0].id}/atomic-review.webp` });
    const foreignAsset = await seed("dominic_assets", { user_id: users[1].id, name: "Private atomic tank", asset_type: "storage_tank" });
    const foreignInspection = await seed("dominic_inspections", { user_id: users[1].id, asset_id: foreignAsset.id, inspection_type: "visual" });
    const foreignMedia = await seed("dominic_inspection_media", { user_id: users[1].id, asset_id: foreignAsset.id, inspection_id: foreignInspection.id, media_type: "image", sensor_mode: "rgb", storage_path: `${users[1].id}/private-atomic.webp` });
    const finding = (title, severity, detector, spatial_anchor = {}, confidence = .4, observed_at = new Date().toISOString()) => seed("dominic_findings", {
      user_id: users[0].id, asset_id: asset.id, inspection_id: inspection.id, finding_type: "visual_anomaly",
      title, severity, confidence, observed_at, review_status: "needs_review", sensor_mode: "rgb", detector, spatial_anchor,
    });
    const read = async (table, id) => { const result = await admin.from(table).select("*").eq("id", id).single(); assert.ifError(result.error); return result.data; };
    const rollback = await finding("Rollback fixture", "critical", { trackingKey: "rollback-fixture", mediaId: media.id });
    const failed = await admin.rpc("commit_dominic_finding_review", {
      p_finding_id: rollback.id, p_user_id: users[0].id, p_action: "confirm",
      p_plan: { expectedFindingUpdatedAt: rollback.updated_at, expectedInspectionUpdatedAt: (await read("dominic_inspections", inspection.id)).updated_at,
        expectedIssueId: null, expectedIssueUpdatedAt: null, issueKey: "rollback_fixture",
        issueValues: { severity: "critical", confidence: .4, recommended_action: null, metadata: {} },
        event: { event_type: "confirmed", summary: null, details: {} } },
    });
    assert.equal(failed.error?.code, "23502", "a history failure must abort the whole confirmation transaction");
    const count = async (table, column, value) => {
      const result = await admin.from(table).select("*", { count: "exact", head: true }).eq(column, value); assert.ifError(result.error); return result.count;
    };
    for (const table of ["dominic_issue_findings", "dominic_issue_events", "dominic_finding_evidence"]) assert.equal(await count(table, "finding_id", rollback.id), 0);
    assert.equal(await count("dominic_issues", "first_finding_id", rollback.id), 0);
    assert.equal((await read("dominic_findings", rollback.id)).review_status, "needs_review");
    assert.equal((await read("dominic_assets", asset.id)).condition_state, asset.condition_state, "condition changes must also roll back");

    const auth = createClient(supabaseURL, anonKey, { auth: { persistSession: false } });
    const login = await auth.auth.signInWithPassword({ email: users[0].email, password }); assert.ifError(login.error);
    const foreignAuth = await createClient(supabaseURL, anonKey, { auth: { persistSession: false } }).auth.signInWithPassword({ email: users[1].email, password }); assert.ifError(foreignAuth.error);
    const headers = { Authorization: `Bearer ${login.data.session.access_token}` };
    const reviewURL = (id) => `${baseURL}/api/dominic/findings/${id}/review`;
    const confirm = async (id) => {
      const result = await api.post(reviewURL(id), { headers, data: { action: "confirm" } });
      const body = await result.json(); assert.equal(result.status(), 200, JSON.stringify(body)); return body;
    };
    assert.equal((await api.post(reviewURL(rollback.id), { data: { action: "confirm" } })).status(), 401);
    assert.equal((await api.post(reviewURL(rollback.id), { headers: { Authorization: `Bearer ${foreignAuth.data.session.access_token}` }, data: { action: "confirm" } })).status(), 404);
    assert.equal((await api.post(reviewURL(rollback.id), { headers, data: null })).status(), 400);
    const denied = await auth.rpc("commit_dominic_finding_review", { p_finding_id: rollback.id, p_user_id: users[0].id, p_action: "confirm" });
    assert.equal(denied.error?.code, "42501", "the privileged commit must not be callable directly by authenticated clients");
    const anonymous = await createClient(supabaseURL, anonKey, { auth: { persistSession: false } }).rpc("commit_dominic_finding_review", { p_finding_id: rollback.id, p_user_id: users[0].id, p_action: "confirm" });
    assert.equal(anonymous.error?.code, "42501");
    const recovered = await confirm(rollback.id);
    assert.equal(await count("dominic_issue_events", "finding_id", rollback.id), 1);
    assert.equal(await count("dominic_finding_evidence", "finding_id", rollback.id), 1);
    assert.equal((await read("dominic_assets", asset.id)).condition_state, "critical");

    const first = await finding("North coating damage", "medium", { trackingKey: "north-coating", mediaId: media.id });
    const replies = await Promise.all(Array.from({ length: 4 }, () => confirm(first.id)));
    assert.equal(new Set(replies.map((row) => row.issueId)).size, 1);
    assert.equal(replies.filter((row) => row.alreadyLinked === false).length, 1);
    assert.equal(await count("dominic_issues", "first_finding_id", first.id), 1);
    for (const table of ["dominic_issue_findings", "dominic_issue_events", "dominic_finding_evidence"]) assert.equal(await count(table, "finding_id", first.id), 1);
    const issueId = replies[0].issueId;
    assert.equal((await read("dominic_issues", issueId)).metadata.recurrenceCount, 0);
    const beforeRepeat = await read("dominic_issues", issueId);
    const repeatRollback = await finding("Repeat rollback fixture", "critical", { trackingKey: "north-coating", mediaId: media.id });
    const failedRepeat = await admin.rpc("commit_dominic_finding_review", {
      p_finding_id: repeatRollback.id, p_user_id: users[0].id, p_action: "confirm",
      p_plan: { expectedFindingUpdatedAt: repeatRollback.updated_at, expectedInspectionUpdatedAt: (await read("dominic_inspections", inspection.id)).updated_at,
        expectedIssueId: issueId, expectedIssueUpdatedAt: beforeRepeat.updated_at, issueKey: beforeRepeat.issue_key,
        issueValues: { severity: "critical", confidence: .9, recommended_action: null, metadata: { recurrenceCount: 999 } },
        event: { event_type: "observed_worsening", summary: null, details: {} } },
    });
    assert.equal(failedRepeat.error?.code, "23502");
    const afterRepeat = await read("dominic_issues", issueId);
    assert.equal(afterRepeat.severity, beforeRepeat.severity); assert.deepEqual(afterRepeat.metadata, beforeRepeat.metadata);
    assert.equal(afterRepeat.current_finding_id, beforeRepeat.current_finding_id);
    assert.equal((await read("dominic_findings", repeatRollback.id)).review_status, "needs_review");
    for (const table of ["dominic_issue_findings", "dominic_issue_events", "dominic_finding_evidence"]) assert.equal(await count(table, "finding_id", repeatRollback.id), 0);

    const worsening = await finding("North coating repeat", "high", { trackingKey: "north-coating", comparisonState: "worsening" }, { mediaId: media.id }, .8, "2001-01-01T00:00:00Z");
    const unchanged = await finding("North coating unchanged", "medium", { trackingKey: "north-coating", comparisonState: "unchanged", mediaId: foreignMedia.id }, {}, .7, "2002-01-01T00:00:00Z");
    const repeated = await Promise.all([confirm(worsening.id), confirm(unchanged.id)]);
    assert.ok(repeated.every((row) => row.issueId === issueId && row.reusedIssue));
    const updated = await read("dominic_issues", issueId);
    assert.equal(updated.severity, "high"); assert.equal(updated.confidence, .8);
    assert.equal(Date.parse(updated.last_seen_at), Date.parse(first.observed_at), "reviewing older evidence must not move last-seen backward");
    assert.equal(updated.metadata.recurrenceCount, 2); assert.equal(updated.metadata.worseningCount, 1); assert.equal(updated.metadata.unchangedCount, 1);
    assert.equal(await count("dominic_issue_findings", "issue_id", issueId), 3);
    assert.equal(await count("dominic_issue_events", "issue_id", issueId), 3);
    assert.equal(await count("dominic_finding_evidence", "finding_id", worsening.id), 1, "spatial-anchor source evidence must be linked");
    assert.equal(await count("dominic_finding_evidence", "finding_id", unchanged.id), 0, "foreign source media must never be linked");
    const retried = await confirm(worsening.id); assert.equal(retried.alreadyLinked, true);
    assert.equal((await read("dominic_issues", issueId)).metadata.recurrenceCount, 2);
    assert.equal(await count("dominic_issue_events", "issue_id", issueId), 3);
    assert.equal((await read("dominic_assets", asset.id)).condition_state, "critical", "a later lower-severity confirmation must not downgrade asset triage");

    assert.ifError((await admin.from("dominic_issues").update({ status: "resolved" }).eq("id", issueId)).error);
    assert.ifError((await admin.from("dominic_inspections").update({ ai_summary: { purpose: "maintenance_verification", issueId } }).eq("id", inspection.id)).error);
    const verification = await finding("Repair follow-up", "low", { trackingKey: "different-wording", comparisonState: "improving", mediaId: media.id });
    const verified = await confirm(verification.id);
    assert.equal(verified.issueId, issueId); assert.equal(verified.progressionEvent, "observed_improving");
    assert.equal((await read("dominic_issues", issueId)).status, "resolved", "observing improvement must not automatically verify repair");
    assert.equal((await read("dominic_issues", issueId)).metadata.recurrenceCount, 3);
    assert.equal(await count("dominic_issue_events", "issue_id", issueId), 4);
    assert.notEqual(recovered.issueId, issueId);
    const events = await admin.from("dominic_issue_events").select("event_type").eq("issue_id", issueId); assert.ifError(events.error);
    assert.deepEqual(events.data.map((row) => row.event_type).sort(), ["confirmed", "observed_worsening", "observed_unchanged", "observed_improving"].sort());
  } finally {
    await api.dispose();
    for (const user of users) {
      for (const table of ["dominic_finding_evidence", "dominic_issue_events", "dominic_issue_findings", "dominic_issues", "dominic_findings", "dominic_inspection_media", "dominic_inspections", "dominic_assets"]) await admin.from(table).delete().eq("user_id", user.id);
      await admin.auth.admin.deleteUser(user.id);
    }
  }
});

test("maintenance verification assesses every finding and image beyond API row limits", { skip: !isolated, timeout: 120_000 }, async () => {
  assert.ok(supabaseURL && anonKey && serviceKey);
  assert.match(supabaseURL, /^https?:\/\/(127\.0\.0\.1|localhost)(:|\/)/);
  assert.match(baseURL, /^https?:\/\/(127\.0\.0\.1|localhost)(:|\/)/);
  const admin = createClient(supabaseURL, serviceKey, { auth: { persistSession: false } });
  const api = await request.newContext({ baseURL });
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const password = `Dom-Verification-${stamp}!Aa1`;
  const users = [];
  const insert = async (table, values) => {
    const result = await admin.from(table).insert(values).select("*");
    assert.ifError(result.error); return result.data;
  };
  const update = async (table, id, values) => {
    const result = await admin.from(table).update(values).eq("id", id); assert.ifError(result.error);
  };
  try {
    for (const label of ["owner", "outsider"]) {
      const created = await admin.auth.admin.createUser({ email: `verification-${label}-${stamp}@e2e.dom.invalid`, password, email_confirm: true });
      assert.ifError(created.error); users.push(created.data.user);
    }
    const [owner, outsider] = users;
    const ownerClient = createClient(supabaseURL, anonKey, { auth: { persistSession: false } });
    const outsiderClient = createClient(supabaseURL, anonKey, { auth: { persistSession: false } });
    const signedOwner = await ownerClient.auth.signInWithPassword({ email: owner.email, password }); assert.ifError(signedOwner.error);
    const signedOutsider = await outsiderClient.auth.signInWithPassword({ email: outsider.email, password }); assert.ifError(signedOutsider.error);
    const headers = { Authorization: `Bearer ${signedOwner.data.session.access_token}` };
    const [asset] = await insert("dominic_assets", { user_id: owner.id, name: "Verification tank", asset_type: "tank" });
    const summary = (candidateCount) => ({ candidateCount, baselineCompared: true, comparisonComparability: { level: "high" } });
    const [inspection] = await insert("dominic_inspections", { user_id: owner.id, asset_id: asset.id, inspection_type: "visual", status: "review", ai_summary: summary(0) });
    const [issue] = await insert("dominic_issues", { user_id: owner.id, asset_id: asset.id, issue_type: "visual_anomaly", title: "Repaired seam", severity: "high", status: "resolved", resolved_at: new Date().toISOString(), metadata: { verificationInspectionId: inspection.id, verificationRequired: true } });
    const media = await insert("dominic_inspection_media", [1005, 0].map((count, index) => ({ user_id: owner.id, asset_id: asset.id, inspection_id: inspection.id, sensor_mode: "rgb", media_type: "image", mime_type: "image/jpeg", original_filename: `verification-${index}.jpg`, analysis_status: "review", analysis_summary: summary(count) })));
    const rows = Array.from({ length: 1005 }, (_, index) => ({ user_id: owner.id, asset_id: asset.id, inspection_id: inspection.id, finding_type: "visual_anomaly", title: `Verification candidate ${index}`, severity: "medium", review_status: index === 1000 ? "detected" : index === 1001 ? "needs_review" : index === 1004 ? "dismissed" : "confirmed", detector: { comparisonState: index === 1002 ? "worsening" : index === 1003 ? "unknown" : "improving" }, observed_at: new Date(946684800000 + index * 1000).toISOString() }));
    for (let start = 0; start < rows.length; start += 250) await insert("dominic_findings", rows.slice(start, start + 250));
    const tail = await admin.from("dominic_findings").select("id,title").eq("inspection_id", inspection.id).gte("observed_at", rows[1000].observed_at).order("observed_at"); assert.ifError(tail.error); assert.equal(tail.data.length, 5);
    const path = `/api/dominic/issues/${issue.id}/lifecycle`;
    const get = async () => { const response = await api.get(path, { headers }); assert.equal(response.status(), 200, await response.text()); assert.equal(response.headers()["cache-control"], "no-store"); return response.json(); };
    const blocked = async (expectedStatus) => {
      const lifecycle = await get(); assert.equal(lifecycle.assessment.status, expectedStatus); assert.equal(lifecycle.assessment.canVerify, false);
      const response = await api.post(path, { headers, data: { action: "verify", verificationNotes: "Operator checked evidence" } });
      assert.equal(response.status(), 409, await response.text());
      const saved = await admin.from("dominic_issues").select("status,verified_at").eq("id", issue.id).single(); assert.ifError(saved.error); assert.equal(saved.data.status, "resolved"); assert.equal(saved.data.verified_at, null);
      const events = await admin.from("dominic_issue_events").select("id", { count: "exact", head: true }).eq("issue_id", issue.id); assert.ifError(events.error); assert.equal(events.count, 0);
      return lifecycle;
    };
    assert.equal((await api.get(path)).status(), 401);
    assert.equal((await api.get(path, { headers: { Authorization: `Bearer ${signedOutsider.data.session.access_token}` } })).status(), 404);
    for (const client of [ownerClient, createClient(supabaseURL, anonKey, { auth: { persistSession: false } })]) {
      const result = await client.rpc("read_dominic_issue_verification", { p_issue_id: issue.id, p_user_id: owner.id }); assert.equal(result.error?.code, "42501");
    }
    const initial = await blocked("needs_review");
    assert.equal(initial.verificationCounts.total, 1005); assert.equal(initial.verificationCounts.pending, 2); assert.equal(initial.verificationCounts.confirmed, 1002);
    assert.equal(initial.verificationCounts.screenedCandidates, 1005); assert.equal(initial.verificationCounts.mediaTotal, 2); assert.equal(initial.verificationFindings.length, 12);
    assert.equal(initial.verificationFindings[0].id, tail.data[0].id, "detected findings beyond the first 1000 must be prioritized");
    await update("dominic_findings", tail.data[0].id, { review_status: "dismissed" });
    await update("dominic_findings", tail.data[1].id, { review_status: "dismissed" });
    await blocked("failed");
    await update("dominic_findings", tail.data[2].id, { detector: { comparisonState: "improving" } });
    await blocked("needs_review");
    await update("dominic_findings", tail.data[3].id, { detector: { comparisonState: "improving" } });
    assert.equal((await get()).assessment.canVerify, true);
    for (const analysis_status of ["pending", "analyzing", "failed"]) {
      await update("dominic_inspection_media", media[0].id, { analysis_status }); await blocked("capturing");
    }
    await update("dominic_inspection_media", media[0].id, { analysis_status: "review", analysis_summary: { ...summary(1005), comparisonComparability: { level: "low" } } }); await blocked("insufficient");
    await update("dominic_inspection_media", media[0].id, { analysis_summary: { ...summary(1005), baselineCompared: false } }); await blocked("insufficient");
    await update("dominic_inspection_media", media[0].id, { analysis_summary: summary("1005") }); await blocked("insufficient");
    await update("dominic_inspection_media", media[0].id, { analysis_summary: summary(1006) }); await blocked("insufficient");
    await update("dominic_inspection_media", media[0].id, { analysis_summary: summary(1005) });
    const ready = await get(); assert.equal(ready.assessment.status, "improved"); assert.equal(ready.assessment.canVerify, true);
    const verified = await api.post(path, { headers, data: { action: "verify", verificationNotes: "Operator accepts reviewed improvement" } }); assert.equal(verified.status(), 200, await verified.text()); assert.equal((await verified.json()).issue.status, "verified");
    const events = await admin.from("dominic_issue_events").select("event_type").eq("issue_id", issue.id); assert.ifError(events.error); assert.deepEqual(events.data.map((event) => event.event_type), ["maintenance_verified"]);

    // Zero candidates require actual completed evidence, not just a summary flag.
    const [emptyInspection] = await insert("dominic_inspections", { user_id: owner.id, asset_id: asset.id, inspection_type: "visual", status: "review", ai_summary: summary(0) });
    await update("dominic_issues", issue.id, { status: "resolved", verified_at: null, metadata: { verificationInspectionId: emptyInspection.id } });
    assert.equal((await get()).assessment.canVerify, false);
    await insert("dominic_inspection_media", { user_id: owner.id, asset_id: asset.id, inspection_id: emptyInspection.id, sensor_mode: "rgb", media_type: "image", analysis_status: "complete", analysis_summary: summary(0) });
    assert.equal((await get()).assessment.status, "cleared"); assert.equal((await get()).assessment.canVerify, true);
    await update("dominic_inspections", emptyInspection.id, { status: "cancelled" }); assert.equal((await get()).assessment.canVerify, false);
    const foreignRead = await admin.rpc("read_dominic_issue_verification", { p_issue_id: issue.id, p_user_id: outsider.id }); assert.ifError(foreignRead.error); assert.equal(foreignRead.data, null);
  } finally {
    await api.dispose();
    for (const user of users) {
      for (const table of ["dominic_issue_events", "dominic_issues", "dominic_findings", "dominic_inspection_media", "dominic_inspections", "dominic_assets"]) { const result = await admin.from(table).delete().eq("user_id", user.id); assert.ifError(result.error); }
      await admin.auth.admin.deleteUser(user.id);
    }
  }
});

test("maintenance lifecycle rolls back failed history and rejects stale issue or evidence plans", { skip: !isolated, timeout: 120_000 }, async () => {
  assert.ok(supabaseURL && anonKey && serviceKey);
  assert.match(supabaseURL, /^https?:\/\/(127\.0\.0\.1|localhost)(:|\/)/);
  assert.match(baseURL, /^https?:\/\/(127\.0\.0\.1|localhost)(:|\/)/);
  const admin = createClient(supabaseURL, serviceKey, { auth: { persistSession: false } });
  const api = await request.newContext({ baseURL });
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const password = `Dom-Lifecycle-${stamp}!Aa1`;
  const users = [];
  const insert = async (table, values) => { const result = await admin.from(table).insert(values).select("*"); assert.ifError(result.error); return result.data; };
  const update = async (table, id, values) => { const result = await admin.from(table).update(values).eq("id", id); assert.ifError(result.error); };
  try {
    for (const label of ["owner", "outsider"]) {
      const created = await admin.auth.admin.createUser({ email: `lifecycle-${label}-${stamp}@e2e.dom.invalid`, password, email_confirm: true }); assert.ifError(created.error); users.push(created.data.user);
    }
    const [owner, outsider] = users;
    const client = createClient(supabaseURL, anonKey, { auth: { persistSession: false } });
    const session = await client.auth.signInWithPassword({ email: owner.email, password }); assert.ifError(session.error);
    const foreignClient = createClient(supabaseURL, anonKey, { auth: { persistSession: false } });
    const foreignSession = await foreignClient.auth.signInWithPassword({ email: outsider.email, password }); assert.ifError(foreignSession.error);
    const headers = { Authorization: `Bearer ${session.data.session.access_token}` };
    const [asset] = await insert("dominic_assets", { user_id: owner.id, name: "Lifecycle tank", asset_type: "tank" });
    const [foreignAsset] = await insert("dominic_assets", { user_id: outsider.id, name: "Foreign tank", asset_type: "tank" });
    const [foreignInspection] = await insert("dominic_inspections", { user_id: outsider.id, asset_id: foreignAsset.id, inspection_type: "visual", status: "review" });
    const [inspection] = await insert("dominic_inspections", { user_id: owner.id, asset_id: asset.id, inspection_type: "visual", status: "review" });
    const summary = { candidateCount: 0, baselineCompared: true, comparisonComparability: { level: "high" } };
    const [media] = await insert("dominic_inspection_media", { user_id: owner.id, asset_id: asset.id, inspection_id: inspection.id, sensor_mode: "rgb", media_type: "image", analysis_status: "review", analysis_summary: summary });
    const [issue] = await insert("dominic_issues", { user_id: owner.id, asset_id: asset.id, issue_type: "visual_anomaly", title: "Lifecycle seam", status: "open" });
    const path = `/api/dominic/issues/${issue.id}/lifecycle`;
    const get = async () => { const response = await api.get(path, { headers }); assert.equal(response.status(), 200, await response.text()); return response.json(); };
    const post = async (data) => api.post(path, { headers, data });
    const snapshot = async () => { const result = await admin.rpc("read_dominic_issue_verification", { p_issue_id: issue.id, p_user_id: owner.id }); assert.ifError(result.error); return result.data; };
    const commit = async (action, plan, userId = owner.id) => admin.rpc("commit_dominic_issue_lifecycle", { p_issue_id: issue.id, p_user_id: userId, p_action: action, p_plan: plan });
    const planFor = (s, action, overrides = {}) => ({ expectedIssueUpdatedAt: s.issue.updated_at,
      issueValues: { status: action === "verify" ? "verified" : action === "start_maintenance" || action === "verification_failed" ? "in_progress" : "resolved", metadata: { ...s.issue.metadata, rollbackAttempt: action }, ...overrides },
      event: { eventType: action === "verify" ? "maintenance_verified" : action === "start_maintenance" ? "maintenance_started" : action === "complete_maintenance" ? "maintenance_completed" : action, summary: "Controlled lifecycle test", inspectionId: ["verify", "verification_failed", "verification_started"].includes(action) ? inspection.id : null },
      expectedVerification: { inspection: s.verificationInspection, counts: s.verificationCounts },
    });
    const eventCount = async () => { const result = await admin.from("dominic_issue_events").select("id", { count: "exact", head: true }).eq("issue_id", issue.id); assert.ifError(result.error); return result.count; };
    for (const action of ["start_maintenance", "complete_maintenance", "verification_started", "verify", "verification_failed"]) {
      await update("dominic_issues", issue.id, { status: action === "start_maintenance" ? "open" : action === "complete_maintenance" ? "in_progress" : "resolved", metadata: { verificationInspectionId: inspection.id }, resolved_at: null, verified_at: null });
      const before = await snapshot(); const plan = planFor(before, action); plan.event.summary = null;
      const result = await commit(action, plan); assert.equal(result.error?.code, "23502", `${action} must fail at history insertion`);
      assert.deepEqual((await snapshot()).issue, before.issue, `${action} must roll the complete issue update back`); assert.equal(await eventCount(), 0);
    }
    await update("dominic_issues", issue.id, { status: "open", metadata: {} });
    assert.equal((await api.post(path, { data: { action: "start_maintenance" } })).status(), 401);
    assert.equal((await api.post(path, { headers: { Authorization: `Bearer ${foreignSession.data.session.access_token}` }, data: { action: "start_maintenance" } })).status(), 404);
    assert.equal((await api.post(path, { headers: { ...headers, "Content-Type": "application/json" }, data: "null" })).status(), 400);
    assert.equal((await post({ action: "start_maintenance", note: {} })).status(), 400);
    for (const rpcClient of [client, createClient(supabaseURL, anonKey, { auth: { persistSession: false } })]) {
      const result = await rpcClient.rpc("commit_dominic_issue_lifecycle", { p_issue_id: issue.id, p_user_id: owner.id, p_action: "start_maintenance", p_plan: planFor(await snapshot(), "start_maintenance") }); assert.equal(result.error?.code, "42501");
    }
    const foreignCommit = await commit("start_maintenance", planFor(await snapshot(), "start_maintenance"), outsider.id); assert.ifError(foreignCommit.error); assert.equal(foreignCommit.data.notFound, true);
    const parallel = async (data) => {
      const responses = await Promise.all(Array.from({ length: 4 }, () => post(data)));
      for (const response of responses) assert.ok([200, 409].includes(response.status()), await response.text());
      assert.ok(responses.some((response) => response.status() === 200));
    };
    await parallel({ action: "start_maintenance", note: "Start controlled repair", workOrder: "WO-ATOMIC" });
    assert.equal((await get()).issue.status, "in_progress"); assert.equal(await eventCount(), 1);
    await parallel({ action: "complete_maintenance", resolutionNotes: "Coating repair completed", workOrder: "WO-ATOMIC" });
    assert.equal((await get()).issue.status, "resolved"); assert.equal(await eventCount(), 2);
    assert.equal((await post({ action: "verification_started", inspectionId: foreignInspection.id })).status(), 404); assert.equal(await eventCount(), 2);
    assert.equal((await post({ action: "verification_started", inspectionId: inspection.id })).status(), 200); assert.equal(await eventCount(), 3);
    assert.equal((await get()).assessment.canVerify, true);

    const staleIssue = await snapshot(); await update("dominic_issues", issue.id, { metadata: { ...staleIssue.issue.metadata, maintenanceWorkOrder: "WO-NEW" } });
    const staleResult = await commit("verify", planFor(staleIssue, "verify")); assert.ifError(staleResult.error); assert.equal(staleResult.data.conflict, true); assert.equal(await eventCount(), 3);
    const rejectChanged = async (mutate) => {
      const before = await snapshot(); assert.equal((await get()).assessment.canVerify, true);
      await mutate(); const after = await snapshot(); assert.ok(after.verificationInspection.verification_revision > before.verificationInspection.verification_revision);
      assert.equal(after.issue.updated_at, before.issue.updated_at, "evidence freshness must be checked independently of issue version");
      const result = await commit("verify", planFor(before, "verify")); assert.ifError(result.error); assert.equal(result.data.conflict, true);
      assert.equal((await snapshot()).issue.status, "resolved"); assert.equal(await eventCount(), 3);
    };
    await rejectChanged(() => update("dominic_inspection_media", media.id, { analysis_status: "failed" }));
    await update("dominic_inspection_media", media.id, { analysis_status: "review" });
    let finding;
    await rejectChanged(async () => { [finding] = await insert("dominic_findings", { user_id: owner.id, asset_id: asset.id, inspection_id: inspection.id, finding_type: "visual_anomaly", title: "New comparison candidate", review_status: "needs_review" }); });
    await update("dominic_findings", finding.id, { review_status: "dismissed" });
    await rejectChanged(async () => { const result = await client.from("dominic_findings").update({ title: "Owner edited candidate" }).eq("id", finding.id); assert.ifError(result.error); });
    await rejectChanged(async () => { const result = await admin.from("dominic_findings").delete().eq("id", finding.id); assert.ifError(result.error); });
    await rejectChanged(() => update("dominic_inspections", inspection.id, { summary: "Changed inspection notes" }));
    const ownMediaEdit = await client.from("dominic_inspection_media").update({ original_filename: "owner-renamed.jpg" }).eq("id", media.id); assert.ifError(ownMediaEdit.error);
    await parallel({ action: "verify", verificationNotes: "Operator accepts comparable clean evidence" });
    assert.equal((await get()).issue.status, "verified"); assert.equal(await eventCount(), 4);
    const types = await admin.from("dominic_issue_events").select("event_type").eq("issue_id", issue.id); assert.ifError(types.error); assert.deepEqual(types.data.map((event) => event.event_type).sort(), ["maintenance_started", "maintenance_completed", "verification_started", "maintenance_verified"].sort());

    // Failed verification also commits the reopen and its history together.
    await update("dominic_issues", issue.id, { status: "resolved", verified_at: null, metadata: { verificationInspectionId: inspection.id } });
    assert.equal((await post({ action: "verification_failed", verificationNotes: "Operator requires another repair" })).status(), 200);
    assert.equal((await get()).issue.status, "in_progress"); assert.equal(await eventCount(), 5);
  } finally {
    await api.dispose();
    for (const user of users) {
      for (const table of ["dominic_issue_events", "dominic_issues", "dominic_findings", "dominic_inspection_media", "dominic_inspections", "dominic_assets"]) { const result = await admin.from(table).delete().eq("user_id", user.id); assert.ifError(result.error); }
      await admin.auth.admin.deleteUser(user.id);
    }
  }
});
