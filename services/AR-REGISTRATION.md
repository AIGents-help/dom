# Calibrated preview registration

`camera_preview.frame.registration` optionally carries `ArRegistration` from
`lib/aircraft/arRegistration.ts`. Old bridge previews do not require this field.
This software interface is not proof of physical camera calibration. Existing
DJI hosts do not yet emit calibrated registration; their overlays remain hidden.

The host must rectify the actual JPEG using measured lens distortion and emit
intrinsics for that exact rectified, resized image. Calibration is bound to the
aircraft, camera source, zoom and pixel dimensions. Recalibrate/invalidate the
profile after changes to lens, focus, crop, stabilization or image processing.
Catalog FOV, aircraft yaw, gimbal pitch and guessed ground height are insufficient.

Camera axes are X right, Y down, Z forward. `worldToCameraRotation` is a row-major
proper rotation transforming world displacement into camera coordinates.
`cameraPositionM` and anchor positions share the same surveyed metric coordinate
frame. GPS coordinates or relative takeoff altitude must not be supplied as
metric vectors. Camera extrinsics include gimbal/body rotation and lever arms.

Pose time must be within 250 ms of the exposure in the same clock domain. Pose
position and orientation error, anchor position error, and maximum calibrated
reprojection error must be measured conservative bounds, not confidence scores
or invented zero values. Their combined projected displacement gates markers.
Frames older than five seconds, mismatched calibration, reflected/scaled pose
matrices, behind-camera/offscreen anchors and excessive uncertainty are hidden.
The decoded JPEG dimensions must match the frame metadata as well.

Anchors may represent surveyed asset points or reviewed finding locations, with
their own provenance maintained by the host. A coordinate frame mismatch hides
the anchor. Projection does not infer occlusion, obstruction clearance, ground
contact, defect confirmation or autonomous-flight safety. Labels are display-only.
No registration function sends an aircraft command or updates an issue.

The projection follows the rectified pinhole camera model described in
[OpenCV calibration documentation](https://docs.opencv.org/5.0/main_modules/calib.html).
Unit fixtures verify math and gating, not physical Matrice 4E alignment. Field
calibration, surveyed target validation and historical image registration remain
separate required work before claiming a complete AR inspection system.
