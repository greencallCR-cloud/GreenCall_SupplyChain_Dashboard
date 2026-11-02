// Public (anonymous) projection of dashboard data — owner decision, spec v3: aggregated KPIs,
// costs, charts and tables are public; personal identifiers, individual serial numbers, actas,
// source row pointers, raw samples and admin-only sections are never sent to visitors.
export const ADMIN_SECTIONS=Object.freeze(['quality','physical']);
const PRIVATE_KEY=/^(_.*|serials?|series_list|acta|actas|sample|samples|orphans|conflicts|cedula|identificacion|id_number|phone|telefono|email|correo|token)$/i;
export const isPrivateKey=key=>PRIVATE_KEY.test(key);
function strip(value,depth=0){
 if(depth>40)return null;
 if(Array.isArray(value))return value.map(v=>strip(v,depth+1));
 if(!value||typeof value!=='object')return value;
 const out={};
 for(const [k,v] of Object.entries(value))if(!isPrivateKey(k))out[k]=strip(v,depth+1);
 return out;
}
export function publicDashboard(data){
 const out=strip(data);
 for(const k of ADMIN_SECTIONS)delete out[k];
 return out;
}
/** CSV exports a visitor may download: aggregated, computed tables only. */
export const PUBLIC_EXPORTS=Object.freeze(['abc','planning','forecast','inventory']);
