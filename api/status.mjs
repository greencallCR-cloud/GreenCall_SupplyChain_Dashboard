import {createCloudApi} from '../lib/cloud-api.mjs';
// Vercel Web Handler signature: default.fetch receives a standard Request.
export default {fetch:request=>createCloudApi()(request)};
