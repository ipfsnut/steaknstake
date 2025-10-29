import axios from 'axios';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'https://steaknstake-backend.onrender.com';

if (!process.env.NEXT_PUBLIC_API_URL) {
  console.warn('⚠️ NEXT_PUBLIC_API_URL not set, using fallback:', API_BASE_URL);
}

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  }
});

// Response interceptor for error handling
api.interceptors.response.use(
  (response) => response,
  (error) => {
    console.error('API Error:', error);
    return Promise.reject(error);
  }
);

// Staking API
export const stakingApi = {
  getPosition: (address: string) => api.get(`/api/staking/position/${address}`),
  stake: (data: {
    walletAddress: string;
    amount: number;
    transactionHash?: string;
    blockNumber?: number;
    farcasterFid?: number;
    farcasterUsername?: string;
  }) => api.post('/api/staking/stake', data),
  unstake: (data: {
    walletAddress: string;
    amount: number;
    transactionHash?: string;
    blockNumber?: number;
  }) => api.post('/api/staking/unstake', data),
  getStats: () => api.get('/api/staking/stats'),
  getLeaderboard: (limit?: number, offset?: number) => {
    const params = new URLSearchParams();
    if (limit) params.append('limit', limit.toString());
    if (offset) params.append('offset', offset.toString());
    return api.get(`/api/staking/leaderboard${params.toString() ? `?${params}` : ''}`);
  },
  syncAllowance: (address: string) => api.get(`/api/staking/sync-allowance/${address}`),
};

// Tipping API
export const tippingApi = {
  sendTip: (data: {
    tipperWalletAddress: string;
    recipientFid: number;
    recipientUsername?: string;
    tipAmount: number;
    castHash?: string;
    castUrl?: string;
    message?: string;
  }) => api.post('/api/tipping/send', data),
  getReceivedTips: (fid: number, limit?: number, offset?: number) => {
    const params = new URLSearchParams();
    if (limit) params.append('limit', limit.toString());
    if (offset) params.append('offset', offset.toString());
    return api.get(`/api/tipping/received/${fid}${params.toString() ? `?${params}` : ''}`);
  },
  getSentTips: (address: string, limit?: number, offset?: number) => {
    const params = new URLSearchParams();
    if (limit) params.append('limit', limit.toString());
    if (offset) params.append('offset', offset.toString());
    return api.get(`/api/tipping/sent/${address}${params.toString() ? `?${params}` : ''}`);
  },
  claimTips: (data: {
    recipientWalletAddress: string;
    recipientFid: number;
    tipIds: number[];
    claimType: 'WITHDRAW' | 'STAKE';
    transactionHash?: string;
    farcasterUsername?: string;
  }) => api.post('/api/tipping/claim', data),
  getStats: () => api.get('/api/tipping/stats'),
};

// Users API
export const usersApi = {
  getProfile: (address: string) => api.get(`/api/users/profile/${address}`),
  getByFarcasterFid: (fid: number) => api.get(`/api/users/farcaster/${fid}`),
  updateProfile: (address: string, data: {
    farcasterFid?: number;
    farcasterUsername?: string;
  }) => api.put(`/api/users/profile/${address}`, data),
  searchUsers: (username: string, limit?: number) => {
    const params = new URLSearchParams();
    params.append('username', username);
    if (limit) params.append('limit', limit.toString());
    return api.get(`/api/users/search?${params}`);
  },
  getTippersLeaderboard: (limit?: number, offset?: number) => {
    const params = new URLSearchParams();
    if (limit) params.append('limit', limit.toString());
    if (offset) params.append('offset', offset.toString());
    return api.get(`/api/users/leaderboard/tippers${params.toString() ? `?${params}` : ''}`);
  },
};

// Farcaster API
export const farcasterApi = {
  getUser: (fid: number) => api.get(`/api/farcaster/user/${fid}`),
  getCastTips: (hash: string) => api.get(`/api/farcaster/cast/${hash}`),
  getProfiles: (fids: number[]) => api.get(`/api/farcaster/profiles/${fids.join(',')}`),
  getTrendingTippers: (hours?: number, limit?: number) => {
    const params = new URLSearchParams();
    if (hours) params.append('hours', hours.toString());
    if (limit) params.append('limit', limit.toString());
    return api.get(`/api/farcaster/trending-tippers${params.toString() ? `?${params}` : ''}`);
  },
  getTrendingRecipients: (hours?: number, limit?: number) => {
    const params = new URLSearchParams();
    if (hours) params.append('hours', hours.toString());
    if (limit) params.append('limit', limit.toString());
    return api.get(`/api/farcaster/trending-recipients${params.toString() ? `?${params}` : ''}`);
  },
};

// Health API
export const healthApi = {
  check: () => api.get('/api/health'),
};

export default api;