import test from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { chromium } from 'playwright';

const enabled = process.env.E2E_ISOLATED_SUPABASE === 'true';
const base = process.env.E2E_BASE_URL || 'http://127.0.0.1:3000';
const db = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;

test('inspection workspace uses saved jobs, finds the right evidence and fits mobile', {skip: !enabled, timeout:180000}, async () => {
  assert.ok(db && anon && service);
  assert.match(db, /^https?:\/\/(127\.0\.0\.1|localhost)(:|\/)/);
  assert.match(base, /^https?:\/\/(127\.0\.0\.1|localhost)(:|\/)/);
  const admin = createClient(db, service, {auth:{persistSession:false}});
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
  const email = `inspection-ui-${stamp}@e2e.dom.invalid`, password = `UI-${stamp}!Aa1`;
  const {data: userData, error:userError} = await admin.auth.admin.createUser({email,password,email_confirm:true});
  assert.ifError(userError);
  const userId = userData.user.id;
  let browser, context, projectId, jobId;
  try {
    const {error:contractorError} = await admin.from('contractors').insert({
      user_id:userId,full_name:'UI Acceptance Pilot',email,status:'active',part107_verified:true,
      insurance_verified:true,insurance_provider:'Test only',insurance_policy_number:`UI-${stamp}`,
      insurance_expires_on:'2099-12-31',equipment:'DJI Matrice 4E',can_create_missions:true,subscription_active:true,
    });
    assert.ifError(contractorError);
    const client = createClient(db,anon,{auth:{persistSession:false}});
    const {data:sessionData,error:loginError}=await client.auth.signInWithPassword({email,password});
    assert.ifError(loginError);
    const session=sessionData.session;
    const call=async(path,payload)=>{
      const response=await fetch(`${base}${path}`,{method:'POST',headers:{Authorization:`Bearer ${session.access_token}`,'Content-Type':'application/json'},body:JSON.stringify(payload)});
      const body=await response.json(); assert.equal(response.status,200,JSON.stringify(body)); return body;
    };
    const mission=await call('/api/pilot/missions/create',{
      clientName:'UI Test Client',clientEmail:`client-${stamp}@e2e.dom.invalid`,clientCompany:'Inspection UI Test',
      location:'Local software test only',latitude:0,longitude:0,serviceType:'aerial_images',distanceMiles:5,
      siteComplexity:'simple',urgency:'standard',deliverableTier:'standard',travelDistanceSource:'pilot_google_maps_verified',
    });
    jobId=mission.jobId;
    const project=await call('/api/pilot/mapping/projects',{job_id:jobId,name:'Inspection workspace test'});
    projectId=project.project.id;
    const names=['Tank 02','West pipe rack','Cooling unit','Administration roof','Pump station','Tank 04','Loading bay','North pipe rack','Retired pump','Tank 06','South roof','Water treatment'];
    const statuses=['review','planned','complete','capturing','analyzing','review','complete','planned','cancelled','review','complete','planned'];
    const {data:assets,error:assetError}=await admin.from('dominic_assets').insert(names.map(name=>({user_id:userId,name,asset_type:'equipment',location_label:'Software acceptance fixture'}))).select('id,name');
    assert.ifError(assetError);
    const {data:inspections,error:inspectionError}=await admin.from('dominic_inspections').insert(names.map((name,i)=>({
      user_id:userId,asset_id:assets.find(asset=>asset.name===name).id,mapping_project_id:projectId,
      inspection_type:'visual',status:statuses[i],objective:i===0?'Review coating condition and confirm visible changes.':i===1?'Inspect connections and supports.':'Scheduled visual condition inspection.',
      capture_source:'upload',sensor_modes:['rgb'],
    }))).select('id,asset_id,status');
    assert.ifError(inspectionError);
    const tank=inspections.find(row=>row.asset_id===assets.find(asset=>asset.name==='Tank 02').id);
    browser=await chromium.launch({headless:true});
    context=await browser.newContext({viewport:{width:1440,height:1050}});
    const key=`sb-${new URL(db).hostname.split('.')[0]}-auth-token`;
    await context.addInitScript(({key,session})=>localStorage.setItem(key,JSON.stringify(session)),{key,session});
    const page=await context.newPage(); page.setDefaultTimeout(15000);
    const errors=[]; page.on('pageerror',error=>errors.push(error.message));
    await page.goto(`${base}/dominic`,{waitUntil:'domcontentloaded'});
    const consent=page.getByRole('region',{name:'Cookie consent',exact:true});
    await consent.getByRole('button',{name:'Essential Only',exact:true}).click();
    await consent.waitFor({state:'hidden'});
    await page.getByText('Inspection workspace test',{exact:true}).click();
    const navigation=page.getByRole('navigation',{name:'DOMINIC navigation',exact:true});
    await navigation.getByRole('button',{name:'Intelligent Inspection',exact:true}).click();
    const workspace=page.getByRole('region',{name:'Intelligent Inspection',exact:true});
    await workspace.getByRole('heading',{name:'Your inspections',exact:true}).waitFor();
    await workspace.getByText('12 linked to this project',{exact:true}).waitFor();
    assert.equal(await workspace.getByTestId('inspection-card').count(),9);
    await workspace.getByRole('button',{name:'Next',exact:true}).click();
    await workspace.getByText('12 inspections / page 2 of 2',{exact:true}).waitFor();
    assert.equal(await workspace.getByTestId('inspection-card').count(),3);
    await workspace.getByRole('button',{name:'Previous',exact:true}).click();
    await workspace.getByText('12 inspections / page 1 of 2',{exact:true}).waitFor();
    await page.screenshot({path:'/tmp/dom-inspection-workspace-desktop.png',fullPage:true});

    await workspace.getByRole('button',{name:'Need review',exact:true}).click();
    assert.equal(await workspace.getByTestId('inspection-card').count(),3);
    await workspace.getByLabel('Search inspections').fill('Tank 02');
    assert.equal(await workspace.getByTestId('inspection-card').count(),1);
    await workspace.getByRole('button',{name:'Review findings',exact:true}).click();
    await workspace.getByRole('heading',{name:'Tank 02',exact:true}).waitFor();
    await workspace.getByRole('link',{name:'Preview report',exact:true}).waitFor();
    assert.equal(await workspace.getByLabel('Project inspection').inputValue(),tank.id);
    assert.equal(await workspace.getByRole('link',{name:'Preview report',exact:true}).getAttribute('href'),`/dominic/inspections/${tank.id}/report`);
    await workspace.getByRole('button',{name:'All inspections',exact:true}).click();
    await workspace.getByLabel('Search inspections').fill('not present anywhere');
    await workspace.getByRole('heading',{name:'No inspections match',exact:true}).waitFor();
    await workspace.getByRole('button',{name:'Show all inspections',exact:true}).click();
    await workspace.getByRole('button',{name:'Completed',exact:true}).click();
    assert.equal(await workspace.getByTestId('inspection-card').count(),3);
    assert.equal(await workspace.getByRole('link',{name:/Open report for/}).count(),3);
    await workspace.getByRole('button',{name:'All inspections',exact:true}).click();

    // Read failure must not appear as an empty or healthy project. Retrying recovers.
    const detailUrl=`**/api/pilot/mapping/projects/${projectId}`;
    await page.route(detailUrl, route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Test connection interrupted'})}),{times:1});
    await workspace.getByRole('button',{name:'Refresh inspections',exact:true}).click();
    await workspace.getByRole('alert').waitFor();
    assert.match(await workspace.getByRole('alert').innerText(),/couldn.t load/);
    assert.equal(await workspace.getByTestId('inspection-card').count(),0);
    await workspace.getByRole('button',{name:'Try again',exact:true}).click();
    await workspace.getByText('12 linked to this project',{exact:true}).waitFor();
    await page.setViewportSize({width:390,height:844});
    await page.screenshot({path:'/tmp/dom-inspection-workspace-phone.png',fullPage:true});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'No page-wide horizontal overflow');
    await page.setViewportSize({width:1440,height:1050});
    await workspace.getByLabel('Search inspections').fill('West pipe rack');
    await workspace.getByRole('button',{name:'Set up capture',exact:true}).click();
    await navigation.getByRole('button',{name:'Assets & inspections',exact:true}).waitFor();
    assert.equal(await navigation.getByRole('button',{name:'Assets & inspections',exact:true}).getAttribute('aria-current'),'page');
    assert.deepEqual(errors,[]);
  } finally {
    await context?.close(); await browser?.close();
    if(projectId) await admin.from('mapping_projects').delete().eq('id',projectId);
    if(jobId) await admin.from('jobs').delete().eq('id',jobId);
    await admin.auth.admin.deleteUser(userId);
  }
});
