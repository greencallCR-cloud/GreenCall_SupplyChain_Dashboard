import {createCloudApi} from '../lib/cloud-api.mjs';
export default {fetch:request=>createCloudApi()(request)};
