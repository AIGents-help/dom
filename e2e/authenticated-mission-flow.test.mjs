import assert from "node:assert/strict";
import { test } from "node:test";
import { createClient } from "@supabase/supabase-js";
import { chromium, request } from "playwright";

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
    const response = await api.patch(`/api/admin/missions/${mission.id}`, {
      headers: {
        Authorization: `Bearer ${signedIn.session.access_token}`,
        "Content-Type": "application/json",
      },
      data: {
        title: "Schedule Notification Mission",
        requesterName: "Schedule Client",
        requesterEmail: clientEmail,
        company: "Schedule Client",
        serviceType: "aerial_images",
        location: "Schedule Site",
        scope: "",
        status: "assigned",
        quotedAmountCents: null,
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

  const page = await browser.newPage();
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
