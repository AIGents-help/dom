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
