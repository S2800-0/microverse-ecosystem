import{pngDimensions,validateMask}from'../creature/contract.js';
export const PLACE_LABELS=['grass','tree','water'],PLACE_RESERVATION=7500;
const fractions=value=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===3&&PLACE_LABELS.every(k=>Object.hasOwn(value,k)&&Number.isFinite(value[k])&&value[k]>=0&&value[k]<=1)&&Object.values(value).reduce((a,b)=>a+b,0)<=1.000001;
export function validatePlaceInput(input){
  if(!input||Object.keys(input).some(k=>!['image','consent'].includes(k))||input.consent!==true||input.image?.length>2_800_000)throw new Error('Choose to send one resized place photo to Meta.');
  pngDimensions(input.image,640);return input;
}
export function unionMasks(masks,width,height){
  if(!Array.isArray(masks)||masks.length>24)throw new Error('Too many place objects.');
  const union=new Uint8Array(width*height);
  for(const mask of masks){const pixels=validateMask(mask,width,height),b=mask.bounds;
    for(let y=b.top;y<b.bottom;y++)for(let x=b.left;x<b.right;x++){
      const mx=Math.floor((x-b.left)*mask.width/(b.right-b.left)),my=Math.floor((y-b.top)*mask.height/(b.bottom-b.top));if(pixels[my*mask.width+mx])union[y*width+x]=1;
    }
  }return union;
}
export function decodePlaceLayers(width,height,layers){
  if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<1||height<1||width>640||height>640||!Array.isArray(layers)||layers.length!==3)throw new Error('Invalid place layers.');
  const total=width*height,bitmaps={};
  for(const key of PLACE_LABELS){const l=layers.find(v=>v.key===key);if(!l||!Number.isSafeInteger(l.objects)||l.objects<0||l.objects>24||typeof l.data!=='string'||l.data.length>Math.ceil(total/3)*4||!/^[A-Za-z0-9+/]+={0,2}$/.test(l.data))throw new Error('Invalid place mask.');
    const pixels=Uint8Array.from(atob(l.data),c=>c.charCodeAt(0));if(pixels.length!==total||pixels.some(v=>v!==0&&v!==1)||(pixels.some(Boolean)?l.objects===0:l.objects!==0))throw new Error('Place mask does not match its dimensions or object count.');bitmaps[key]=pixels;
  }
  const raw={grass:0,tree:0,water:0},exclusive={...raw};let overlap=0;
  for(let i=0;i<total;i++){let count=0;for(const k of PLACE_LABELS)if(bitmaps[k][i]){raw[k]++;count++;}if(count>1)overlap++;const selected=['water','tree','grass'].find(k=>bitmaps[k][i]);if(selected)exclusive[selected]++;}
  const coverage=Object.fromEntries(PLACE_LABELS.map(k=>[k,exclusive[k]/total]));
  return {bitmaps,coverage,unclassified:1-Object.values(coverage).reduce((a,b)=>a+b,0),rawCoverage:Object.fromEntries(PLACE_LABELS.map(k=>[k,raw[k]/total])),overlapFraction:overlap/total};
}
export function validatePlaceRecord(record,currentWeek){
  if(!record||typeof record!=='object'||Array.isArray(record)||Object.keys(record).some(k=>!['version','method','sourceHash','width','height','estimated','reviewed','start','atWeek'].includes(k))||record.version!==1||!['manual','sam-3.1'].includes(record.method)||!/^([a-f0-9]{64})$/.test(record.sourceHash)||!Number.isSafeInteger(record.width)||!Number.isSafeInteger(record.height)||record.width<1||record.width>640||record.height<1||record.height>640||!fractions(record.reviewed)||(record.estimated!==null&&!fractions(record.estimated))||!Number.isSafeInteger(record.atWeek)||record.atWeek<0||record.atWeek>currentWeek)throw new Error('Invalid reviewed place record.');
  if(!record.start||Object.keys(record.start).length!==2||!['grass','browse'].every(k=>Object.hasOwn(record.start,k)&&Number.isFinite(record.start[k])&&record.start[k]>=0&&record.start[k]<=1))throw new Error('Choose model food indices from 0 to 100%.');
  if(record.method==='sam-3.1'&&record.estimated===null)throw new Error('Missing SAM estimate.');return structuredClone(record);
}
