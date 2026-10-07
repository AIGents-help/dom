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

test("DOMINIC keeps the working project across planning and inspection and opens the requested output", { skip: !isolated }, async () => {
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
  try {
    const seed = async (table, row) => {
      const { data, error } = await admin.from(table).insert(row).select("*").single();
      assert.ifError(error);
      return data;
    };
    contractor = await seed("contractors", { user_id: user.id, full_name: "Workflow operator", email, status: "active" });
    await seed("dominic_profiles", { user_id: user.id, plan: "operator", status: "active" });
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
    const fixtureImage = await readFile(new URL("../public/images/dominic-demo/refinery-aerial-v1.webp", import.meta.url));
    const jpeg = await sharp(fixtureImage).resize({ width: 960 }).jpeg({ quality: 80 }).toBuffer();
    const jpegSize = await sharp(jpeg).metadata();
    let previewSequence = 0;
    let sendingPreview = true;
    const previewCommands = [];
    await page.routeWebSocket(/^ws:\/\/127\.0\.0\.1:8787\/?$/, (socket) => {
      const protocol = "dominic.flight-bridge.v1";
      socket.send(JSON.stringify({ type: "hello", protocol, bridgeId: "preview-e2e", adapterVersion: "preview-e2e", vendor: "dji", aircraftId: "preview-aircraft", capabilities: { telemetry: true, cameraPreview: true, photoCapture: false, arm: false, takeoff: false, goTo: false, velocityControl: false, yawControl: false, gimbalControl: false, videoCapture: false, pauseResume: false, returnHome: false, land: false, obstacleSensing: false, rtk: false } }));
      const timer = setInterval(() => {
        if (!sendingPreview) return;
        const id = `browser-preview-${stamp}-${++previewSequence}`;
        socket.send(JSON.stringify({ type: "camera_preview", protocol, sequence: previewSequence, frame: { width: jpegSize.width, height: jpegSize.height, jpegBase64: jpeg.toString("base64"), capture: { id, aircraftId: "preview-aircraft", capturedAtMs: Date.now(), mimeType: "image/jpeg", latitude: 0, longitude: 0, relativeAltitudeFt: 0, headingDeg: 0, gimbalPitchDeg: 0, previewFrame: { width: jpegSize.width, height: jpegSize.height, telemetryAvailable: false } } } }));
      }, 500);
      socket.onMessage((raw) => previewCommands.push(JSON.parse(String(raw))));
      socket.onClose(() => clearInterval(timer));
    });
    await page.goto(`${baseURL}/dominic`, { waitUntil: "networkidle", timeout: 45_000 });
    await page.getByRole("button", { name: "Projects", exact: true }).click();
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
    await page.getByRole("button", { name: "Live Flight", exact: true }).click();
    await page.getByRole("button", { name: "Connect Aircraft Bridge", exact: true }).waitFor();
    await page.getByText("Aircraft disconnected", { exact: true }).waitFor();
    assert.equal(await page.getByRole("textbox", { name: "Capture plan name" }).inputValue(), "Workflow capture plan", "Live Flight must retain saved geometry while opening the camera workspace");
    await page.getByRole("button", { name: "Return to current project", exact: true }).click();
    await page.getByRole("button", { name: "Plans & inspections", exact: true }).click();
    await records.getByRole("button", { name: "Review inspection of Workflow tank", exact: true }).click();
    const intelligent = page.getByRole("region", { name: "Intelligent Inspection", exact: true });
    await intelligent.getByRole("combobox", { name: "Project inspection" }).waitFor();
    assert.equal(await intelligent.getByRole("combobox", { name: "Project inspection" }).inputValue(), inspection.id);
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
    const safeReport = await context.request.get(`${baseURL}/api/dominic/inspections/${inspection.id}/report`, { headers: ownerHeaders });
    assert.equal(safeReport.status(), 200);
    assert.equal((await safeReport.json()).media.find((item) => item.id === hiddenMedia.id).url, null, "forged foreign storage paths must never be signed");
    await intelligent.getByRole("button", { name: "Open asset & capture setup", exact: true }).click();
    await page.getByRole("button", { name: "Review Evidence", exact: true, pressed: true }).waitFor();
    // Actual browser transport -> private storage -> owned inspection row.
    // The photorealistic fixture is a preview, not a physical aircraft test.
    let screenedPreviewFrames = 0;
    // Controlled model response tests frame -> candidate -> callout. This does
    // not claim to validate model accuracy or physical aircraft imagery.
    await page.route(`${baseURL}/api/dominic/inspections/${inspection.id}/analyze-media`, async (route) => {
      const { mediaId } = route.request().postDataJSON();
      const source = await admin.from("dominic_inspection_media").select("id,metadata,user_id,inspection_id").eq("id", mediaId).single();
      assert.ifError(source.error);
      assert.equal(source.data.user_id, user.id);
      assert.equal(source.data.inspection_id, inspection.id);
      assert.equal(source.data.metadata.source, "camera_preview");
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
    await page.getByRole("img", { name: "Current aircraft camera preview", exact: true }).scrollIntoViewIfNeeded();
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
    sendingPreview = false;
    await page.getByText("Preview paused — frame inspection unavailable", { exact: true }).waitFor({ timeout: 8000 });
    assert.equal(await page.getByRole("button", { name: "Inspect this frame", exact: true }).isDisabled(), true);
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
    await page.getByRole("button", { name: "AR View preview", exact: true }).click();
    await page.getByRole("button", { name: "B-07", exact: true }).click();
    await page.getByText("Sample finding: the north face lacks oblique imagery.", { exact: true }).waitFor();
    await page.getByRole("checkbox", { name: "Show prior findings", exact: true }).uncheck();
    await page.getByText("Prior findings hidden. Select an asset to highlight its location.", { exact: true }).waitFor();
    await page.getByRole("button", { name: "AI Copilot preview", exact: true }).click();
    await page.getByRole("button", { name: "Add to sample checklist", exact: true }).click();
    await page.getByRole("heading", { name: "Review the Tank 17 rim", exact: true }).waitFor();
    await page.screenshot({ path: "/tmp/dom-navigation-simulation-desktop.png" });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole("navigation", { name: "DOMINIC field navigation", exact: true }).waitFor({ state: "visible" });
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
    assert.deepEqual(errors, []);
  } finally {
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
    await page.goto(baseURL, { waitUntil: "networkidle" });
    assert.equal(await page.getByRole("link", { name: "Explore DOMINIC", exact: true }).getAttribute("href"), "/dominic/demo");
    await page.goto(`${baseURL}/dominic/demo`, { waitUntil: "networkidle" });
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
