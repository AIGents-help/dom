package com.droneopsman.dominic.flightbridge

import com.dji.wpmzsdk.manager.WPMZManager
import dji.v5.common.callback.CommonCallbacks
import dji.v5.common.error.IDJIError
import dji.v5.manager.aircraft.waypoint3.WaypointMissionManager
import java.io.File

/**
 * Validates and stages a DOMINIC-generated DJI KMZ without exposing mission execution.
 *
 * Safety boundary:
 * - may inspect/validate a KMZ,
 * - may upload/stage the KMZ to the connected DJI aircraft,
 * - does NOT expose startMission(), arm, takeoff, landing, RTH, camera, gimbal,
 *   or any other aircraft-control command.
 */
class DominicDjiMissionStager {

    data class Inspection(
        val path: String,
        val exists: Boolean,
        val sizeBytes: Long,
        val waylineIds: List<Int>,
        val djiValidationMessage: String,
        val parseSucceeded: Boolean,
        val readyToStage: Boolean,
    )

    sealed class StageStatus {
        data class Inspecting(val path: String) : StageStatus()
        data class Rejected(val inspection: Inspection) : StageStatus()
        data class Uploading(val progress: Double) : StageStatus()
        data class Staged(val inspection: Inspection) : StageStatus()
        data class Failed(
            val inspection: Inspection?,
            val error: IDJIError?,
            val message: String,
        ) : StageStatus()
    }

    /**
     * Run DJI's local KMZ checks before anything is sent to the aircraft.
     *
     * We intentionally keep DJI's validation result as a raw message because the
     * SDK's WaylineCheckErrorMsg shape can evolve independently of DOMINIC.
     * A KMZ is considered stageable only if:
     * - the file exists and is non-empty,
     * - DJI's WPMZ parser can load it,
     * - DJI reports at least one available wayline ID.
     */
    fun inspect(kmzPath: String): Inspection {
        val file = File(kmzPath)
        if (!file.exists() || !file.isFile || file.length() <= 0L) {
            return Inspection(
                path = kmzPath,
                exists = file.exists(),
                sizeBytes = if (file.exists()) file.length() else 0L,
                waylineIds = emptyList(),
                djiValidationMessage = "KMZ file is missing or empty.",
                parseSucceeded = false,
                readyToStage = false,
            )
        }

        return try {
            val validation = WPMZManager.getInstance().checkValidation(kmzPath)
            // Force DJI's parser to read the generated archive as an additional
            // structural check before upload.
            WPMZManager.getInstance().getKMZInfo(kmzPath)

            val waylineIds =
                WaypointMissionManager.getInstance().getAvailableWaylineIDs(kmzPath)

            Inspection(
                path = kmzPath,
                exists = true,
                sizeBytes = file.length(),
                waylineIds = waylineIds,
                djiValidationMessage = validation.toString(),
                parseSucceeded = true,
                readyToStage = waylineIds.isNotEmpty(),
            )
        } catch (error: Throwable) {
            Inspection(
                path = kmzPath,
                exists = true,
                sizeBytes = file.length(),
                waylineIds = emptyList(),
                djiValidationMessage =
                    error.message ?: error.javaClass.simpleName ?: "DJI KMZ validation failed.",
                parseSucceeded = false,
                readyToStage = false,
            )
        }
    }

    /**
     * Upload the KMZ to DJI only after local inspection succeeds.
     *
     * This stages the mission file; it does not start or execute a mission.
     */
    fun stage(
        kmzPath: String,
        onStatus: (StageStatus) -> Unit,
    ) {
        onStatus(StageStatus.Inspecting(kmzPath))

        val inspection = inspect(kmzPath)
        if (!inspection.readyToStage) {
            onStatus(StageStatus.Rejected(inspection))
            return
        }

        WaypointMissionManager.getInstance().pushKMZFileToAircraft(
            kmzPath,
            object : CommonCallbacks.CompletionCallbackWithProgress<Double> {
                override fun onProgressUpdate(progress: Double) {
                    onStatus(StageStatus.Uploading(progress.coerceIn(0.0, 1.0)))
                }

                override fun onSuccess() {
                    onStatus(StageStatus.Staged(inspection))
                }

                override fun onFailure(error: IDJIError) {
                    onStatus(
                        StageStatus.Failed(
                            inspection = inspection,
                            error = error,
                            message = error.toString(),
                        ),
                    )
                }
            },
        )
    }
}
