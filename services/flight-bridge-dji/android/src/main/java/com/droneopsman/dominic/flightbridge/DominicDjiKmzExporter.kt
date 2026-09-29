package com.droneopsman.dominic.flightbridge

import android.content.Context
import com.dji.wpmzsdk.common.data.Template
import com.dji.wpmzsdk.manager.WPMZManager
import dji.sdk.wpmz.value.mission.ActionTakePhotoParam
import dji.sdk.wpmz.value.mission.CameraLensType
import dji.sdk.wpmz.value.mission.WaylineActionGroup
import dji.sdk.wpmz.value.mission.WaylineActionInfo
import dji.sdk.wpmz.value.mission.WaylineActionNodeList
import dji.sdk.wpmz.value.mission.WaylineActionTreeNode
import dji.sdk.wpmz.value.mission.WaylineActionTrigger
import dji.sdk.wpmz.value.mission.WaylineActionTriggerType
import dji.sdk.wpmz.value.mission.WaylineActionType
import dji.sdk.wpmz.value.mission.WaylineActionsRelationType
import dji.sdk.wpmz.value.mission.WaylineAltitudeMode
import dji.sdk.wpmz.value.mission.WaylineCoordinateMode
import dji.sdk.wpmz.value.mission.WaylineCoordinateParam
import dji.sdk.wpmz.value.mission.WaylineDroneInfo
import dji.sdk.wpmz.value.mission.WaylineExitOnRCLostAction
import dji.sdk.wpmz.value.mission.WaylineExitOnRCLostBehavior
import dji.sdk.wpmz.value.mission.WaylineFinishedAction
import dji.sdk.wpmz.value.mission.WaylineFlyToWaylineMode
import dji.sdk.wpmz.value.mission.WaylineLocationCoordinate2D
import dji.sdk.wpmz.value.mission.WaylineLocationCoordinate3D
import dji.sdk.wpmz.value.mission.WaylineMission
import dji.sdk.wpmz.value.mission.WaylineMissionConfig
import dji.sdk.wpmz.value.mission.WaylinePayloadInfo
import dji.sdk.wpmz.value.mission.WaylinePositioningType
import dji.sdk.wpmz.value.mission.WaylineTemplateWaypointInfo
import dji.sdk.wpmz.value.mission.WaylineWaypoint
import dji.sdk.wpmz.value.mission.WaylineWaypointPitchMode
import dji.sdk.wpmz.value.mission.WaylineWaypointTurnMode
import dji.sdk.wpmz.value.mission.WaylineWaypointYawMode
import dji.sdk.wpmz.value.mission.WaylineWaypointYawParam

/**
 * Converts DOMINIC's vendor-neutral DJI mission package into the KMZ format generated
 * by DJI's own WPMZ SDK. This class only creates a file; it does not upload, start,
 * arm, take off, or otherwise command an aircraft.
 */
class DominicDjiKmzExporter(
    context: Context,
) {
    init {
        WPMZManager.getInstance().init(context.applicationContext)
    }
    fun export(
        mission: DominicDjiMissionPackage,
        outputPath: String,
    ): String {
        require(outputPath.endsWith(".kmz", ignoreCase = true)) {
            "DJI mission output path must end in .kmz"
        }

        val waylineMission = WaylineMission().apply {
            createTime = System.currentTimeMillis().toDouble()
            updateTime = System.currentTimeMillis().toDouble()
        }

        val missionConfig = WaylineMissionConfig().apply {
            flyToWaylineMode = WaylineFlyToWaylineMode.SAFELY
            finishAction = WaylineFinishedAction.GO_HOME
            droneInfo = WaylineDroneInfo()
            securityTakeOffHeight = 20.0
            isSecurityTakeOffHeightSet = true
            exitOnRCLostBehavior = WaylineExitOnRCLostBehavior.EXCUTE_RC_LOST_ACTION
            exitOnRCLostType = WaylineExitOnRCLostAction.GO_BACK
            globalTransitionalSpeed = mission.cruiseSpeedMps
            payloadInfo = ArrayList<WaylinePayloadInfo>()
        }

        val waypoints = mission.checkpoints.mapIndexed { index, checkpoint ->
            WaylineWaypoint().apply {
                waypointIndex = index
                location = WaylineLocationCoordinate2D(
                    checkpoint.latitude,
                    checkpoint.longitude,
                )
                height = checkpoint.relativeAltitudeM
                ellipsoidHeight = checkpoint.relativeAltitudeM
                speed = mission.cruiseSpeedMps
                useGlobalTurnParam = true
                gimbalPitchAngle = checkpoint.gimbalPitchDeg
                useGlobalYawParam = true
            }
        }

        val templateWaypointInfo = WaylineTemplateWaypointInfo().apply {
            this.waypoints = waypoints
            actionGroups = buildPhotoActions(mission)
            globalFlightHeight = mission.checkpoints
                .map { it.relativeAltitudeM }
                .average()
                .coerceAtLeast(1.0)
            isGlobalFlightHeightSet = true
            globalTurnMode =
                WaylineWaypointTurnMode.TO_POINT_AND_STOP_WITH_DISCONTINUITY_CURVATURE
            useStraightLine = true
            isTemplateGlobalTurnModeSet = true
            globalYawParam = WaylineWaypointYawParam().apply {
                yawMode = WaylineWaypointYawMode.FOLLOW_WAYLINE
                poiLocation = WaylineLocationCoordinate3D(
                    mission.centerLatitude,
                    mission.centerLongitude,
                    0.0,
                )
            }
            isTemplateGlobalYawParamSet = true
            pitchMode = WaylineWaypointPitchMode.USE_POINT_SETTING
        }

        val template = Template().apply {
            waypointInfo = templateWaypointInfo
            coordinateParam = WaylineCoordinateParam().apply {
                coordinateMode = WaylineCoordinateMode.WGS84
                positioningType = WaylinePositioningType.GPS
                isWaylinePositioningTypeSet = true
                altitudeMode = WaylineAltitudeMode.RELATIVE_TO_START_POINT
            }
            useGlobalTransitionalSpeed = true
            autoFlightSpeed = mission.cruiseSpeedMps
            payloadParam = ArrayList()
        }

        WPMZManager.getInstance().generateKMZFile(
            outputPath,
            waylineMission,
            missionConfig,
            template,
        )

        return outputPath
    }

    private fun buildPhotoActions(
        mission: DominicDjiMissionPackage,
    ): List<WaylineActionGroup> {
        val groups = ArrayList<WaylineActionGroup>()

        mission.checkpoints.forEachIndexed { index, checkpoint ->
            if (!checkpoint.takePhoto) return@forEachIndexed

            val takePhoto = WaylineActionInfo().apply {
                actionType = WaylineActionType.TAKE_PHOTO
                takePhotoParam = ActionTakePhotoParam(
                    0,
                    true,
                    ArrayList<CameraLensType>(),
                    "DOMINIC",
                ).apply {
                    payloadPositionIndex = 0
                }
            }

            val group = WaylineActionGroup().apply {
                trigger = WaylineActionTrigger().apply {
                    triggerType = WaylineActionTriggerType.REACH_POINT
                }
                groupId = groups.size
                startIndex = index
                endIndex = index
                actions = listOf(takePhoto)
                nodeLists = listOf(
                    WaylineActionNodeList().apply {
                        nodes = listOf(
                            WaylineActionTreeNode().apply {
                                nodeType = WaylineActionsRelationType.SEQUENCE
                                childrenNum = 1
                            },
                        )
                    },
                    WaylineActionNodeList().apply {
                        nodes = listOf(
                            WaylineActionTreeNode().apply {
                                nodeType = WaylineActionsRelationType.LEAF
                                actionIndex = 0
                            },
                        )
                    },
                )
            }
            groups += group
        }

        return groups
    }
}
