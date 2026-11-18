import assert from 'node:assert/strict';
import fs from 'node:fs';
import {copy,languages} from './dist/i18n.js';
import {stalls} from './dist/data.js';
import {WHATSAPP_NUMBER,WHATSAPP_ACTION,validEnquiryPhone,buildEnquiryDraft} from './dist/whatsapp.js';
assert.equal(WHATSAPP_NUMBER,'917305749636');assert.equal(WHATSAPP_ACTION,'https://wa.me/917305749636');
for(const value of['7305749636','+91 73057 49636','+44 (20) 7946-0958','1234567','123456789012345'])assert.ok(validEnquiryPhone(value),value);
for(const value of['','  ','123456','1234567890123456','call me','++917305749636','12345/67890'])assert.equal(validEnquiryPhone(value),false,value);
const details={name:'R & D + விவசாயி 🌱',phone:'+91 73057 49636',business:'Growers #1 / 50% & Co',message:'Please enquire about this stall.\nDo you include power? + branding & taxes? 100%'};
for(const[languageIndex,language]of languages.entries()){
 const t=key=>{assert.ok(copy[key],`Missing translation: ${key}`);return copy[key][languageIndex];};
 const money=value=>new Intl.NumberFormat(language.locale,{style:'currency',currency:'INR',maximumFractionDigits:0}).format(value);
 const common={details,t,money,locale:language.locale,preparedAt:new Date('2026-11-17T20:00:00Z')};
 for(const stall of stalls){
  const message=buildEnquiryDraft({...common,stall});
  for(const required of[`${t('hall')}: ${stall.hall}`,`${t('stall')}: ${stall.n}`,t(stall.tier),money(stall.price),stall.size||t('confirmSize'),details.name,details.phone,details.business,details.message,'IST'])assert.ok(message.includes(required),`${language.code}/${stall.n}: ${required}`);
  if(stall.sourceIssue)assert.ok(message.includes(t(stall.sourceIssue)));
  assert.ok(!message.includes('undefined'));assert.ok(!message.includes('Invalid Date'));
  // Native GET form encoding must preserve Unicode and reserved characters.
  const encoded=new URL(WHATSAPP_ACTION);encoded.search=new URLSearchParams({text:message});
  assert.equal(encoded.searchParams.get('text'),message);assert.equal(encoded.pathname,'/917305749636');
 }
 const general=buildEnquiryDraft({...common,details:{name:'Visitor',phone:'9876543210'}});
 assert.ok(general.includes(t('waGeneral')));assert.ok(!general.includes(`${t('hall')}:`));
 assert.ok(!general.includes(`${t('waBusiness')}:`));assert.ok(!general.includes(`${t('waMessage')}:`));
 if(language.code==='en'){assert.ok(general.includes('18 Nov 2026'));assert.ok(general.includes('01:30'));assert.ok(general.includes(t('waPrepared')));}
}
const html=fs.readFileSync('dist/index.html','utf8'),form=html.match(/<form id="whatsapp-enquiry"[\s\S]*?<\/form>/)?.[0];assert.ok(form);
assert.ok(form.includes('action="'+WHATSAPP_ACTION+'"'));assert.ok(form.includes('method="get"'));assert.ok(form.includes('target="_blank"'));assert.ok(form.includes('rel="noopener noreferrer"'));assert.ok(form.includes('accept-charset="UTF-8"'));
assert.deepEqual([...form.matchAll(/\bname="([^"]+)"/g)].map(m=>m[1]),['text'],'Only the reviewed draft is submitted');
assert.match(form,/<textarea[^>]*id="enquiry-draft"[^>]*readonly/);
for(const id of['enquiry-name','enquiry-phone'])assert.match(form,new RegExp('<input[^>]*id="'+id+'"[^>]*required'));
assert.match(html,/data-whatsapp/);
console.log('PASS: correct WhatsApp recipient; 193 stalls × six language drafts; source caveats; general enquiries; visitor details; Unicode/URL encoding; IST date rollover; phone validation; explicit native form submission.');
