export const PROMPT_VERSION='watercolor-side-profile-1';
export const PIPELINE_MICRO_USD=12500; // $0.01 image + $0.0025 SAM; checked 2026-10-27.
export function segmentationTarget(profile,appearance=''){
  // Include the worn item in the same subject: a dog-only mask can exclude its
  // harness. These are fixed noun phrases, never arbitrary prompt instructions.
  if(/\bharness\b/i.test(appearance)){
    const color=['turquoise','blue','red','green','pink','yellow','black'].find(c=>new RegExp(`\\b${c}\\b`,'i').test(appearance));
    return `${profile} wearing a ${color?color+' ':''}harness`;
  }
  return profile;
}
export function pngDimensions(src,maxSide=2048){
  if(typeof src!=='string'||src.length>12_000_000||!/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(src))throw new Error('Expected a bounded PNG image.');
  let bytes;try{bytes=Uint8Array.from(atob(src.slice(22,66)),c=>c.charCodeAt(0));}catch{throw new Error('Invalid PNG image.');}
  if(bytes.length<24||[137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82].some((v,i)=>bytes[i]!==v))throw new Error('Invalid PNG header.');
  const view=new DataView(bytes.buffer),width=view.getUint32(16),height=view.getUint32(20);
  if(!width||!height||width>maxSide||height>maxSide||width*height>4_194_304)throw new Error('Image dimensions exceed the processing limit.');
  return {width,height};
}
export function validateCreatureRequest(input){
  if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!['image','profile','appearance','consent'].includes(k)))throw new Error('Unsupported creature request.');
  if(!['dog','cat'].includes(input.profile))throw new Error('Choose the dog or cat companion role.');
  if(input.consent!==true)throw new Error('Choose to send this image to Meta before generating.');
  if(typeof input.appearance!=='string'||input.appearance.length>120||/[\u0000-\u001f]/.test(input.appearance))throw new Error('Use up to 120 characters for appearance details.');
  if(input.image?.length>2_800_000)throw new Error('Resize the source image before sending.');
  pngDimensions(input.image,640);
  return {image:input.image,profile:input.profile,appearance:input.appearance,consent:true};
}
export function validateMask(mask,width,height){
  if(!mask||!Number.isSafeInteger(mask.width)||!Number.isSafeInteger(mask.height)||mask.width<1||mask.height<1||mask.width*mask.height>4_194_304)throw new Error('Invalid cutout mask dimensions.');
  const b=mask.bounds;
  if(!b||!['left','top','right','bottom'].every(k=>Number.isSafeInteger(b[k]))||b.left<0||b.top<0||b.right>width||b.bottom>height||b.right<=b.left||b.bottom<=b.top)throw new Error('Cutout mask does not align with the illustration.');
  if(typeof mask.data!=='string'||mask.data.length>5_600_000||!/^[A-Za-z0-9+/]+={0,2}$/.test(mask.data))throw new Error('Invalid cutout mask.');
  let raster;try{raster=Uint8Array.from(atob(mask.data),c=>c.charCodeAt(0));}catch{throw new Error('Invalid cutout mask bytes.');}
  if(raster.length!==mask.width*mask.height||raster.some(v=>v!==0&&v!==1)||!raster.some(Boolean))throw new Error('Cutout mask is empty or malformed.');
  return raster;
}
// Masks cover their bounding box, not the full image. Decode row-major pixels,
// scale that raster into the half-open source bounds, and preserve original alpha.
export function applyCutoutMask(rgba,width,height,mask){
  const raster=validateMask(mask,width,height);
  if(!(rgba instanceof Uint8ClampedArray)||rgba.length!==width*height*4)throw new Error('Invalid illustration pixels.');
  const b=mask.bounds;
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const inside=x>=b.left&&x<b.right&&y>=b.top&&y<b.bottom;
    const mx=Math.floor((x-b.left)*mask.width/(b.right-b.left)),my=Math.floor((y-b.top)*mask.height/(b.bottom-b.top));
    if(!inside||!raster[my*mask.width+mx])rgba[(y*width+x)*4+3]=0;
  }
  return rgba;
}
