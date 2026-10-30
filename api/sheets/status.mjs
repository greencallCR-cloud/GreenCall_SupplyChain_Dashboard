import { jsonResponse, methodGuard } from '../../lib/cloud-response.mjs';
export default async function handler(request) {
  const invalid = methodGuard(request);
  return invalid || jsonResponse({ok:true,enabled:false,state:'SIN_CONFIGURAR',last_sync_at:null,message:'Sincronización cloud pendiente de implementación.'});
}
