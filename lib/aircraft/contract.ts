export type AircraftVendor = "simulator" | "dji" | "autel" | "mavlink" | "other";

export type AircraftCapabilities = {
  telemetry: boolean; arm: boolean; takeoff: boolean; goTo: boolean;
  velocityControl: boolean; yawControl: boolean; gimbalControl: boolean;
  photoCapture: boolean; videoCapture: boolean; pauseResume: boolean;
  returnHome: boolean; land: boolean; obstacleSensing: boolean; rtk: boolean;
};

export type UniversalAircraftState = {
  aircraftId: string; vendor: AircraftVendor; model?: string; connected: boolean;
  latitude: number; longitude: number; relativeAltitudeFt: number; headingDeg: number;
  groundSpeedFps?: number; verticalSpeedFps?: number; batteryPercent?: number;
  satellites?: number; gnssQuality?: "unknown"|"poor"|"fair"|"good"|"excellent";
  rtkState?: "unsupported"|"off"|"float"|"fixed"; gimbalPitchDeg: number;
  gimbalYawDeg?: number; cameraMode?: "unknown"|"photo"|"video";
  obstacleAlert?: boolean; flightMode?: string; homeLatitude?: number;
  homeLongitude?: number; failsafe?: string|null; timestampMs: number;
};

export type UniversalMediaCapture = {
  id: string;
  aircraftId: string;
  capturedAtMs: number;
  mimeType: string;
  mediaUrl?: string;
  thumbnailUrl?: string;
  filename?: string;
  checkpointId?: string;
  latitude: number;
  longitude: number;
  relativeAltitudeFt: number;
  headingDeg: number;
  gimbalPitchDeg: number;
  gimbalYawDeg?: number;
};

export type UniversalAircraftCommand =
  | { type:"arm" } | { type:"takeoff"; altitudeFt:number }
  | { type:"goTo"; latitude:number; longitude:number; relativeAltitudeFt:number; speedFps?:number }
  | { type:"setVelocity"; northFps:number; eastFps:number; downFps:number }
  | { type:"setYaw"; headingDeg:number } | { type:"setGimbal"; pitchDeg:number; yawDeg?:number }
  | { type:"capturePhoto"; checkpointId?:string } | { type:"startVideo" } | { type:"stopVideo" }
  | { type:"pause" } | { type:"resume" } | { type:"returnHome" } | { type:"land" }
  | { type:"abort"; reason:string };

export type CommandResult={accepted:boolean;command:UniversalAircraftCommand["type"];message?:string};

export interface DominicAircraftAdapter {
  readonly vendor: AircraftVendor; readonly capabilities: AircraftCapabilities;
  connect():Promise<void>; disconnect():Promise<void>; getState():UniversalAircraftState;
  send(command:UniversalAircraftCommand):Promise<CommandResult>;
  subscribe(listener:(state:UniversalAircraftState)=>void):()=>void;
  subscribeMedia?(listener:(capture:UniversalMediaCapture)=>void):()=>void;
}

export function commandCapability(command:UniversalAircraftCommand["type"]):keyof AircraftCapabilities|null {
  switch(command){
    case "arm":return "arm"; case "takeoff":return "takeoff"; case "goTo":return "goTo";
    case "setVelocity":return "velocityControl"; case "setYaw":return "yawControl";
    case "setGimbal":return "gimbalControl"; case "capturePhoto":return "photoCapture";
    case "startVideo":case "stopVideo":return "videoCapture";
    case "pause":case "resume":return "pauseResume"; case "returnHome":return "returnHome";
    case "land":return "land"; case "abort":return null;
  }
}
export function supportsCommand(c:AircraftCapabilities,command:UniversalAircraftCommand["type"]){
  const key=commandCapability(command); return key===null||c[key];
}
export function validateCommand(c:AircraftCapabilities,command:UniversalAircraftCommand):CommandResult{
  return supportsCommand(c,command.type)
    ? {accepted:true,command:command.type}
    : {accepted:false,command:command.type,message:`Connected aircraft does not support ${command.type} through this adapter.`};
}
