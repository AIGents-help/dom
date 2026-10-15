"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, ArrowRight, CheckCircle2, ClipboardCheck, Crosshair, FileText, FolderOpen, Image as ImageIcon, MapPin, Play, Search, ShieldCheck } from "lucide-react";
import DominicBrandLockup from "./DominicBrandLockup";
import DominicNavigation from "./DominicNavigation";
import DominicPreviewEnvironment from "./DominicPreviewEnvironment";
import styles from "./DominicDemo.module.css";

type Finding = { asset: string; title: string; severity: string; confidence: string; note: string };
const findings: Finding[] = [
  { asset: "Tank 17", title: "Coating wear on east rim", severity: "Medium", confidence: "87%", note: "Review close-range evidence before assigning repair." },
  { asset: "Transfer line", title: "Support bracket needs review", severity: "Medium", confidence: "82%", note: "Confirm bracket condition during the next inspection." },
  { asset: "Building B-07", title: "North-face coverage gap", severity: "Low", confidence: "96%", note: "Add an oblique pass before closing the inspection." },
];
const projects = [
  { id: "refinery", name: "Demo refinery inspection", location: "Marcus Hook, PA · fictional sample", status: "Needs review", tone: "orange", detail: "3 candidate findings · 1 capture gap", live: true },
  { id: "roof", name: "Warehouse roof survey", location: "Philadelphia, PA · fictional sample", status: "Report available", tone: "green", detail: "42 source photos · review complete", live: false },
  { id: "site", name: "Construction progress", location: "Wilmington, DE · fictional sample", status: "Photos uploaded", tone: "blue", detail: "68 source photos · map not processed", live: false },
];
const previews = new Set(["Live Flight", "AR View", "AI Copilot"]);
const projectModules = new Set(["Project Records", "Intelligent Inspection", "Data Library", "Deliverables", "Map Viewer", "Processing"]);

export default function DominicDemo() {
  const [module, setModule] = useState("Projects");
  const [projectOpen, setProjectOpen] = useState(false);
  const [findingIndex, setFindingIndex] = useState(0);
  const finding = findings[findingIndex];
  const openProject = (next = "Project Records") => { setProjectOpen(true); setModule(next); };
  const navigate = (next: string) => {
    if (next === "Projects") { setProjectOpen(false); setModule("Projects"); return; }
    if (projectModules.has(next) && !projectOpen) { openProject(next); return; }
    setModule(next);
  };

  return <div className={styles.shell}>
    <header className={styles.header}>
      <Link href="/" aria-label="DOM homepage" className={styles.brand}><DominicBrandLockup /></Link>
      <div className={styles.headerActions}>
        <span className={styles.sampleFlag}>VIEW-ONLY SAMPLE</span>
        <Link href="/dominic" className={styles.headerButton}>Open my workspace</Link>
        <Link href="/dominic/licensing" className={styles.headerButton}>Free & Premium access</Link>
      </div>
    </header>
    <div className={styles.layout}>
      <aside className={styles.sidebar}>
        <div className={styles.desktopNav}><DominicNavigation demoMode activeModule={module} hasProject={projectOpen} collapsed={false} onOpen={navigate} /></div>
        <details className={styles.mobileNav}><summary>Browse sample tools</summary><div className={styles.mobileNavBody}><DominicNavigation demoMode activeModule={module} hasProject={projectOpen} collapsed={false} onOpen={navigate} /></div></details>
      </aside>
      <main className={styles.main}>
        <div className={styles.demoNotice}><ShieldCheck size={17} /><div><strong>Explore DOMINIC without an account.</strong><span> Fictional data only. Uploads, saving, aircraft control and purchases are disabled.</span></div></div>
        {previews.has(module) ? <div className={styles.previewWrap}><DominicPreviewEnvironment module={module as "Live Flight" | "AR View" | "AI Copilot"} onOpen={navigate} /></div>
        : module === "Projects" ? <ProjectHome onOpen={openProject} />
        : module === "Capture Planner" ? <CapturePlan onOpenProject={() => openProject("Project Records")} />
        : module === "Project Records" ? <ProjectOverview onBack={() => navigate("Projects")} onOpen={navigate} />
        : module === "Asset Intelligence" ? <InspectionLibrary onOpen={(index) => { setFindingIndex(index); openProject("Intelligent Inspection"); }} />
        : module === "Intelligent Inspection" ? <EvidenceReview finding={finding} onSelect={setFindingIndex} />
        : module === "Data Library" ? <PhotoLibrary />
        : module === "Deliverables" ? <ReportPreview />
        : module === "Map Viewer" ? <MapWorkspace />
        : module === "Processing" ? <Processing />
        : <OperationsSample onFlight={() => setModule("Live Flight")} />}
      </main>
    </div>
  </div>;
}

function ProjectHome({ onOpen }: { onOpen: (module?: string) => void }) {
  return <section className={styles.workspace} aria-label="Sample project home">
    <div className={styles.eyebrow}>DOMINIC / YOUR WORK</div>
    <div className={styles.titleRow}><div><h1>Your projects</h1><p>Plan the work. Review the evidence. Deliver a clear answer.</p></div><button type="button" className={styles.primary} onClick={() => onOpen("Project Records")}>Explore sample project <ArrowRight size={16} /></button></div>
    <ol className={styles.path}>
      <li><b>01</b><div><strong>Choose a project</strong><span>Find the site and saved work</span></div></li>
      <li><b>02</b><div><strong>Plan & capture</strong><span>Set up the job and collect photos</span></div></li>
      <li><b>03</b><div><strong>Review & report</strong><span>Check findings and prepare the report</span></div></li>
    </ol>
    <div className={styles.libraryRow}><div><h2>Project library</h2><p>Fictional examples showing different stages</p></div><label className={styles.search}><Search size={16} /><input aria-label="Search sample projects" placeholder="Search projects or locations" disabled /></label></div>
    <div className={styles.projectCards}>{projects.map((project) => <article className={styles.projectCard} key={project.id} data-testid="demo-project-card">
      <div className={styles.cardVisual}>{project.id === "refinery" ? <Image src="/images/dominic-demo/refinery-aerial-v1.webp" alt="" fill sizes="(max-width: 760px) 100vw, 33vw" /> : <div className={styles.placeholderVisual}><FolderOpen size={28} /></div>}</div>
      <div className={styles.cardBody}>
        <div className={styles.cardTop}><span className={styles.projectIcon}><FolderOpen size={18} /></span><span className={styles.badge} data-tone={project.tone}>{project.status}</span></div>
        <h3>{project.name}</h3><p className={styles.location}><MapPin size={14} />{project.location}</p><p className={styles.detail}>{project.detail}</p>
        {project.live ? <div className={styles.cardButtons}><button type="button" onClick={() => onOpen("Project Records")}>Open project <ArrowRight size={15} /></button><button type="button" onClick={() => onOpen("Intelligent Inspection")}>Inspections</button></div> : <p className={styles.sampleOnly}>Sample card · walkthrough uses the refinery project</p>}
      </div>
    </article>)}</div>
    <div className={styles.truthNote}><CheckCircle2 size={17} /><p><strong>Same workflow, sample data.</strong> This public demo follows the current DOMINIC experience instead of a separate legacy showcase.</p></div>
  </section>;
}

function ProjectOverview({ onBack, onOpen }: { onBack: () => void; onOpen: (module: string) => void }) {
  return <section className={styles.workspace} aria-label="Sample project overview">
    <button className={styles.back} onClick={onBack}><ArrowLeft size={15} /> All projects</button>
    <div className={styles.projectHero}><div><div className={styles.eyebrow}>SAMPLE PROJECT</div><h1>Demo refinery inspection</h1><p>Move from planning to evidence review without hunting through unrelated controls.</p></div><span className={styles.badge} data-tone="orange">3 findings need review</span></div>
    <div className={styles.projectOverviewGrid}>
      <article className={styles.overviewCard}><Crosshair size={22} /><span>01</span><h2>Capture plan</h2><p>Review the planned area, altitude, overlap and route.</p><button onClick={() => onOpen("Capture Planner")}>Open capture plan <ArrowRight size={15} /></button></article>
      <article className={styles.overviewCard}><ClipboardCheck size={22} /><span>02</span><h2>Inspection review</h2><p>Review candidate conditions alongside the source evidence.</p><button onClick={() => onOpen("Intelligent Inspection")}>Review findings <ArrowRight size={15} /></button></article>
      <article className={styles.overviewCard}><FileText size={22} /><span>03</span><h2>Report</h2><p>Preview what the customer receives after human review.</p><button onClick={() => onOpen("Deliverables")}>Open report <ArrowRight size={15} /></button></article>
    </div>
    <div className={styles.imageStrip}><Image src="/images/dominic-demo/refinery-aerial-v1.webp" alt="Fictional refinery project overview" fill sizes="100vw" /></div>
  </section>;
}

function CapturePlan({ onOpenProject }: { onOpenProject: () => void }) {
  return <section className={styles.workspace} aria-label="Sample capture planner">
    <div className={styles.eyebrow}>CAPTURE PLANNER / VIEW-ONLY SAMPLE</div>
    <div className={styles.titleRow}><div><h1>Guided capture plan</h1><p>Location → inspection area → route → saved review.</p></div><button className={styles.secondary} onClick={onOpenProject}>Open sample project</button></div>
    <ol className={styles.planSteps}>{["Location","Inspection area","Route","Review"].map((label,index)=><li key={label} data-active={index===2}><b>0{index+1}</b><div><strong>{label}</strong><span>{index===2 ? "Adjust waypoints and capture settings" : index<2 ? "Complete" : "Next step"}</span></div></li>)}</ol>
    <div className={styles.planGrid}>
      <div className={styles.planMap}><Image src="/images/dominic-demo/refinery-aerial-v1.webp" alt="Sample capture area over refinery" fill sizes="(max-width: 900px) 100vw, 65vw" />{[["1","18%","66%"],["2","34%","48%"],["3","52%","35%"],["4","70%","42%"],["5","80%","61%"]].map(([label,left,top])=><span key={label} className={styles.waypoint} style={{left,top}}>{label}</span>)}<span className={styles.routeLabel}>5-waypoint sample route</span></div>
      <aside className={styles.settings}><h2>Capture settings</h2><label>Planned altitude<input value="120 ft" readOnly /></label><label>Front overlap<input value="75%" readOnly /></label><label>Side overlap<input value="70%" readOnly /></label><label>Camera angle<input value="-35°" readOnly /></label><div className={styles.readyBox}><CheckCircle2 size={18} /><div><strong>Plan ready for pilot review</strong><p>Sample only. No aircraft is connected and no flight is authorized.</p></div></div></aside>
    </div>
  </section>;
}

function InspectionLibrary({ onOpen }: { onOpen: (index: number) => void }) {
  return <section className={styles.workspace} aria-label="Sample inspection library">
    <div className={styles.eyebrow}>SAMPLE PROJECT / INSPECTIONS</div><div className={styles.titleRow}><div><h1>Your inspections</h1><p>Know what needs attention and continue the review.</p></div></div>
    <div className={styles.summaryCards}><article><ClipboardCheck size={19}/><strong>3</strong><span>Need your review</span></article><article><ImageIcon size={19}/><strong>12</strong><span>Evidence photos</span></article><article><FileText size={19}/><strong>0</strong><span>Final reports</span></article></div>
    <div className={styles.inspectionCards}>{findings.map((item,index)=><article key={item.asset} className={styles.inspectionCard}><div className={styles.cardTop}><span className={styles.projectIcon}><ClipboardCheck size={18}/></span><span className={styles.badge} data-tone="orange">Needs your review</span></div><p className={styles.kicker}>Visual inspection</p><h3>{item.asset}</h3><p>{item.title}</p><button onClick={()=>onOpen(index)}>Review findings <ArrowRight size={15}/></button></article>)}</div>
  </section>;
}

function EvidenceReview({ finding, onSelect }: { finding: Finding; onSelect: (index:number)=>void }) {
  return <section className={styles.workspace} aria-label="Sample evidence review">
    <div className={styles.eyebrow}>INTELLIGENT INSPECTION / SAMPLE EVIDENCE</div><div className={styles.titleRow}><div><h1>{finding.asset}</h1><p>Review the photograph before deciding whether the candidate belongs in the report.</p></div><span className={styles.badge} data-tone="orange">Inspector review required</span></div>
    <div className={styles.findingTabs}>{findings.map((item,index)=><button key={item.asset} aria-pressed={item===finding} onClick={()=>onSelect(index)}>{item.asset}</button>)}</div>
    <div className={styles.reviewGrid}>
      <div className={styles.evidencePhoto}><Image src="/images/dominic-demo/refinery-aerial-v1.webp" alt="Sample inspection evidence" fill sizes="(max-width: 900px) 100vw, 66vw" /><span className={styles.findingBox} aria-hidden="true" /><span className={styles.photoTag}>FICTIONAL SOURCE EVIDENCE</span></div>
      <aside className={styles.reviewPanel}><div className={styles.kicker}>CANDIDATE FINDING</div><h2>{finding.title}</h2><dl><div><dt>Priority</dt><dd>{finding.severity}</dd></div><div><dt>Candidate confidence</dt><dd>{finding.confidence}</dd></div><div><dt>Review state</dt><dd>Human decision required</dd></div></dl><label>Note for report<textarea value={finding.note} readOnly /></label><div className={styles.demoDecision}><button disabled>Confirm issue</button><button disabled>Dismiss</button></div><p className={styles.lockedNote}>Decision buttons are disabled in the public sample. Signed-in users can save review decisions.</p></aside>
    </div>
  </section>;
}

function PhotoLibrary() { return <section className={styles.workspace} aria-label="Sample photo library"><div className={styles.eyebrow}>SAMPLE PROJECT / PHOTOS</div><h1>Source evidence</h1><p className={styles.lead}>Keep source photographs tied to the project and inspection instead of treating them as a disconnected gallery.</p><div className={styles.photoGrid}>{[1,2,3,4,5,6].map((n)=><article key={n}><div className={styles.photoThumb}><Image src="/images/dominic-demo/refinery-aerial-v1.webp" alt="" fill sizes="33vw" /></div><strong>Refinery evidence {String(n).padStart(2,"0")}</strong><span>RGB · fictional sample</span></article>)}</div></section>; }
function ReportPreview() { return <section className={styles.workspace} aria-label="Sample report"><div className={styles.eyebrow}>REPORT PREVIEW / SAMPLE</div><div className={styles.titleRow}><div><h1>Demo refinery inspection</h1><p>Only human-reviewed findings should move into the client report.</p></div><button className={styles.secondary} disabled>Export disabled in sample</button></div><div className={styles.reportGrid}>{findings.map((item)=><article key={item.asset}><span>{item.asset}</span><h2>{item.title}</h2><p>{item.severity} priority · Inspector review required</p><div>{item.note}</div></article>)}</div><div className={styles.truthNote}><ShieldCheck size={17}/><p>This fictional report demonstrates structure only. It is not an inspection result or safety determination.</p></div></section>; }
function MapWorkspace() { return <section className={styles.workspace} aria-label="Sample map workspace"><div className={styles.eyebrow}>MAP & 3D / SAMPLE</div><h1>Project spatial view</h1><p className={styles.lead}>Processed projects can bring maps, models and findings into one project workspace.</p><div className={styles.mapPreview}><Image src="/images/dominic-demo/refinery-aerial-v1.webp" alt="Sample refinery mapping view" fill sizes="100vw"/><span className={styles.mapPin}>Tank 17 · review</span></div></section>; }
function Processing() { return <section className={styles.workspace} aria-label="Sample processing status"><div className={styles.eyebrow}>PROCESSING / SAMPLE</div><h1>Mapping outputs</h1><p className={styles.lead}>Map processing is separate from inspection review. Completing one does not certify the other.</p><div className={styles.processRows}>{[["Source photos","84","complete"],["Reconstruction","Complete","complete"],["Inspection review","3 findings","attention"],["Client report","Waiting for review","neutral"]].map(([label,value,tone])=><div key={label}><span>{label}</span><strong>{value}</strong><i data-tone={tone}/></div>)}</div></section>; }
function OperationsSample({ onFlight }: { onFlight:()=>void }) { return <section className={styles.workspace} aria-label="Sample operations"><div className={styles.eyebrow}>OPERATIONS / SIMULATION</div><h1>DOMINIC HUB</h1><p className={styles.lead}>Explore how future dock, route and fleet operations can be organized. This sample does not command aircraft.</p><div className={styles.operationsGrid}><article><Play size={22}/><h2>Simulated route</h2><p>Tank perimeter surveillance · 18 min</p><button onClick={onFlight}>Open flight simulation</button></article><article><ShieldCheck size={22}/><h2>Human control remains explicit</h2><p>Operational autonomy still requires validated hardware, fail-safes and field acceptance.</p></article></div></section>; }
