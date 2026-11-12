from pathlib import Path
from playwright.sync_api import sync_playwright,expect
import json
P=Path.home()/'.aki/tmp/astra-units-1112';out=[]
def record(name,**data):
 out.append({'name':name,**data});(P/'ui.json').write_text(json.dumps(out,indent=2))
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='C:/Program Files/Google/Chrome/Application/chrome.exe',headless=True,args=['--disable-gpu'])
 c=b.new_context(viewport={'width':390,'height':844});page=c.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 c.route('**/*',lambda r:r.fulfill(status=200,content_type='text/html',body='<html><body class="bg-ground"><div id="root"></div></body></html>') if r.request.resource_type=='document' else r.abort())
 page.goto('http://audit.invalid/');page.add_style_tag(path=str(P.parent/'astra-gp-1110/ui.css'));page.add_script_tag(content="window.process={env:{NODE_ENV:'development'}}");page.add_script_tag(path=str(P/'ui-build/ui.js'))
 expect(page.get_by_role('button',name='Try it',exact=True)).to_be_visible();page.get_by_role('button',name='Try it',exact=True).click()
 expect(page.get_by_role('radio',name='kg',exact=True)).to_have_attribute('aria-checked','true');record('metric start',kgSelected=True)
 page.get_by_role('radio',name='lb',exact=True).click();page.locator('#gp-overhead').fill('225 x 3');before=page.get_by_test_id('group-picker-note').inner_text();page.get_by_role('radio',name='kg',exact=True).click();record('unlabelled expression toggle',input=page.locator('#gp-overhead').input_value(),before=before,after=page.get_by_test_id('group-picker-note').inner_text())
 page.screenshot(path=str(P/'picker-expression.png'),full_page=True)
 page.get_by_role('radio',name='lb',exact=True).click();page.locator('#gp-overhead').fill('225.5');page.get_by_role('radio',name='kg',exact=True).click();kg=page.locator('#gp-overhead').input_value();page.get_by_role('radio',name='lb',exact=True).click();record('decimal roundtrip',input='225.5',kg=kg,back=page.locator('#gp-overhead').input_value())
 page.evaluate('window.setup()');expect(page.get_by_role('radio',name='Kilograms and meters',exact=True)).to_be_visible();before=page.get_by_test_id('event-readout').inner_text();page.get_by_role('radio',name='Kilograms and meters',exact=True).click();expect(page.get_by_test_id('event-readout')).to_contain_text('100 kg');record('setup flip retains values',before=before,after=page.get_by_test_id('event-readout').inner_text(),state=page.evaluate('window.setupState'))
 page.screenshot(path=str(P/'setup-metric.png'),full_page=True)
 page.evaluate('window.setup(true)');expect(page.get_by_role('radio',name='Pounds and feet',exact=True)).to_be_disabled();record('setup result lock',disabled=True,text=page.locator('fieldset').filter(has=page.get_by_role('radiogroup',name='Units',exact=True)).locator('..').inner_text())
 record('browser errors',errors=errors);assert not errors;c.close();b.close()
