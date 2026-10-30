// Prepara las importaciones sin alterar el estado activo. El servidor publica
// el nuevo snapshot únicamente después de que la escritura atómica termina.
import {mergeRows} from './core.mjs';

export function prepareImportBatch(current, stages, ids, now=new Date().toISOString()) {
  if (!Array.isArray(ids) || !ids.length || ids.length>35 || ids.some(id=>typeof id!=='string'))
    throw Error('Identificadores de importación inválidos.');
  const unique=[...new Set(ids)];
  const next={...current,tables:{...current.tables},batches:[...(current.batches||[])]};
  const results=[];
  for (const id of unique) {
    const stage=stages.get(id);
    if (!stage || Date.now()-stage.created>60*60*1000)
      throw Error('Preview inexistente o expirado; vuelva a analizar el archivo.');
    if ((stage.records||[]).some(r=>r.error))
      throw Error('El archivo contiene hojas inválidas; corrija el archivo antes de aplicar.');
    const start=results.length;
    for (const r of stage.records||[]) {
      if (!r.type) continue;
      let previous=next.tables[r.type]||[];
      if (r.type==='dispatch_nonserial' && r.rows.length) {
        const key=x=>String(x||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().trim();
        const group=x=>[String(x.date||x.source_month||'').slice(0,7),key(x.tech_name||x.tech),x.sku].join('|');
        const incoming=new Map();
        for(const row of r.rows){const k=group(row);incoming.set(k,(incoming.get(k)||0)+1)}
        const incomplete=previous.filter(x=>x.date_granularity==='MES'&&incoming.has(group(x))&&incoming.get(group(x))<Number(x.source_events||1));
        if(incomplete.length)throw Error(`Carga parcial en ${incomplete.length} grupos mes/técnico/SKU; no se borrará el histórico agregado.`);
        previous=previous.filter(x=>x.date_granularity!=='MES'||!incoming.has(group(x)));
      }
      const merged=mergeRows(previous,r.rows,r.type);
      next.tables[r.type]=merged.rows;
      results.push({file:stage.filename,type:r.type,...merged.stats});
    }
    next.batches.push({at:now,sha256:stage.sha,filename:stage.filename,result:results.slice(start)});
  }
  return {next,results,ids:unique};
}
