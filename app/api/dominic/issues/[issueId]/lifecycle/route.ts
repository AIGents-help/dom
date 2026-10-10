import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { loadDominicIssueVerification } from "@/lib/dominicIssueVerificationServer";

export const runtime = "nodejs";

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

async function authenticate(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return { error: "Not authenticated", status: 401 } as const;
  }

  const admin = getSupabaseAdmin();
  const token = authHeader.slice("Bearer ".length);
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) {
    return { error: "Invalid session", status: 401 } as const;
  }

  return { admin, user: data.user } as const;
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ issueId: string }> },
) {
  const auth = await authenticate(req);
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { issueId } = await context.params;
  try {
    const lifecycle = await loadDominicIssueVerification(auth.admin, auth.user.id, issueId);
    if (!lifecycle) {
      return NextResponse.json({ error: "Issue not found." }, { status: 404 });
    }
    return NextResponse.json(lifecycle, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("DOMINIC issue lifecycle load failed", error);
    return NextResponse.json(
      { error: "Issue lifecycle could not be loaded." },
      { status: 500 },
    );
  }
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ issueId: string }> },
) {
  const auth = await authenticate(req);
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { issueId } = await context.params;
  let body: {
    action?: string;
    note?: string;
    workOrder?: string;
    resolutionNotes?: string;
    verificationNotes?: string;
    inspectionId?: string;
  };
  try {
    body = (await req.json()) as typeof body;
    if (!body || typeof body !== "object" || Array.isArray(body) ||
      ["action", "note", "workOrder", "resolutionNotes", "verificationNotes", "inspectionId"].some((key) => {
        const value = (body as Record<string, unknown>)[key]; return value !== undefined && typeof value !== "string";
      })) throw new Error("Invalid body");
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  try {
    const lifecycle = await loadDominicIssueVerification(auth.admin, auth.user.id, issueId);
    if (!lifecycle) {
      return NextResponse.json({ error: "Issue not found." }, { status: 404 });
    }

    const issue = lifecycle.issue;
    const metadata = record(issue.metadata);
    const now = new Date().toISOString();
    const action = body.action;
    let issueValues: Record<string, unknown> = {};
    let event: Record<string, unknown> = {};

    if (action === "start_maintenance") {
      if (!["open", "monitoring", "in_progress"].includes(issue.status)) {
        return NextResponse.json(
          { error: "This issue is not in a state that can start maintenance." },
          { status: 409 },
        );
      }

      const nextMetadata = {
        ...metadata,
        maintenanceLifecycleVersion: 1,
        maintenanceStartedAt:
          typeof metadata.maintenanceStartedAt === "string"
            ? metadata.maintenanceStartedAt
            : now,
        maintenanceStartedNote: body.note?.trim().slice(0, 1200) || null,
        maintenanceWorkOrder: body.workOrder?.trim().slice(0, 160) || null,
        verificationRequired: false,
        verificationStatus: "not_required_yet",
      };

      issueValues = { status: "in_progress", metadata: nextMetadata };

      event = {
        userId: auth.user.id,
        issueId: issue.id,
        eventType: "maintenance_started",
        summary: "Maintenance work started for this tracked issue.",
        details: {
          note: body.note?.trim() || null,
          workOrder: body.workOrder?.trim() || null,
        },
      };
    } else if (action === "complete_maintenance") {
      const resolutionNotes = body.resolutionNotes?.trim() ?? "";
      if (resolutionNotes.length < 5) {
        return NextResponse.json(
          { error: "Describe the maintenance or repair that was completed." },
          { status: 400 },
        );
      }
      if (!["open", "monitoring", "in_progress"].includes(issue.status)) {
        return NextResponse.json(
          { error: "This issue cannot be marked maintenance-complete from its current state." },
          { status: 409 },
        );
      }

      const nextMetadata = {
        ...metadata,
        maintenanceLifecycleVersion: 1,
        maintenanceCompletedAt: now,
        maintenanceAction: resolutionNotes.slice(0, 2000),
        maintenanceWorkOrder:
          body.workOrder?.trim().slice(0, 160) ||
          (typeof metadata.maintenanceWorkOrder === "string"
            ? metadata.maintenanceWorkOrder
            : null),
        verificationRequired: true,
        verificationStatus: "required",
        verificationInspectionId: null,
        verificationStartedAt: null,
        verificationCompletedAt: null,
        verificationAssessment: null,
      };

      issueValues = {
          status: "resolved",
          resolved_at: now,
          verified_at: null,
          resolution_notes: resolutionNotes.slice(0, 2000),
          metadata: nextMetadata,
        };

      event = {
        userId: auth.user.id,
        issueId: issue.id,
        eventType: "maintenance_completed",
        summary: "Maintenance was recorded complete; post-maintenance verification is required.",
        details: {
          resolutionNotes: resolutionNotes.slice(0, 2000),
          workOrder: nextMetadata.maintenanceWorkOrder,
        },
      };
    } else if (action === "verification_started") {
      const inspectionId = body.inspectionId?.trim();
      if (!inspectionId) {
        return NextResponse.json(
          { error: "verification inspectionId is required." },
          { status: 400 },
        );
      }
      if (issue.status !== "resolved") {
        return NextResponse.json(
          { error: "Maintenance must be completed before verification begins." },
          { status: 409 },
        );
      }

      const { data: inspection, error: inspectionError } = await auth.admin
        .from("dominic_inspections")
        .select("id,asset_id")
        .eq("id", inspectionId)
        .eq("user_id", auth.user.id)
        .eq("asset_id", issue.asset_id)
        .maybeSingle();
      if (inspectionError) throw inspectionError;
      if (!inspection) {
        return NextResponse.json(
          { error: "Verification inspection was not found." },
          { status: 404 },
        );
      }

      const nextMetadata = {
        ...metadata,
        verificationRequired: true,
        verificationStatus: "in_progress",
        verificationInspectionId: inspection.id,
        verificationStartedAt: now,
      };
      issueValues = { metadata: nextMetadata };

      event = {
        userId: auth.user.id,
        issueId: issue.id,
        inspectionId: inspection.id,
        eventType: "verification_started",
        summary: "Post-maintenance verification inspection started.",
        details: { inspectionId: inspection.id },
      };
    } else if (action === "verify") {
      if (issue.status !== "resolved") {
        return NextResponse.json(
          { error: "Only a resolved issue awaiting verification can be verified." },
          { status: 409 },
        );
      }
      if (!lifecycle.assessment.canVerify) {
        return NextResponse.json(
          {
            error: "The verification evidence does not support closing this issue yet.",
            assessment: lifecycle.assessment,
          },
          { status: 409 },
        );
      }

      const notes = body.verificationNotes?.trim() ?? "";
      if (notes.length < 3) {
        return NextResponse.json(
          { error: "Add a short operator verification note." },
          { status: 400 },
        );
      }

      const verificationInspectionId =
        typeof metadata.verificationInspectionId === "string"
          ? metadata.verificationInspectionId
          : null;
      const nextMetadata = {
        ...metadata,
        verificationRequired: false,
        verificationStatus: "verified",
        verificationCompletedAt: now,
        verificationNotes: notes.slice(0, 1200),
        verificationAssessment: lifecycle.assessment.status,
      };

      issueValues = {
          status: "verified",
          verified_at: now,
          metadata: nextMetadata,
        };

      event = {
        userId: auth.user.id,
        issueId: issue.id,
        inspectionId: verificationInspectionId,
        eventType: "maintenance_verified",
        summary:
          lifecycle.assessment.status === "cleared"
            ? "Post-maintenance evidence verified the issue as cleared."
            : "Post-maintenance evidence verified the issue as improved and accepted.",
        details: {
          assessment: lifecycle.assessment.status,
          notes: notes.slice(0, 1200),
        },
      };
    } else if (action === "verification_failed") {
      if (issue.status !== "resolved") {
        return NextResponse.json(
          { error: "Only an issue awaiting verification can fail verification." },
          { status: 409 },
        );
      }

      const notes = body.verificationNotes?.trim() ?? "";
      if (notes.length < 3) {
        return NextResponse.json(
          { error: "Describe why verification failed." },
          { status: 400 },
        );
      }

      const verificationInspectionId =
        typeof metadata.verificationInspectionId === "string"
          ? metadata.verificationInspectionId
          : null;
      const nextMetadata = {
        ...metadata,
        priorResolvedAt: issue.resolved_at,
        verificationStatus: "failed",
        verificationFailedAt: now,
        verificationNotes: notes.slice(0, 1200),
        lastVerificationInspectionId: verificationInspectionId,
        verificationInspectionId: null,
        verificationRequired: false,
        maintenanceRestartedAt: now,
      };

      issueValues = {
          status: "in_progress",
          resolved_at: null,
          verified_at: null,
          metadata: nextMetadata,
        };

      event = {
        userId: auth.user.id,
        issueId: issue.id,
        inspectionId: verificationInspectionId,
        eventType: "verification_failed",
        summary: "Post-maintenance verification failed; issue returned to maintenance in progress.",
        details: {
          assessment: lifecycle.assessment.status,
          notes: notes.slice(0, 1200),
        },
      };
    } else {
      return NextResponse.json({ error: "Unsupported lifecycle action." }, { status: 400 });
    }

    const { data: committed, error: commitError } = await auth.admin.rpc("commit_dominic_issue_lifecycle", {
      p_issue_id: issue.id, p_user_id: auth.user.id, p_action: action,
      p_plan: {
        expectedIssueUpdatedAt: issue.updated_at, issueValues, event,
        expectedVerification: ["verify", "verification_failed"].includes(action ?? "") ? {
          inspection: lifecycle.verificationInspection, counts: lifecycle.verificationCounts,
        } : null,
      },
    });
    if (commitError || !committed) {
      return NextResponse.json({ error: "The result could not be verified. Refresh the issue before retrying." }, { status: 500 });
    }
    if (committed.notFound) return NextResponse.json({ error: "Issue not found." }, { status: 404 });
    if (committed.conflict) return NextResponse.json({ error: "The issue or verification evidence changed. Refresh and review it before retrying." }, { status: 409 });

    const updated = await loadDominicIssueVerification(auth.admin, auth.user.id, issueId);
    return NextResponse.json(updated, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("DOMINIC issue lifecycle update failed", error);
    return NextResponse.json(
      { error: "Issue lifecycle could not be updated." },
      { status: 500 },
    );
  }
}
