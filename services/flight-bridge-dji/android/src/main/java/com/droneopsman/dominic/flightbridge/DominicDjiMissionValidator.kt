package com.droneopsman.dominic.flightbridge

import android.content.Context
import com.dji.wpmzsdk.manager.WPMZManager
import java.io.File

data class DominicDjiMissionValidationReport(
    val valid: Boolean,
    val errors: List<String>,
    val raw: String,
)

/**
 * Generates a temporary DJI KMZ from the reviewed DOMINIC package and runs DJI's own
 * WPMZ static validation against it.
 *
 * This service never uploads a mission to an aircraft and never starts flight.
 */
class DominicDjiMissionValidator(
    context: Context,
) {
    private val appContext = context.applicationContext
    private val exporter = DominicDjiKmzExporter(appContext)

    fun validate(missionJson: String): DominicDjiMissionValidationReport {
        val validationDir = File(appContext.cacheDir, "dominic/mission-validation").apply {
            mkdirs()
        }
        val kmzFile = File.createTempFile("dominic-validation-", ".kmz", validationDir)

        return try {
            val mission = DominicDjiMissionPackage.parse(missionJson)
            exporter.export(mission, kmzFile.absolutePath)

            val check = WPMZManager.getInstance().checkValidation(kmzFile.absolutePath)
            val values = check.getValue()
            val errors = values.map { value -> value.toString() }

            DominicDjiMissionValidationReport(
                valid = values.isEmpty(),
                errors = errors,
                raw = check.toString(),
            )
        } catch (error: Throwable) {
            DominicDjiMissionValidationReport(
                valid = false,
                errors = listOf(error.message ?: error.javaClass.simpleName),
                raw = error.toString(),
            )
        } finally {
            runCatching { kmzFile.delete() }
        }
    }
}
