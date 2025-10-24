# 🚀 SteakNStake Deployment Guide

## Railway Backend Deployment

### 1. Setup Railway Project
```bash
cd backend
railway init
railway add postgresql
```

### 2. Deploy Backend
```bash
railway up
```

### 3. Get Database URL
```bash
railway variables
# Copy the DATABASE_URL for frontend configuration
```

## Frontend Deployment Options

### Option A: Vercel (Recommended for Next.js)
```bash
cd frontend
npm install -g vercel
vercel
```

### Option B: Railway
```bash
cd frontend
railway init
railway up
```

## Environment Variables

### Backend (.env)
```env
DATABASE_URL=postgresql://...
NODE_ENV=production
PORT=3005
FRONTEND_URL=https://your-frontend-domain.com
```

### Frontend (.env.local)
```env
NEXT_PUBLIC_API_URL=https://your-backend-domain.railway.app
```

## Database Setup

The database schema is automatically created on first run. Tables include:
- `users` - Wallet addresses and Farcaster info
- `staking_positions` - User stakes and reward balances
- `farcaster_tips` - All tip transactions
- `tip_claims` - Claimed tips (withdraw/stake)
- `system_settings` - Configurable parameters

## Testing the Deployment

### 1. Health Check
```bash
curl https://your-backend-domain.railway.app/api/health
```

### 2. Test Staking Endpoint
```bash
curl https://your-backend-domain.railway.app/api/staking/stats
```

### 3. Frontend Verification
Visit your frontend URL and verify:
- Statistics load correctly
- No console errors
- API calls succeed

## Post-Deployment Setup

### 1. Configure System Settings
Update reward rates and limits via database or API:
```sql
UPDATE system_settings SET setting_value = '0.002' WHERE setting_key = 'daily_reward_rate';
```

### 2. Set Up Farcaster Integration
- Configure webhook endpoints
- Set up bot credentials (if needed)
- Test tipping flow

### 3. Monitor Application
- Check Railway logs for errors
- Monitor database performance
- Verify API response times

## Scaling Considerations

### Database
- Monitor connection pool usage
- Consider read replicas for heavy traffic
- Set up automated backups

### Backend
- Railway auto-scales based on traffic
- Monitor memory and CPU usage
- Consider Redis for caching

### Frontend
- Vercel provides automatic CDN
- Optimize images and assets
- Implement proper caching headers

## Security Checklist

- [ ] Environment variables properly set
- [ ] Database access restricted
- [ ] CORS configured correctly
- [ ] Rate limiting implemented
- [ ] Input validation in place
- [ ] No secrets in code

## Troubleshooting

### Common Issues

1. **Database Connection Errors**
   - Verify DATABASE_URL format
   - Check Railway PostgreSQL status
   - Ensure schema is created

2. **Frontend API Errors**
   - Verify NEXT_PUBLIC_API_URL
   - Check CORS settings
   - Confirm backend is deployed

3. **Railway Deployment Fails**
   - Check build logs
   - Verify package.json scripts
   - Ensure all dependencies installed

### Debug Commands
```bash
# Railway logs
railway logs

# Database connection test
railway connect

# Local development
npm run dev
```