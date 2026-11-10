// Formatting-only helper; reads source metadata from locally imported problems.
export function siriusSourceLabel(source) {
 const raw=String(source||'').trim();
 if(!raw)return '出典未登録';
 const page=raw.match(/(?:本|Sirius)\s*[pｐ](?:age)?\.?\s*([0-9０-９]+(?:[-〜–][0-9０-９]+)?)/i);
 const section=raw.match(/大問\s*([0-9０-９]+)\s*[（(]\s*([0-9０-９]+)\s*[）)]/);
 if(!page&&!section)return raw.replace(/\r?\n+/g,' / ').replace(/[ \t]{2,}/g,' ').trim();
 const result=[];
 if(page)result.push(`Sirius p.${page[1]}`);
 if(section)result.push(`大問${section[1]} (${section[2]})`);
 return result.join(' ／ ');
}
