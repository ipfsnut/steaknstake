# Claude Development Guidelines

## Error Handling Philosophy

**NO FALLBACKS - SPECIFIC ERRORS INSTEAD**

- We hate fallback approaches and generic error handling
- When something fails, throw specific, descriptive errors instead of falling back to alternative approaches
- Users should know exactly what went wrong and why
- Don't mask problems with fallback mechanisms - expose them clearly

### Examples:

**❌ BAD (Fallback approach):**
```javascript
try {
  await primaryMethod();
} catch (error) {
  // Fallback to secondary method
  await fallbackMethod();
}
```

**✅ GOOD (Specific error):**
```javascript
try {
  await primaryMethod();
} catch (error) {
  throw new Error(`Primary method failed: ${error.message}. Fix the root cause instead of using fallbacks.`);
}
```

## Project Context

- SteakNStake: Farcaster miniapp for staking STEAK tokens and tipping creators
- Frontend: Next.js with wagmi for Web3 integration
- Contracts: Deployed on Base mainnet
- Key addresses in `frontend/src/lib/contracts.ts`

## Testing Commands

```bash
cd frontend
npm run build    # Build and typecheck
npm run dev      # Development server
```