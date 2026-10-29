export const ECOLOGY_ROLES=['rabbit','deer','fox','wolf'];
const plural=species=>({rabbit:'rabbits',deer:'deer',fox:'foxes',wolf:'wolves'})[species];
export function normalizeChange(input){
  if(input==='drought')input={kind:'rain',rain:.4,durationWeeks:156};
  if(input==='remove-wolves')input={kind:'remove',species:'wolf'};
  if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('Unsupported experiment.');
  if(input.kind==='rain'&&Object.keys(input).every(k=>['kind','rain','durationWeeks'].includes(k))&&
    Number.isFinite(input.rain)&&input.rain>=0&&input.rain<=1.5&&Number.isSafeInteger(input.durationWeeks)&&input.durationWeeks>=1&&input.durationWeeks<=156)
    return Object.freeze({kind:'rain',rain:input.rain,durationWeeks:input.durationWeeks});
  if(input.kind==='remove'&&Object.keys(input).every(k=>['kind','species'].includes(k))&&ECOLOGY_ROLES.includes(input.species))return Object.freeze({kind:'remove',species:input.species});
  throw new Error('Unsupported change. Choose rainfall from 0–150% for 1–156 weeks, or remove one entire native species.');
}
export function describeChange(input){
  const c=normalizeChange(input);
  return c.kind==='rain'?`Set model rainfall to ${Number((c.rain*100).toFixed(2))}% of normal for ${c.durationWeeks} weeks, starting on the first experiment tick. Afterward the previous rainfall schedule resumes.`:
    `Remove all ${plural(c.species)} on the first experiment tick and disable their immigration. Other species keep their existing rules.`;
}
export const changeLabel=input=>{const c=normalizeChange(input);return c.kind==='rain'?`Rain ${Number((c.rain*100).toFixed(2))}% · ${c.durationWeeks} weeks`:`Remove ${plural(c.species)}`;};
export function interventionFor(input,week){
  const c=normalizeChange(input);
  return c.kind==='rain'?{kind:'drought',rain:c.rain,atWeek:week,untilWeek:week+c.durationWeeks}:{kind:'remove',species:c.species,atWeek:week};
}
export function validateQuestion(q){if(typeof q!=='string'||!q.trim()||q.length>800||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(q))throw new Error('Write a question of 1–800 characters.');return q.trim();}
const rain=(value,weeks)=>({kind:'rain',rain:value,durationWeeks:weeks});
const remove=species=>({kind:'remove',species});
export const PRESET_QUESTIONS=[
  {id:'dry',question:'What if it rains less?',change:rain(.4,156),aliases:['what if there were less rain','what if there is a drought','what if a drought lasts three years']},
  {id:'half',question:'What if rainfall is halved for a year?',change:rain(.5,52),aliases:['what if it rains half as much for a year','what if rainfall were cut in half for a year']},
  {id:'wet',question:'What if we have a wetter year?',change:rain(1.5,52),aliases:['what if rainfall is 150% for a year','what if it rains 50% more for a year']},
  {id:'wolves',question:'What if the wolves disappear?',change:remove('wolf'),aliases:['what if all wolves disappeared','remove all wolves','what if there are no wolves']},
  {id:'foxes',question:'What if the foxes disappear?',change:remove('fox'),aliases:['what if all foxes disappeared','remove all foxes']},
  {id:'rabbits',question:'What if the rabbits disappear?',change:remove('rabbit'),aliases:['what if all rabbits disappeared','remove all rabbits']},
];
const normalize=q=>q.toLowerCase().replace(/[?!.]+$/,'').replace(/\s+/g,' ').trim();
export function resolveQuestion(question){
  const q=validateQuestion(question),key=normalize(q);
  const preset=PRESET_QUESTIONS.find(p=>[p.question,...p.aliases].some(s=>normalize(s)===key));
  if(preset)return {status:'proposal',change:normalizeChange(preset.change),message:'Prepared question · no AI call.',source:'preset',question:q};
  if(['what if things change','what if there is less','what if rain decreases and wolves disappear','what if we remove some wolves'].includes(key))return {status:'clarify',change:null,message:'Choose one change. How much rainfall and for how many weeks, or which entire native species should be removed?',source:'local',question:q};
  if(['what if the forest gets hotter','what if the river is polluted','what if penguins live here in the wild'].includes(key))return {status:'unsupported',change:null,message:'This model does not simulate temperature, pollution or wild penguin habitat. Choose rainfall or native-species removal.',source:'local',question:q};
  return {status:'needs-ai',change:null,message:'This wording has no prepared match. Ask Spark if funded, or specify one supported change below.',source:'local',question:q};
}
export const PROPOSAL_SCHEMA={type:'object',additionalProperties:false,properties:{
  status:{type:'string',enum:['proposal','clarify','unsupported']},message:{type:'string'},
  change:{type:['object','null'],additionalProperties:false,properties:{kind:{type:'string',enum:['rain','remove']},rain:{type:['number','null']},durationWeeks:{type:['integer','null']},species:{type:['string','null'],enum:[...ECOLOGY_ROLES,null]}},required:['kind','rain','durationWeeks','species']},
},required:['status','message','change']};
export function validateProposal(value,question){
  if(!value||typeof value!=='object'||Object.keys(value).some(k=>!['status','message','change'].includes(k))||!['proposal','clarify','unsupported'].includes(value.status)||typeof value.message!=='string'||!value.message.trim()||value.message.length>500)throw new Error('Spark returned an invalid proposal. No change was applied.');
  // A clarification or refusal never runs a change. If the provider attached a guess, drop it and keep the question for the learner.
  if(value.status!=='proposal')return {status:value.status,message:value.message,change:null};
  const c=value.change;
  if(!c||Object.keys(c).length!==4||!['kind','rain','durationWeeks','species'].every(k=>Object.hasOwn(c,k)))throw new Error('Invalid proposed parameters.');
  let change;
  if(c.kind==='rain'&&c.species===null)change=normalizeChange({kind:'rain',rain:c.rain,durationWeeks:c.durationWeeks});
  else if(c.kind==='remove'&&c.rain===null&&c.durationWeeks===null)change=normalizeChange({kind:'remove',species:c.species});
  else throw new Error('The proposal combines unsupported parameters.');
  if(question!==undefined){
    const q=validateQuestion(question).toLowerCase();
    // Check explicit absolute percentages and numeric weeks, not general language
    // semantics. Never silently repair a model's different numbers.
    const percentages=[...q.matchAll(/\b(\d+(?:\.\d+)?)\s*(?:%|percent|per cent)\s+(?:of\s+)?(?:normal|usual|typical)\b/g)].map(m=>Number(m[1])/100);
    const weeks=[...q.matchAll(/\b(\d+(?:\.\d+)?)\s*(?:weeks?|wks?)\b/g)].map(m=>Number(m[1]));
    if(percentages.some(n=>change.kind!=='rain'||Math.abs(change.rain-n)>1e-9)||weeks.some(n=>change.kind!=='rain'||change.durationWeeks!==n))
      return {status:'clarify',change:null,message:'The suggested change does not match the numbers in your question. Choose the rainfall and number of weeks with the manual controls, or rephrase your question.'};
  }
  return {status:'proposal',message:value.message,change};
}
