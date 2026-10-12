"use client";

import { useEffect, useState } from "react";
import { ArrowRight, Check, ClipboardCheck, Crosshair, FileText, FolderOpen, MapPin, Plus, RefreshCw, Search } from "lucide-react";
import { projectHomeDate, projectHomePage, projectHomeStatus, projectPhotoCount, readProjectHome } from "@/lib/dominicProjectHome.mjs";
import type { MappingProject } from "./types";
import styles from "./MappingProjectHome.module.css";

type ProjectRow = MappingProject & { job: { id: string; title: string; location: string | null } | null };

export default function MappingProjectList({ accessToken, onOpenProject, onNewProject, workflowNavigation = false }: {
  accessToken: string; onOpenProject: (id: string, module?: string) => void;
  onNewProject: () => void; workflowNavigation?: boolean;
}) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [page, setPage] = useState(0);
  const [reload, setReload] = useState(0);
  const [result, setResult] = useState<{ token: string; projects: ProjectRow[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    const deadline = setTimeout(() => controller.abort(), 20_000);
    (async () => {
      setLoading(true); setError(""); setResult(null);
      const projects = await readProjectHome(accessToken, controller.signal) as ProjectRow[];
      if (active) setResult({ token: accessToken, projects });
    })().catch((failure) => {
      if (active) setError(controller.signal.aborted ? "Your projects took too long to load. Check your connection and try again."
        : failure instanceof Error ? failure.message : "Your projects could not be loaded. Please try again.");
    }).finally(() => { clearTimeout(deadline); if (active) setLoading(false); });
    return () => { active = false; controller.abort(); clearTimeout(deadline); };
  }, [accessToken, reload]);

  // A new account/token cannot briefly display the old account's project actions.
  const current = result?.token === accessToken ? result : null;
  const projects = current?.projects ?? [];
  const waiting = loading || (!current && !error);
  const visible = projectHomePage(projects, search, filter, page);
  const reset = () => { setSearch(""); setFilter("all"); setPage(0); };

  return <section className={styles.home} aria-label="Project home">
    <div className={styles.topline}><span className={styles.eyebrow}>DOMINIC / YOUR WORK</span><button type="button" className={styles.quiet} disabled={waiting} onClick={() => setReload((n) => n + 1)}><RefreshCw size={14} /> Refresh projects</button></div>
    <header className={styles.header}>
      <div><h1>Your projects</h1><p>Plan the work. Review the evidence. Deliver a clear answer.</p></div>
      <button type="button" onClick={onNewProject} className={styles.primary}><Plus size={17} /> New project</button>
    </header>
    <ol className={styles.path} aria-label="Inspection workflow guide">
      <li><span>01</span><div><strong>Choose a project</strong><small>Find your site and saved work</small></div></li>
      <li><span>02</span><div><strong>Plan & capture</strong><small>Set up the job and collect photos</small></div></li>
      <li><span>03</span><div><strong>Review & report</strong><small>Check findings and prepare the report</small></div></li>
    </ol>
    <div className={styles.libraryHeader}><div><h2>Project library</h2><p>Newest projects first</p></div>
      <label className={styles.search}><Search size={17} /><input aria-label="Search projects" placeholder="Search projects, missions or locations" value={search} maxLength={200} onChange={(event) => { setSearch(event.target.value); setPage(0); }} /></label>
    </div>
    <div className={styles.filters} aria-label="Map processing filters">
      {[["all", "All projects"], ["preparing", "Preparing photos"], ["processing", "Processing maps"], ["completed", "Maps processed"], ["attention", "Processing interrupted"], ["cancelled", "Cancelled processing"]].map(([value, label]) =>
        <button key={value} type="button" aria-pressed={filter === value} onClick={() => { setFilter(value); setPage(0); }}>{label}</button>)}
    </div>
    {waiting ? <div className={styles.empty} role="status"><FolderOpen size={28} /><h2>Loading your projects</h2><p>Your saved work will appear here.</p></div>
      : error ? <div className={styles.error} role="alert"><h2>We couldn&apos;t load your projects</h2><p>{error}</p><button type="button" className={styles.secondary} onClick={() => setReload((n) => n + 1)}>Try again</button></div>
      : !projects.length ? <div className={styles.empty}><FolderOpen size={30} /><h2>Your first project starts here</h2><p>Create a project for a confirmed mission, then bring its plans, photos and inspection work together.</p><button type="button" className={styles.primary} onClick={onNewProject}><Plus size={16} /> Create your first project</button></div>
      : !visible.rows.length ? <div className={styles.empty}><Search size={28} /><h2>No projects match</h2><p>Try another location, project name or processing filter.</p><button type="button" className={styles.secondary} onClick={reset}>Show all projects</button></div>
      : <>
        <div className={styles.cards}>{visible.rows.map((project) => {
          const status = projectHomeStatus(project.status);
          return <article key={project.id} className={styles.card} aria-label={`Project ${project.name}`} data-testid="project-home-card">
            <button type="button" className={styles.openProject} onClick={() => onOpenProject(project.id)}>
              <div className={styles.cardTop}><span className={styles.folder}><FolderOpen size={22} /></span><span className={styles.badge} data-tone={status.tone}>{status.label}</span></div>
              <h3>{project.name}</h3><p className={styles.location}><MapPin size={14} /><span>{project.location_snapshot || project.job?.location || "Location not added"}</span></p>
              <p className={styles.mission}>{project.job?.title || "No linked mission"}</p>
              <div className={styles.metadata}><span>{projectPhotoCount(project.image_count)}</span><span>Created {projectHomeDate(project.created_at)}</span></div>
              <span className={styles.openLabel}>Open project <ArrowRight size={16} /></span>
            </button>
            {workflowNavigation && <div className={styles.cardActions} aria-label={`Next steps for ${project.name}`}>
              <button type="button" onClick={() => onOpenProject(project.id, "Project Records")}><Crosshair size={15} /> Plans</button>
              <button type="button" className={styles.reviewAction} onClick={() => onOpenProject(project.id, "Intelligent Inspection")}><ClipboardCheck size={15} /> Inspections</button>
              <button type="button" onClick={() => onOpenProject(project.id, "Deliverables")}><FileText size={15} /> Exports</button>
            </div>}
          </article>;
        })}</div>
        <nav className={styles.pager} aria-label="Project library pages"><p role="status">{visible.matching} matching projects / page {visible.page + 1} of {visible.pages}</p>{visible.pages > 1 && <><button type="button" className={styles.secondary} disabled={visible.page === 0} onClick={() => setPage(visible.page - 1)}>Previous projects</button><button type="button" className={styles.secondary} disabled={visible.page + 1 === visible.pages} onClick={() => setPage(visible.page + 1)}>Next projects</button></>}</nav>
      </>}
    <footer className={styles.note}><Check size={17} /><p><strong>One project, from capture to report.</strong> Map-processing labels are shown here. Open an inspection to see its findings and review progress.</p></footer>
  </section>;
}
