// Shared formatting and book recognition. No question data is included in this public source.
function normalizeBookName(value) {
 const name=String(value??'').trim();
 if(!name)return '';
 if(/^(?:Sirius|シリウス)$/i.test(name))return 'Sirius';
 if(/^(?:文問|文法問題集)$/.test(name))return '文法問題集';
 return name;
}
export function bookOf(question) {
 const explicit=normalizeBookName(question?.book || question?.教材 || question?.bookName);
 if(explicit)return explicit;
 const raw=String(question?.source??'');
 if(/文法問題集|文問/.test(raw))return '文法問題集';
 if(/Sirius|シリウス|本\s*[pｐ](?:age)?\.?\s*\d|_(?:標準|発展)(?:\([^)]*\))?\.pdf/i.test(raw))return 'Sirius';
 return '教材未設定';
}
export function sourceLabel(question) {
 const source=String(question?.source??'').trim();
 if(!source)return '出典未登録';
 const book=bookOf(question);
 const page=source.match(/(?:本|Sirius|シリウス|文法問題集|文問)?\s*[pｐ](?:age)?\.?\s*([0-9０-９]+(?:[-〜–][0-9０-９]+)?)/i);
 const problem=source.match(/大問\s*([0-9０-９]+)\s*[（(]\s*([0-9０-９]+)\s*[）)]/);
 if(page||problem) {
   const parts=[];
   if(page)parts.push((book==='教材未設定'?'':book+' ')+'p.'+page[1]);
   if(problem)parts.push('大問'+problem[1]+' ('+problem[2]+')');
   return parts.join(' ／ ');
 }
 const cleaned=source.replace(/\r?\n+/g,' / ').replace(/[ \t]{2,}/g,' ').trim();
 return book==='教材未設定'||cleaned.includes(book)?cleaned:book+' ／ '+cleaned;
}
// Legacy alias for older integrations; prefer sourceLabel(question) for new uses.
export function siriusSourceLabel(source) {return sourceLabel({source,book:'Sirius'});}
