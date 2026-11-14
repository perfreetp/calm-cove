// Typed fetch helpers plus a tiny signal-based API cache for the client.

const actorKey = 'tunnel.actor';
let actor = localStorage.getItem(actorKey) || '主管 周敏';
export function currentActor() { return actor; }
export function setActor(name) {
  actor = name;
  localStorage.setItem(actorKey, name);
}

async function request(path, { method = 'GET', body, params } = {}) {
  const url = new URL(path, window.location.origin);
  if (params) for (const [k, v] of Object.entries(params)) {
    if (v != null && v !== '') url.searchParams.set(k, v);
  }
  const init = {
    method,
    headers: { 'x-actor': encodeURIComponent(actor) },
  };
  if (body !== undefined) {
    init.headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }
  const res = await fetch(url, init);
  if (!res.ok) {
    let message = `请求失败 (${res.status})`;
    try {
      const data = await res.json();
      if (data?.error) message = data.error;
    } catch { /* non-JSON body */ }
    throw new Error(message);
  }
  if (res.status === 204) return null;
  return res.json();
}

export const api = {
  meta: () => request('/api/meta'),
  users: () => request('/api/users'),
  projects: () => request('/api/projects'),
  project: (id) => request(`/api/projects/${id}`),
  projectSummary: (id) => request(`/api/projects/${id}`),
  createProject: (body) => request('/api/projects', { method: 'POST', body }),
  geometry: (id, layers) => request(`/api/projects/${id}/geometry`, { params: layers ? { layers } : {} }),
  geometryBinary: async (id, layers) => {
    const url = new URL(`/api/projects/${id}/geometry.bin`, window.location.origin);
    if (layers) url.searchParams.set('layers', layers);
    const buf = await (await fetch(url, { headers: { 'x-actor': encodeURIComponent(actor) } })).arrayBuffer();
    return parseBinaryGeometry(buf);
  },
  issues: (id, params) => request(`/api/projects/${id}/issues`, { params }),
  runChecks: (id) => request(`/api/projects/${id}/checks`, { method: 'POST', body: {} }),
  setIssueStatus: (id, issueId, status, note) =>
    request(`/api/projects/${id}/issues/${issueId}`, { method: 'PATCH', body: { status, note } }),
  searchElements: (id, params) => request(`/api/projects/${id}/elements/search`, { params }),
  element: (id, elementId) => request(`/api/projects/${id}/elements/${elementId}`),
  updateElement: (id, elementId, patch) =>
    request(`/api/projects/${id}/elements/${elementId}`, { method: 'PATCH', body: patch }),
  bulkSection: (id, elementIds, sectionCode) =>
    request(`/api/projects/${id}/elements/bulk-section`, { method: 'POST', body: { elementIds, sectionCode } }),
  assignSections: (id, sectionIds, makerId) =>
    request(`/api/projects/${id}/sections/assign`, { method: 'POST', body: { sectionIds, makerId } }),
  unassignSection: (id, sectionId) =>
    request(`/api/projects/${id}/sections/${sectionId}/unassign`, { method: 'POST', body: {} }),
  sectionProgress: (id, sectionId, status) =>
    request(`/api/projects/${id}/sections/${sectionId}/progress`, { method: 'POST', body: { status } }),
  submitSection: (id, sectionId, note) =>
    request(`/api/projects/${id}/sections/${sectionId}/submit`, { method: 'POST', body: { note } }),
  review: (id, submissionId, decision, reason) =>
    request(`/api/projects/${id}/submissions/${submissionId}/review`, {
      method: 'POST', body: { decision, reason },
    }),
  buildDelivery: (id, spec) => request(`/api/projects/${id}/deliveries/build`, { method: 'POST', body: { spec } }),
  deliveries: (id) => request(`/api/projects/${id}/deliveries`),
  delivery: (id, deliveryId) => request(`/api/projects/${id}/deliveries/${deliveryId}`),
  deliverySearch: (id, deliveryId, params) =>
    request(`/api/projects/${id}/deliveries/${deliveryId}/search`, { params }),
  dashboard: () => request('/api/dashboard'),
  audit: (projectId) => request('/api/audit', { params: projectId ? { projectId } : {} }),
};

export function downloadUrl(projectId, deliveryId) {
  return `/api/projects/${projectId}/deliveries/${deliveryId}/download`;
}

/** Parse the binary geometry feed (header JSON + typed arrays). */
export function parseBinaryGeometry(buffer) {
  const headerLen = new Uint32Array(buffer, 0, 1)[0];
  const header = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, 4, headerLen)).trim());
  const base = 4 + headerLen;
  const n = header.count;
  const view = (name, Ctor) => new Ctor(buffer, base + header.offsets[name], n);
  const elements = {
    count: n,
    ids: view('ids', Int32Array),
    sectionIdx: view('sectionIdx', Int32Array),
    kind: view('kind', Uint8Array),
    layer: view('layer', Uint8Array),
    flags: view('flags', Uint8Array),
    x: view('x', Float32Array),
    y: view('y', Float32Array),
    ang: view('ang', Float32Array),
    w: view('w', Float32Array),
    h: view('h', Float32Array),
  };
  return { ...header, elements };
}
