package com.droneopsman.dominic.flightbridge

import org.json.JSONObject

data class DominicDjiMissionCheckpoint(
    val id: String,
    val sequence: Int,
    val latitude: Double,
    val longitude: Double,
    val relativeAltitudeM: Double,
    val gimbalPitchDeg: Double,
    val takePhoto: Boolean,
)

data class DominicDjiMissionPackage(
    val name: String,
    val missionType: String,
    val centerLatitude: Double,
    val centerLongitude: Double,
    val cruiseSpeedMps: Double,
    val checkpoints: List<DominicDjiMissionCheckpoint>,
) {
    companion object {
        const val SCHEMA = "dominic.dji-mission.v1"

        fun parse(json: String): DominicDjiMissionPackage {
            val root = JSONObject(json)
            require(root.optString("schema") == SCHEMA) {
                "Unsupported DOMINIC DJI mission schema."
            }

            val center = root.getJSONObject("center")
            val flight = root.getJSONObject("flight")
            require(flight.optString("heightMode") == "relativeToStartPoint") {
                "DJI mission package must use relativeToStartPoint height mode."
            }

            val array = root.getJSONArray("checkpoints")
            require(array.length() >= 2) {
                "DJI waypoint mission requires at least 2 checkpoints."
            }

            val checkpoints = buildList {
                for (index in 0 until array.length()) {
                    val point = array.getJSONObject(index)
                    val latitude = point.getDouble("latitude")
                    val longitude = point.getDouble("longitude")
                    val altitude = point.getDouble("relativeAltitudeM")

                    require(latitude in -90.0..90.0) { "Invalid checkpoint latitude." }
                    require(longitude in -180.0..180.0) { "Invalid checkpoint longitude." }
                    require(altitude >= 0.0) { "Checkpoint altitude cannot be negative." }

                    add(
                        DominicDjiMissionCheckpoint(
                            id = point.optString("id", "wp-${index + 1}"),
                            sequence = point.optInt("sequence", index + 1),
                            latitude = latitude,
                            longitude = longitude,
                            relativeAltitudeM = altitude,
                            gimbalPitchDeg = point.optDouble("gimbalPitchDeg", -90.0),
                            takePhoto = point.optBoolean("takePhoto", true),
                        ),
                    )
                }
            }

            return DominicDjiMissionPackage(
                name = root.optString("name", "DOMINIC Mission"),
                missionType = root.optString("missionType", "waypoint"),
                centerLatitude = center.getDouble("latitude"),
                centerLongitude = center.getDouble("longitude"),
                cruiseSpeedMps = flight.optDouble("cruiseSpeedMps", 5.0).coerceIn(1.0, 15.0),
                checkpoints = checkpoints.sortedBy { it.sequence },
            )
        }
    }
}
