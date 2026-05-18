import type { ActionFunctionArgs } from 'react-router';

import { getAgentConfig, setAgentConfig } from '@/lib/db';
import type { JobConfig } from '@/lib/db';
import { jsonError, jsonResponse, methodNotAllowed } from '@/app/lib/api-shared';

export async function loader() {
  try {
    const config = getAgentConfig();
    return jsonResponse(config);
  } catch (error) {
    console.error('Failed to get settings:', error);
    return jsonError('Failed to get settings', 500);
  }
}

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== 'PUT') return methodNotAllowed(['PUT']);

  try {
    const body = (await request.json()) as JobConfig;

    if (typeof body !== 'object' || body === null || Array.isArray(body)) {
      return jsonError('Config must be a JSON object', 400);
    }

    const config = setAgentConfig(body);
    return jsonResponse(config);
  } catch (error) {
    console.error('Failed to update settings:', error);
    return jsonError('Failed to update settings', 500);
  }
}
