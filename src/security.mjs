// Evitar que valores de fuentes externas se ejecuten como fórmulas en Excel.
export function safeCsvCell(value) {
  let s=String(value??'');
  if (/^[\s\uFEFF\x00-\x1F]*[=+@\-]/.test(s) && !/^\s*-\d+(?:[.,]\d+)?$/.test(s)) s="'"+s;
  return '"'+s.replace(/"/g,'""')+'"';
}
