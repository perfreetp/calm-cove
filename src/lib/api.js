const base = '/api';

async function req(method, url, body) {
  const res = await fetch(base + url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `请求失败 ${res.status}`);
  return data;
}

export const api = {
  listOrders: (doctor) => req('GET', `/orders${doctor ? `?doctor=${encodeURIComponent(doctor)}` : ''}`),
  createOrder: (order) => req('POST', '/orders', order),
  getOrder: (id) => req('GET', `/orders/${id}`),
  saveModel: (orderId, pos, payload) => req('PUT', `/orders/${orderId}/teeth/${pos}/model`, payload),
  submitQc: (orderId) => req('POST', `/orders/${orderId}/submit-qc`),
  listBatches: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return req('GET', `/batches${q ? '?' + q : ''}`);
  },
  getBatch: (id, role) => req('GET', `/batches/${id}${role ? `?role=${role}` : ''}`),
  reviewIssue: (batchId, issueId, action, reason) =>
    req('POST', `/batches/${batchId}/issues/${issueId}/review`, { action, reason }),
  releaseBatch: (batchId) => req('POST', `/batches/${batchId}/release`),
  getReport: (batchId) => req('GET', `/batches/${batchId}/report`),
  resubmitBatch: (batchId) => req('POST', `/batches/${batchId}/resubmit`)
};
