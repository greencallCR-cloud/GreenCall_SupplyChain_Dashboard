// Preparación CLOUD READY, NO conectado a producción.
// La API local con escrituras no se publica en Cloudflare por defecto.
export default {async fetch(req, env){const u=new URL(req.url);if(u.pathname.startsWith('/api/'))return new Response(JSON.stringify({error:'Cloud API deshabilitada. Integrar autenticación, RLS y backend antes de desplegar.'}),{status:501,headers:{'content-type':'application/json'}});if(env.ASSETS)return env.ASSETS.fetch(req);return new Response('Cloud assets no configurados',{status:503})}};
