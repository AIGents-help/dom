import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';
import { chromium } from 'playwright';

const enabled = process.env.E2E_ISOLATED_SUPABASE === 'true';
const base = process.env.E2E_BASE_URL || 'http://127.0.0.1:3000';
const db = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
const tile = '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#ccd4d7"/><path d="M0 128H256M128 0V256" stroke="#adbcc3"/><text x="16" y="32" font-size="16" fill="#43535f">Synthetic test imagery</text></svg>';

async function fits(page, workspace, width, stage) {
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.screenshot({path:`/tmp/dom-capture-planner-${stage}-${width}.png`,fullPage:true});
  const layout = await page.evaluate(() => ({ width:innerWidth, scroll:document.documentElement.scrollWidth }));
  assert.ok(layout.scroll <= layout.width + 1, `${stage} fits ${width}px: ${JSON.stringify(layout)}`);
  const clipped = await workspace.locator('button,input,select,h1,h2,p').evaluateAll(nodes => nodes.filter(node => {
    const rect = node.getBoundingClientRect();
    return rect.width && rect.height && !node.closest('[aria-label="DOMINIC satellite mission planning map"]') && (rect.right > innerWidth + 1 || rect.left < -1);
  }).map(node => ({ tag:node.tagName,text:node.textContent.slice(0,60),right:node.getBoundingClientRect().right })));
  assert.deepEqual(clipped, [], 'Planner controls are not clipped by the shell');
  const smallText = await workspace.locator('*').evaluateAll(nodes => nodes.filter(node => {
    const rect = node.getBoundingClientRect();
    return rect.width && rect.height && node.textContent.trim() && getComputedStyle(node).fontSize && parseFloat(getComputedStyle(node).fontSize) < 12;
  }).map(node => ({tag:node.tagName,text:node.textContent.slice(0,60),size:getComputedStyle(node).fontSize})));
  assert.deepEqual(smallText, [], 'Planner labels stay readable');
}

for (const width of [1440,390,320]) test(`capture planner: location → boundary → waypoint edit → saved record → export at ${width}px`, {skip:!enabled,timeout:180000}, async () => {
  assert.ok(db && anon && service);
  for (const host of [db,base]) assert.match(host,/^https?:\/\/(127\.0\.0\.1|localhost)(:|\/)/,'Disposable local stack only');
  const admin = createClient(db,service,{auth:{persistSession:false}});
  const stamp = `${Date.now()}-${width}`;
  const email = `planner-${stamp}@e2e.dom.invalid`, password = `Planner-${stamp}!Aa1`;
  const {data:created,error:createError} = await admin.auth.admin.createUser({email,password,email_confirm:true});
  assert.ifError(createError); const user = created.user;
  let browser,context,page,contractor,mission,job,project;
  const seed = async (table,row) => { const {data,error} = await admin.from(table).insert(row).select('*').single(); assert.ifError(error); return data; };
  const readPlan = async name => { const {data,error} = await admin.from('dominic_capture_plans').select('*').eq('user_id',user.id).eq('name',name).single(); assert.ifError(error); return data; };
  try {
    contractor = await seed('contractors',{user_id:user.id,full_name:'Capture Planner Tester',email,status:'active'});
    await seed('dominic_profiles',{user_id:user.id,plan:'organization',status:'active'});
    mission = await seed('mission_requests',{requester_name:'UI Test Client',requester_email:email,service_type:'aerial_images',location:'Software acceptance fixture',status:'approved'});
    job = await seed('jobs',{mission_request_id:mission.id,title:'Planner test mission',service_type:'aerial_images',location:'Software acceptance fixture',status:'scheduled'});
    project = await seed('mapping_projects',{job_id:job.id,contractor_id:contractor.id,name:`Planner walkthrough ${width}`,status:'draft',image_count:0});
    const client = createClient(db,anon,{auth:{persistSession:false}});
    const {data:login,error:loginError} = await client.auth.signInWithPassword({email,password}); assert.ifError(loginError);
    browser = await chromium.launch({headless:true});
    context = await browser.newContext({viewport:{width,height:width===1440?1080:844},isMobile:width<700,hasTouch:width<700,acceptDownloads:true});
    await context.addInitScript(({key,session}) => localStorage.setItem(key,JSON.stringify(session)),{key:`sb-${new URL(db).hostname.split('.')[0]}-auth-token`,session:login.session});
    page = await context.newPage(); page.setDefaultTimeout(15000);
    const errors = []; page.on('pageerror',error => errors.push(error.message));
    // Search and imagery are deterministic UI fixtures. Saves/reopens use real
    // authenticated RLS-protected records in the disposable Supabase stack.
    await page.route('https://server.arcgisonline.com/**',route => route.fulfill({contentType:'image/svg+xml',body:tile}));
    let searchMode = 'error';
    await page.route('**/api/geocode?*',route => route.fulfill({status:searchMode==='error'?503:200,contentType:'application/json',body:JSON.stringify(searchMode==='error'?{error:'Test search interruption'}:searchMode==='empty'?{results:[]}:searchMode==='malformed'?{}:{results:[{latitude:39.8265,longitude:-75.4235,label:'Linwood — synthetic planner test site'},{latitude:39.81,longitude:-75.41,label:'Alternate synthetic site'}]})}));
    await page.goto(`${base}/dominic`,{waitUntil:'domcontentloaded'});
    const consent = page.getByRole('region',{name:'Cookie consent',exact:true});
    await consent.getByRole('button',{name:'Essential Only',exact:true}).click();
    await consent.waitFor({state:'hidden'});
    const nav = page.getByRole('navigation',{name:width<700?'DOMINIC field navigation':'DOMINIC navigation',exact:true});
    await nav.getByRole('button',{name:'Capture plans',exact:true}).click();
    const workspace = page.getByRole('region',{name:'Capture planning workspace',exact:true});
    await workspace.getByRole('heading',{name:'Capture plans',exact:true}).waitFor();
    await workspace.getByLabel('Capture plan project').selectOption(project.id);
    assert.equal(await workspace.getByRole('button',{name:'Use aircraft location',exact:true}).isEnabled(),false);
    assert.equal(await workspace.getByRole('button',{name:'Define Mapping Area',exact:true}).isEnabled(),false);
    const steps = workspace.getByRole('navigation',{name:'Capture planning steps',exact:true});
    await steps.getByRole('button',{name:/Find a location/}).click();
    assert.equal(await steps.locator('[aria-current="step"]').count(),1);
    await fits(page,workspace,width,'start');
    const search = workspace.getByLabel('Search address or place');
    await search.fill('Linwood PA');
    await workspace.getByRole('button',{name:'Find location',exact:true}).click();
    await workspace.getByRole('alert').filter({hasText:'Test search interruption'}).waitFor();
    for (const mode of ['empty','malformed']) {
      searchMode = mode;
      await workspace.getByRole('button',{name:'Find location',exact:true}).click();
      await workspace.getByRole('alert').filter({hasText:mode==='empty'?'No matching location':'incomplete'}).waitFor();
    }
    searchMode = 'success';
    await workspace.getByRole('button',{name:'Find location',exact:true}).click();
    await workspace.getByRole('button',{name:'Linwood — synthetic planner test site',exact:true}).click();
    await workspace.getByText('Planning location: Linwood — synthetic planner test site',{exact:true}).waitFor();
    await workspace.getByRole('button',{name:'Define Mapping Area',exact:true}).click();
    assert.equal(await workspace.getByRole('button',{name:'Finish Area (0)',exact:true}).isEnabled(),false);
    const map = workspace.getByRole('region',{name:'DOMINIC satellite mission planning map',exact:true});
    await map.scrollIntoViewIfNeeded();
    const bounds = await map.boundingBox(); assert.ok(bounds);
    const tap = async (x,y) => width<700 ? page.touchscreen.tap(bounds.x+bounds.width*x,bounds.y+bounds.height*y) : page.mouse.click(bounds.x+bounds.width*x,bounds.y+bounds.height*y);
    await tap(.2,.3); await tap(.65,.3);
    assert.equal(await workspace.getByRole('button',{name:'Finish Area (2)',exact:true}).isEnabled(),false);
    await workspace.getByRole('button',{name:'Undo last corner',exact:true}).click();
    await workspace.getByRole('button',{name:'Finish Area (1)',exact:true}).waitFor();
    await map.scrollIntoViewIfNeeded();
    const refreshed = await map.boundingBox(); Object.assign(bounds,refreshed);
    await tap(.65,.3); await tap(.65,.65); await tap(.2,.65);
    await workspace.getByRole('button',{name:'Finish Area (4)',exact:true}).click();
    await workspace.getByText('Draft route calculated',{exact:true}).waitFor();
    await workspace.getByRole('button',{name:/Map \/ Satellite/}).click();
    await workspace.getByText('Draft route calculated',{exact:true}).waitFor();
    if (width === 1440) {
      await page.route('https://server.arcgisonline.com/**', route => route.abort('failed'), {times:1});
    }
    await workspace.getByRole('button',{name:'Zoom in',exact:true}).click();
    if (width === 1440) {
      await workspace.getByRole('alert').filter({hasText:'Satellite imagery could not load'}).waitFor();
      await workspace.getByRole('button',{name:'Retry satellite imagery',exact:true}).click();
      await workspace.getByRole('alert').filter({hasText:'Satellite imagery could not load'}).waitFor({state:'hidden'});
    }
    await workspace.getByRole('button',{name:'Zoom out',exact:true}).click();
    await workspace.getByRole('button',{name:'Recenter site',exact:true}).click();
    await workspace.getByRole('button',{name:'Fit flight path',exact:true}).click();
    await workspace.getByLabel('Select waypoint to edit').selectOption({index:1});
    const lat = workspace.getByLabel('Waypoint latitude'), lon = workspace.getByLabel('Waypoint longitude');
    const editedLatitude = Number(await lat.inputValue()) + .00001;
    await lat.fill(editedLatitude.toFixed(6)); await lat.press('Enter');
    await workspace.getByRole('spinbutton',{name:/^Flight altitude/}).fill('65');
    await workspace.getByRole('spinbutton',{name:/^Image overlap/}).fill('80');
    const name = `Capture walkthrough ${width}`;
    await workspace.getByLabel('Capture plan name').fill(name);
    await fits(page,workspace,width,'route');
    // Failed save retains the draft and its edits, then retry persists it.
    await page.route('**/rest/v1/dominic_capture_plans*',async route => {
      if(route.request().method()==='POST') { await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({message:'Test save interruption'})}); return; }
      await route.fallback();
    },{times:1});
    await workspace.getByRole('button',{name:'Save Plan',exact:true}).click();
    await workspace.getByRole('alert').filter({hasText:'The save could not be completed'}).waitFor();
    assert.equal(await workspace.getByLabel('Capture plan name').inputValue(),name);
    await workspace.getByRole('button',{name:'Save Plan',exact:true}).click();
    await workspace.getByText('Capture plan saved.',{exact:true}).waitFor();
    await workspace.getByText('All planning changes saved',{exact:true}).waitFor();
    const saved = await readPlan(name);
    assert.equal(saved.plan_state.mapAreaPoints.length,4);
    assert.equal(saved.plan_state.mappingProjectId,project.id);
    assert.equal(saved.plan_state.patternAltitudeFt,65);
    assert.equal(saved.plan_state.patternOverlapPct,80);
    assert.ok(Math.abs(Object.values(saved.plan_state.waypointOverrides)[0].latitude - editedLatitude)<.000002);
    assert.equal(await workspace.getByRole('button',{name:'Fly Mission',exact:true}).isEnabled(),false);
    assert.match(await workspace.getByTestId('preflight-inspection-requirements').innerText(),/No inspection sensor requirements/);
    const djiStatus = await workspace.getByTestId('preflight-dji-mission-validation').innerText();
    assert.match(djiStatus,/Connect an aircraft/); assert.match(djiStatus,/!/); assert.doesNotMatch(djiStatus,/✓/);
    await fits(page,workspace,width,'saved');
    const downloadPromise = page.waitForEvent('download');
    await workspace.getByRole('button',{name:'Export Mission',exact:true}).click();
    const download = await downloadPromise;
    assert.match(download.suggestedFilename(),/\.dominic-dji\.json$/);
    const exported = JSON.parse(await readFile(await download.path(),'utf8'));
    assert.equal(exported.schema,'dominic.dji-mission.v1');
    assert.equal(exported.flight.finishAction,'goHome');
    assert.equal(exported.flight.rcLostAction,'goHome');
    assert.ok(exported.checkpoints.some(point=>Math.abs(point.latitude-editedLatitude)<.000002));
    // A second record cannot become the update target by dropdown selection alone.
    const other = await seed('dominic_capture_plans',{user_id:user.id,name:'Other protected draft',mission_type:saved.mission_type,plan_state:saved.plan_state});
    await workspace.getByRole('button',{name:'Reload saved plans',exact:true}).click();
    await workspace.getByText('Saved plans reloaded.',{exact:true}).waitFor();
    await workspace.getByLabel('Saved capture plans').selectOption(other.id);
    await workspace.getByLabel('Capture plan name').fill(`${name} updated`);
    await workspace.getByText('Changes need saving',{exact:true}).waitFor();
    assert.match(await workspace.getByTestId('preflight-plan-saved').innerText(),/Save the current changes/);
    await workspace.getByRole('button',{name:'Update',exact:true}).click();
    await workspace.getByText('Capture plan saved.',{exact:true}).waitFor();
    assert.equal((await readPlan('Other protected draft')).id,other.id);
    assert.equal((await readPlan(`${name} updated`)).id,saved.id);
    // Reopen saved geometry; runtime approvals must still be deliberate.
    await workspace.getByRole('button',{name:'New',exact:true}).click();
    await workspace.getByLabel('Saved capture plans').selectOption(saved.id);
    await workspace.getByRole('button',{name:'Open',exact:true}).click();
    await workspace.getByText('Saved geometry loaded. Review the plan before flight.',{exact:true}).waitFor();
    assert.equal(await workspace.getByRole('button',{name:'Fly Mission',exact:true}).isEnabled(),false);
    await workspace.getByRole('button',{name:'Back to Edit Plan',exact:true}).click();
    await workspace.getByLabel('Select waypoint to edit').selectOption({index:1});
    assert.ok(Math.abs(Number(await workspace.getByLabel('Waypoint latitude').inputValue())-editedLatitude)<.000002);
    // Arrow keys adjust through the map's actual coordinate transform.
    const waypoint = map.getByRole('button',{name:'Waypoint 1',exact:true});
    await waypoint.focus(); await waypoint.press('ArrowRight');
    await workspace.getByText('Changes need saving',{exact:true}).waitFor();
    assert.notEqual(Number(await lon.inputValue()),Object.values(saved.plan_state.waypointOverrides)[0].longitude);
    await workspace.getByRole('button',{name:'Reset Waypoints',exact:true}).click();
    await workspace.getByRole('button',{name:'Update',exact:true}).click();
    await workspace.getByText('Capture plan saved.',{exact:true}).waitFor();
    assert.deepEqual((await readPlan(`${name} updated`)).plan_state.waypointOverrides,{});
    await workspace.getByRole('button',{name:'Back to Edit Plan',exact:true}).click();
    await workspace.getByRole('button',{name:'Aircraft & advanced settings',exact:true}).click();
    await fits(page,workspace,width,'map-advanced');
    await workspace.getByRole('button',{name:'Hide aircraft & advanced settings',exact:true}).click();
    await workspace.getByRole('button',{name:/Local Object/}).click();
    await workspace.getByRole('img',{name:'Local object capture path',exact:true}).waitFor();
    await fits(page,workspace,width,'local');
    await workspace.getByRole('button',{name:'Aircraft & advanced settings',exact:true}).click();
    await fits(page,workspace,width,'object-advanced');
    await workspace.getByRole('button',{name:'Hide aircraft & advanced settings',exact:true}).click();
    await workspace.getByRole('button',{name:/Map \/ Satellite/}).click();
    assert.equal(await workspace.getByText('Draft route calculated',{exact:true}).count(),0,'Switching sources clears the boundary-ready flag');
    await workspace.getByRole('button',{name:/Live Drone/}).click();
    await fits(page,workspace,width,'live');
    assert.deepEqual(errors,[]);
  } finally {
    await page?.screenshot({path:`/tmp/dom-capture-planner-final-${width}.png`,fullPage:true}).catch(() => {});
    await context?.close(); await browser?.close();
    await admin.from('dominic_capture_plans').delete().eq('user_id',user.id);
    if(project) await admin.from('mapping_projects').delete().eq('id',project.id);
    if(job) await admin.from('jobs').delete().eq('id',job.id);
    if(mission) await admin.from('mission_requests').delete().eq('id',mission.id);
    if(contractor) await admin.from('contractors').delete().eq('id',contractor.id);
    await admin.auth.admin.deleteUser(user.id);
  }
});
