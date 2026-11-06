/**
 * Standalone OOXML .docx writer. No external packages, CDN or data transfer.
 * ZIP entries are stored (uncompressed) for maximal browser compatibility.
 */
const encoder = new TextEncoder();
const xml = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
const byType = (questions) => {
  const map = new Map();
  questions.forEach(q => {
    const type = q.type || 'その他';
    if (!map.has(type)) map.set(type, {type, instruction:q.instruction || '', items:[]});
    map.get(type).items.push(q);
  });
  return [...map.values()];
};
function run(text, opt={}) {
  const props = `<w:rPr><w:rFonts w:ascii="${opt.serif?'Georgia':'Calibri'}" w:hAnsi="${opt.serif?'Georgia':'Calibri'}" w:eastAsia="${opt.serif?'Yu Mincho':'Yu Gothic'}"/>${opt.bold?'<w:b/>':''}<w:sz w:val="${opt.size || 21}"/></w:rPr>`;
  const parts = String(text ?? '').split('\n').map((line,i)=>`${i?'<w:br/>':''}<w:t xml:space="preserve">${xml(line)}</w:t>`).join('');
  return `<w:r>${props}${parts}</w:r>`;
}
function paragraph(runs, opt={}){
  const keep = opt.keepNext?'<w:keepNext/>':'';
  const line = `<w:spacing w:before="${opt.before||0}" w:after="${opt.after??110}" w:line="${opt.line||310}" w:lineRule="auto"/>`;
  const indent=opt.left?`<w:ind w:left="${opt.left}"/>`:'';
  const pPr=`<w:pPr>${keep}${line}${indent}</w:pPr>`;
  return `<w:p>${pPr}${runs}</w:p>`;
}
const plain = (text,opt={})=>paragraph(run(text,opt),opt);
const choice = (q) => q.choices && !String(q.text).includes(String(q.choices)) ? String(q.choices).trim():'';
function contentXml({questions,title='英語 確認テスト',documentType='questions',paper='Letter',space='standard',explain=false}) {
  const groups=byType(questions);
  const parts=[];
  parts.push(plain(title, {bold:true,size:32,after:100,keepNext:true}));
  if(documentType==='questions') parts.push(plain(`全${questions.length}問　　　　　　日付：________________　　氏名：________________`, {size:18,after:200}));
  else parts.push(plain(`解答・解説　｜　全${questions.length}問`,{size:19,after:220}));
  groups.forEach((group,gi)=>{
    parts.push(paragraph(run(`【${gi+1}】 `,{bold:true,size:22})+run(group.instruction || `次の問題に答えなさい。`, {bold:true,size:18}),{before:180,after:185,keepNext:true}));
    group.items.forEach((q,qi)=>{
      const condition=(q.instruction && q.instruction!==group.instruction) ? `（個別の指示：${q.instruction}）\n`:'';
      const text = documentType==='questions' ? q.text : (String(q.answer||'').trim()?q.answer:'［解答未登録］');
      parts.push(paragraph(run(`(${qi+1})`,{size:20})+run(`  ${condition}${text}`,{serif:true,size:22}),{left:170,after:90,keepNext:documentType==='questions'&&!!choice(q)}));
      if(documentType==='questions'){
        if(choice(q)) parts.push(plain(`　　${choice(q)}`,{serif:true,size:19,left:370,after:80}));
        if(q.answer && q.type && q.type.includes('選択')) parts.push(plain(`　　　　　　　　　　　　　　　　　　　答え（　　　　）`,{size:17,left:380,after:160}));
        else if(space!=='compact') parts.push(plain('________________________________________________________________________________', {size:16,left:370,after:space==='wide'?300:160}));
      }else if(explain && q.explanation)parts.push(plain(`　解説・訳：${q.explanation}`,{size:17,left:370,after:180}));
    });
  });
  const isA4=paper==='A4';
  const pageWidth=isA4?11906:12240, pageHeight=isA4?16838:15840;
  const body=parts.join('')+`<w:sectPr><w:pgSz w:w="${pageWidth}" w:h="${pageHeight}"/><w:pgMar w:top="950" w:right="950" w:bottom="950" w:left="950" w:header="400" w:footer="400" w:gutter="0"/></w:sectPr>`;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}</w:body></w:document>`;
}
let crcTable;
function crc32(bytes){
  if(!crcTable){crcTable=Array.from({length:256},(_,n)=>{let c=n;for(let i=0;i<8;i++)c=(c&1)?(0xedb88320^(c>>>1)):(c>>>1);return c>>>0;});}
  let crc=0xffffffff;for(const b of bytes)crc=crcTable[(crc^b)&255]^(crc>>>8);return (crc^0xffffffff)>>>0;
}
const u16=(d,o,v)=>d.setUint16(o,v,true),u32=(d,o,v)=>d.setUint32(o,v>>>0,true);
function zip(entries){
  const locals=[],centrals=[];let offset=0;
  for(const [name,value] of entries){
    const nameB=encoder.encode(name),body=encoder.encode(value),sum=crc32(body);
    const l=new Uint8Array(30+nameB.length+body.length),ld=new DataView(l.buffer);
    u32(ld,0,0x04034b50);u16(ld,4,20);u16(ld,6,0);u16(ld,8,0);u32(ld,14,sum);u32(ld,18,body.length);u32(ld,22,body.length);u16(ld,26,nameB.length);l.set(nameB,30);l.set(body,30+nameB.length);
    locals.push(l);
    const c=new Uint8Array(46+nameB.length),cd=new DataView(c.buffer);
    u32(cd,0,0x02014b50);u16(cd,4,20);u16(cd,6,20);u32(cd,16,sum);u32(cd,20,body.length);u32(cd,24,body.length);u16(cd,28,nameB.length);u32(cd,42,offset);c.set(nameB,46);centrals.push(c);offset+=l.length;
  }
  const cdLength=centrals.reduce((n,a)=>n+a.length,0); const end=new Uint8Array(22),ed=new DataView(end.buffer);
  u32(ed,0,0x06054b50);u16(ed,8,entries.length);u16(ed,10,entries.length);u32(ed,12,cdLength);u32(ed,16,offset);
  const result=new Uint8Array(offset+cdLength+end.length);let pos=0;for(const part of [...locals,...centrals,end]){result.set(part,pos);pos+=part.length;}
  return result;
}
export function buildDocx(options){
  const now=new Date().toISOString();
  const files=[
    ['[Content_Types].xml',`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`],
    ['_rels/.rels',`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`],
    ['docProps/core.xml',`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${xml(options.title)}</dc:title><dc:creator>英語テスト工房</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created></cp:coreProperties>`],
    ['word/document.xml',contentXml(options)]
  ];
  return new Blob([zip(files)],{type:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'});
}
export function downloadDocx(options){
  const blob=buildDocx(options),a=document.createElement('a');a.href=URL.createObjectURL(blob);
  a.download=(options.title||'英語テスト').replace(/[\\/:*?"<>|]/g,'_')+(options.documentType==='answers'?'_解答':'_問題')+'.docx';
  document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),4000);
}