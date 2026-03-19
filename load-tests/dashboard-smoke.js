import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  vus: 10,
  duration: '30s',
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<800'],
  },
};

const baseUrl = __ENV.BASE_URL || 'http://127.0.0.1:3001';
const authToken = __ENV.AUTH_TOKEN || '';

export default function () {
  const response = http.get(`${baseUrl}/api/v1/analytics/dashboard?period=month`, {
    headers: authToken
      ? {
          Authorization: `Bearer ${authToken}`,
        }
      : undefined,
  });

  check(response, {
    'dashboard status is 200': (res) => res.status === 200,
  });

  sleep(1);
}
