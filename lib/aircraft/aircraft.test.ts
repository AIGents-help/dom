import { describe,expect,it } from "vitest";
import { SimulatorAircraftAdapter,simulatorCapabilities } from "./simulator";
import { supportsCommand,validateCommand } from "./contract";

describe("DOMINIC universal aircraft interface",()=>{
  it("capability-gates unsupported vendor commands",()=>{
    expect(supportsCommand({...simulatorCapabilities,gimbalControl:false},"setGimbal")).toBe(false);
    expect(validateCommand({...simulatorCapabilities,gimbalControl:false},{type:"setGimbal",pitchDeg:-30}).accepted).toBe(false);
  });
  it("executes the same universal commands through the simulator adapter",async()=>{
    const aircraft=new SimulatorAircraftAdapter({latitude:40,longitude:-75});
    await aircraft.connect();
    expect(aircraft.getState().connected).toBe(true);
    await aircraft.send({type:"takeoff",altitudeFt:30});
    await aircraft.send({type:"goTo",latitude:40.0001,longitude:-75.0001,relativeAltitudeFt:42});
    await aircraft.send({type:"setGimbal",pitchDeg:-25});
    expect(aircraft.getState().relativeAltitudeFt).toBe(42);
    expect(aircraft.getState().gimbalPitchDeg).toBe(-25);
  });
});
