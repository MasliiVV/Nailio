import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  scenarios: {
    booking_contention: {
      executor: 'constant-vus',
      vus: 20,
      duration: '20s',
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.05'],
    http_req_duration: ['p(95)<1000'],
  },
};

const baseUrl = __ENV.BASE_URL || 'http://127.0.0.1:3001';
const authToken = __ENV.AUTH_TOKEN || '';
const serviceId = __ENV.SERVICE_ID || '';
const slotStart = __ENV.SLOT_START || '';

export default function () {
  const payload = JSON.stringify({
    serviceId,
    startTime: slotStart,
  });

  const response = http.post(`${baseUrl}/api/v1/bookings`, payload, {
    headers: {
      'Content-Type': 'application/json',
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
    },
  });

  check(response, {
    'booking returns success or conflict': (res) => res.status === 201 || res.status === 409,
  });

  sleep(0.5);
}
