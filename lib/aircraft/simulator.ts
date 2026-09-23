import {
  type AircraftCapabilities, type CommandResult, type DominicAircraftAdapter,
  type UniversalAircraftCommand, type UniversalAircraftState, validateCommand,
} from "./contract";

export const simulatorCapabilities:AircraftCapabilities={
  telemetry:true,arm:true,takeoff:true,goTo:true,velocityControl:true,yawControl:true,
  gimbalControl:true,photoCapture:true,videoCapture:true,pauseResume:true,
  returnHome:true,land:true,obstacleSensing:true,rtk:true,
};

export class SimulatorAircraftAdapter implements DominicAircraftAdapter {
  readonly vendor="simulator" as const;
  readonly capabilities=simulatorCapabilities;
  private listeners=new Set<(state:UniversalAircraftState)=>void>();
  private state:UniversalAircraftState;

  constructor(initial?:Partial<UniversalAircraftState>){
    this.state={aircraftId:"dominic-sim-1",vendor:"simulator",model:"DOMINIC Virtual Aircraft",
      connected:false,latitude:39.95,longitude:-75.16,relativeAltitudeFt:0,headingDeg:0,
      batteryPercent:100,satellites:24,gnssQuality:"excellent",rtkState:"fixed",
      gimbalPitchDeg:0,cameraMode:"photo",obstacleAlert:false,flightMode:"STANDBY",
      failsafe:null,timestampMs:Date.now(),...initial};
  }
  async connect(){this.patch({connected:true,flightMode:"READY"});}
  async disconnect(){this.patch({connected:false,flightMode:"DISCONNECTED"});}
  getState(){return {...this.state};}
  subscribe(listener:(state:UniversalAircraftState)=>void){this.listeners.add(listener);listener(this.getState());return()=>this.listeners.delete(listener);}
  async send(command:UniversalAircraftCommand):Promise<CommandResult>{
    const validation=validateCommand(this.capabilities,command); if(!validation.accepted)return validation;
    switch(command.type){
      case "takeoff":this.patch({relativeAltitudeFt:command.altitudeFt,flightMode:"FLYING"});break;
      case "goTo":this.patch({latitude:command.latitude,longitude:command.longitude,relativeAltitudeFt:command.relativeAltitudeFt,flightMode:"FLYING"});break;
      case "setYaw":this.patch({headingDeg:command.headingDeg});break;
      case "setGimbal":this.patch({gimbalPitchDeg:command.pitchDeg,gimbalYawDeg:command.yawDeg});break;
      case "returnHome":this.patch({flightMode:"RETURN_HOME"});break;
      case "land":this.patch({relativeAltitudeFt:0,flightMode:"LANDED"});break;
      case "pause":this.patch({flightMode:"PAUSED"});break;
      case "resume":this.patch({flightMode:"FLYING"});break;
      case "abort":this.patch({flightMode:"ABORTED",failsafe:command.reason});break;
      default:this.patch({});
    }
    return {accepted:true,command:command.type};
  }
  private patch(patch:Partial<UniversalAircraftState>){this.state={...this.state,...patch,timestampMs:Date.now()};for(const l of this.listeners)l(this.getState());}
}
