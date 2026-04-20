// Peach CRM — API Client
const API_BASE = window.PEACH_API_URL || 'http://localhost:3001/api';

class PeachAPI {
  constructor() {
    this.token = localStorage.getItem('peach_token');
  }

  setToken(token) {
    this.token = token;
    if (token) localStorage.setItem('peach_token', token);
    else localStorage.removeItem('peach_token');
  }

  async request(method, path, body = null, params = null) {
    let url = `${API_BASE}${path}`;
    if (params) url += '?' + new URLSearchParams(params).toString();

    const opts = {
      method,
      headers: { 'Content-Type': 'application/json' },
    };
    if (this.token) opts.headers['Authorization'] = `Bearer ${this.token}`;
    if (body) opts.body = JSON.stringify(body);

    const res = await fetch(url, opts);
    if (res.status === 401) {
      this.setToken(null);
      window.dispatchEvent(new Event('peach:logout'));
      throw new Error('Session expired');
    }
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  }

  // Auth
  async login(email, password) {
    const data = await this.request('POST', '/auth/login', { email, password });
    this.setToken(data.token);
    return data;
  }
  logout() { this.setToken(null); }
  getMe() { return this.request('GET', '/auth/me'); }
  changePassword(current, next) { return this.request('POST', '/auth/change-password', { current_password: current, new_password: next }); }

  // Donors
  getDonors(params) { return this.request('GET', '/donors', null, params); }
  getDonor(id) { return this.request('GET', `/donors/${id}`); }
  getDonorStats() { return this.request('GET', '/donors/stats'); }
  createDonor(data) { return this.request('POST', '/donors', data); }
  updateDonor(id, data) { return this.request('PUT', `/donors/${id}`, data); }
  deleteDonor(id) { return this.request('DELETE', `/donors/${id}`); }
  importDonors(donors) { return this.request('POST', '/donors/import', { donors }); }
  addDedication(donorId, data) { return this.request('POST', `/donors/${donorId}/dedications`, data); }
  deleteDedication(donorId, dedId) { return this.request('DELETE', `/donors/${donorId}/dedications/${dedId}`); }

  // Payments
  getPayments(params) { return this.request('GET', '/payments', null, params); }
  getPaymentSummary() { return this.request('GET', '/payments/summary'); }
  createPayment(data) { return this.request('POST', '/payments', data); }
  updatePaymentStatus(id, status) { return this.request('PUT', `/payments/${id}/status`, { status }); }
  sendReceipt(id) { return this.request('POST', `/payments/${id}/receipt`); }
  exportPayments(params) { return `${API_BASE}/payments/export?${new URLSearchParams({...params, _t: this.token})}`; }

  // Campaigns
  getCampaigns(status) { return this.request('GET', '/campaigns', null, status ? { status } : null); }
  getCampaign(id) { return this.request('GET', `/campaigns/${id}`); }
  createCampaign(data) { return this.request('POST', '/campaigns', data); }
  updateCampaign(id, data) { return this.request('PUT', `/campaigns/${id}`, data); }

  // Telemarketing
  getCallQueue() { return this.request('GET', '/telemarketing/queue'); }
  logCall(data) { return this.request('POST', '/telemarketing/calls', data); }
  getCallHistory(params) { return this.request('GET', '/telemarketing/calls', null, params); }
  getTeleStats() { return this.request('GET', '/telemarketing/stats'); }

  // Tasks
  getTasks(params) { return this.request('GET', '/tasks', null, params); }
  createTask(data) { return this.request('POST', '/tasks', data); }
  updateTask(id, data) { return this.request('PUT', `/tasks/${id}`, data); }
  deleteTask(id) { return this.request('DELETE', `/tasks/${id}`); }

  // Mailing
  getMailings() { return this.request('GET', '/mailing'); }
  createMailing(data) { return this.request('POST', '/mailing', data); }
  sendMailing(id) { return this.request('POST', `/mailing/${id}/send`); }
  getMailingStats() { return this.request('GET', '/mailing/stats'); }
}

window.peachAPI = new PeachAPI();
