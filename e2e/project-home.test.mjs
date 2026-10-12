import test from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { chromium } from 'playwright';

const enabled=process.env.E2E_ISOLATED_SUPABASE==='true';
const base=process.env.E2E_BASE_URL||'http://127.0.0.1:3000';
const db=process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const service=process.env.SUPABASE_SERVICE_ROLE_KEY;

test('project home reaches the correct saved inspections, plans and exports on desktop and phone', {skip:!enabled,timeout:180000},async()=>{
  assert.ok(db&&anon&&service);
  for(const host of [db,base]) assert.match(host,/^https?:\/\/(127\.0\.0\.1|localhost)(:|\/)/,'Disposable local environment only');
  const admin=createClient(db,service,{auth:{persistSession:false}});
  const stamp=`${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
  const email=`home-${stamp}@e2e.dom.invalid`,password=`Home-${stamp}!Aa1`;
  const {data:created,error:createError}=await admin.auth.admin.createUser({email,password,email_confirm:true});
  assert.ifError(createError);
  const user=created.user;
  let browser,context,contractor,mission,job;
  const projects=[];
  try {
    const seed=async(table,row)=>{const {data,error}=await admin.from(table).insert(row).select('*').single();assert.ifError(error);return data;};
    contractor=await seed('contractors',{user_id:user.id,full_name:'Project Home Tester',email,status:'active'});
    await seed('dominic_profiles',{user_id:user.id,plan:'organization',status:'active'});
    mission=await seed('mission_requests',{requester_name:'UI Test Client',requester_email:email,service_type:'aerial_images',location:'Software acceptance fixture',status:'approved'});
    job=await seed('jobs',{mission_request_id:mission.id,title:'Industrial site inspection',service_type:'aerial_images',location:'Delaware Valley test site',status:'scheduled'});
    const names=['Tank roof review','East pipe rack','Main warehouse roof','Cooling water station','Loading area survey','South tank farm','West pipe supports','Administration roof','North service road','Storage building','Pump house','Utility corridor','Retired capture'];
    const statuses=['uploaded','draft','completed','processing','failed','uploaded','completed','queued','draft','completed','uploaded','draft','cancelled'];
    for(let i=0;i<names.length;i++) projects.push(await seed('mapping_projects',{
      job_id:job.id,contractor_id:contractor.id,name:names[i],status:statuses[i],image_count:0,
      location_snapshot:i===1?'Linwood test site':'Claymont test site',created_at:new Date(Date.now()-i*60000).toISOString(),
    }));
    const assetA=await seed('dominic_assets',{user_id:user.id,name:'Tank A - home walkthrough',asset_type:'tank'});
    const assetB=await seed('dominic_assets',{user_id:user.id,name:'Pipe B - home walkthrough',asset_type:'equipment'});
    const inspectionA=await seed('dominic_inspections',{user_id:user.id,asset_id:assetA.id,mapping_project_id:projects[0].id,inspection_type:'visual',status:'review',objective:'Check the coating before reporting.'});
    await seed('dominic_inspections',{user_id:user.id,asset_id:assetB.id,mapping_project_id:projects[1].id,inspection_type:'visual',status:'planned',objective:'Collect connection detail photos.'});
    const client=createClient(db,anon,{auth:{persistSession:false}});
    const {data:login,error:loginError}=await client.auth.signInWithPassword({email,password});assert.ifError(loginError);
    browser=await chromium.launch({headless:true});
    context=await browser.newContext({viewport:{width:1440,height:1080}});
    await context.addInitScript(({key,session})=>localStorage.setItem(key,JSON.stringify(session)),{key:`sb-${new URL(db).hostname.split('.')[0]}-auth-token`,session:login.session});
    const page=await context.newPage();page.setDefaultTimeout(15000);
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(`${base}/dominic`,{waitUntil:'domcontentloaded'});
    const consent=page.getByRole('region',{name:'Cookie consent',exact:true});
    await consent.getByRole('button',{name:'Essential Only',exact:true}).click();await consent.waitFor({state:'hidden'});
    const home=page.getByRole('region',{name:'Project home',exact:true});
    const navigation=page.getByRole('navigation',{name:'DOMINIC navigation',exact:true});
    const back=async()=>{await page.getByRole('button',{name:'Return to projects',exact:true}).click();await home.getByTestId('project-home-card').first().waitFor();};
    const card=(name)=>home.getByRole('article',{name:`Project ${name}`,exact:true});
    await home.getByText('13 matching projects / page 1 of 2',{exact:true}).waitFor();
    assert.equal(await home.getByTestId('project-home-card').count(),9);
    await page.screenshot({path:'/tmp/dom-project-home-desktop.png',fullPage:true});
    await home.getByRole('button',{name:'Next projects',exact:true}).click();
    await home.getByText('13 matching projects / page 2 of 2',{exact:true}).waitFor();
    assert.equal(await home.getByTestId('project-home-card').count(),4);
    await home.getByLabel('Search projects').fill('Linwood');
    await home.getByText('1 matching projects / page 1 of 1',{exact:true}).waitFor();
    assert.equal(await home.getByTestId('project-home-card').count(),1);
    await home.getByRole('button',{name:'Maps processed',exact:true}).click();
    await home.getByRole('heading',{name:'No projects match',exact:true}).waitFor();
    await home.getByRole('button',{name:'Show all projects',exact:true}).click();
    await home.getByRole('button',{name:'Processing interrupted',exact:true}).click();
    await card('Loading area survey').waitFor();assert.equal(await home.getByTestId('project-home-card').count(),1);
    await home.getByRole('button',{name:'All projects',exact:true}).click();

    await card(names[0]).getByRole('button',{name:'Inspections',exact:true}).click();
    const inspection=page.getByRole('region',{name:'Intelligent Inspection',exact:true});
    await inspection.getByRole('heading',{name:assetA.name,exact:true}).waitFor();
    assert.equal(await navigation.getByRole('button',{name:'Intelligent Inspection',exact:true}).getAttribute('aria-current'),'page');
    await inspection.getByRole('button',{name:'Review findings',exact:true}).click();
    await inspection.getByRole('link',{name:'Preview report',exact:true}).waitFor();
    assert.equal(await inspection.getByLabel('Project inspection').inputValue(),inspectionA.id);
    await back();
    await card(names[1]).getByRole('button',{name:'Inspections',exact:true}).click();
    await inspection.getByRole('heading',{name:assetB.name,exact:true}).waitFor();
    assert.equal(await inspection.getByRole('heading',{name:assetA.name,exact:true}).count(),0,'Changing the project must not show the previous project inspection');
    await back();
    await card(names[0]).getByRole('button',{name:'Plans',exact:true}).click();
    await page.getByRole('region',{name:'Project plans and inspections',exact:true}).waitFor();
    assert.equal(await navigation.getByRole('button',{name:'Plans & inspections',exact:true}).getAttribute('aria-current'),'page');
    await back();
    await card(names[0]).getByRole('button',{name:'Exports',exact:true}).click();
    await page.locator('#dominic-deliverables').waitFor({state:'visible'});
    assert.equal(await navigation.getByRole('button',{name:'Reports & exports',exact:true}).getAttribute('aria-current'),'page');
    await back();

    const url=`${base}/api/pilot/mapping/projects`;
    await page.route(url,route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Test connection interrupted'})}),{times:1});
    await home.getByRole('button',{name:'Refresh projects',exact:true}).click();
    await home.getByRole('alert').waitFor();assert.equal(await home.getByTestId('project-home-card').count(),0);
    assert.equal(await home.getByRole('heading',{name:'Your first project starts here',exact:true}).count(),0);
    await home.getByRole('button',{name:'Try again',exact:true}).click();
    await home.getByText('13 matching projects / page 1 of 2',{exact:true}).waitFor();
    await page.route(url,route=>route.abort('failed'),{times:1});
    await home.getByRole('button',{name:'Refresh projects',exact:true}).click();
    await home.getByRole('alert').waitFor();assert.equal(await home.getByTestId('project-home-card').count(),0);
    await home.getByRole('button',{name:'Try again',exact:true}).click();
    await home.getByText('13 matching projects / page 1 of 2',{exact:true}).waitFor();
    await page.route(url,route=>route.fulfill({status:200,contentType:'application/json',body:'{}'}),{times:1});
    await home.getByRole('button',{name:'Refresh projects',exact:true}).click();
    await home.getByRole('alert').waitFor();assert.equal(await home.getByTestId('project-home-card').count(),0);
    await home.getByRole('button',{name:'Try again',exact:true}).click();
    await home.getByText('13 matching projects / page 1 of 2',{exact:true}).waitFor();

    for(const width of [390,320]) {
      await page.setViewportSize({width,height:844});
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`Project home fits ${width}px`);
    }
    await page.setViewportSize({width:390,height:844});
    await page.screenshot({path:'/tmp/dom-project-home-phone.png'});
    await card(names[1]).getByRole('button',{name:'Inspections',exact:true}).click();
    await inspection.getByRole('heading',{name:assetB.name,exact:true}).waitFor();
    await page.screenshot({path:'/tmp/dom-project-home-phone-navigation.png'});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Project navigation fits phone');
    await back();
    await page.route(url,route=>route.fulfill({status:200,contentType:'application/json',body:'{"projects":[]}'}),{times:1});
    await home.getByRole('button',{name:'Refresh projects',exact:true}).click();
    await home.getByRole('heading',{name:'Your first project starts here',exact:true}).waitFor();
    assert.equal(await home.getByRole('button',{name:'Create your first project',exact:true}).isEnabled(),true);
    assert.deepEqual(errors,[]);
  } finally {
    await context?.close();await browser?.close();
    await admin.from('dominic_inspections').delete().eq('user_id',user.id);
    await admin.from('dominic_assets').delete().eq('user_id',user.id);
    for(const project of projects) await admin.from('mapping_projects').delete().eq('id',project.id);
    if(job) await admin.from('jobs').delete().eq('id',job.id);
    if(mission) await admin.from('mission_requests').delete().eq('id',mission.id);
    if(contractor) await admin.from('contractors').delete().eq('id',contractor.id);
    await admin.auth.admin.deleteUser(user.id);
  }
});
