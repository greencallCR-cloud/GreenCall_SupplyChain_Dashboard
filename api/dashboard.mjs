import { dataPending, methodGuard } from '../lib/cloud-response.mjs';
export default async function handler(request) {
  const invalid = methodGuard(request);
  return invalid || dataPending();
}
