import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'

// ── Plan limits ────────────────────────────────────────────────
const BID_LIMIT        = { trial: 10, basic: 10, pro: Infinity, enterprise: Infinity, expired: 0 }
const TRUCK_LIMIT      = { trial: 2,  basic: 2,  pro: 5,        enterprise: Infinity,  expired: 0 }

// ── Plan pricing (BWP) ─────────────────────────────────────────
export const PLAN_PRICES = { basic: 150, pro: 350, enterprise: 750 }

export function useSubscription(carrierId) {
  const [subscription, setSubscription] = useState(null)
  const [loading,      setLoading]      = useState(true)

  // ── Fetch & client-side expiry check ──────────────────────────
  const fetchSubscription = useCallback(async () => {
    if (!carrierId) { setLoading(false); return }

    const { data, error } = await supabase
      .from('carrier_subscriptions')
      .select('*')
      .eq('carrier_id', carrierId)
      .maybeSingle()

    if (error) { console.error('useSubscription fetch error:', error); setLoading(false); return }
    if (!data)  { setLoading(false); return }

    const now = new Date()
    let tier  = data.subscription_tier

    // Check trial expiry
    if (tier === 'trial' && data.trial_end_date && new Date(data.trial_end_date) < now) {
      tier = 'expired'
      await supabase.from('carrier_subscriptions')
        .update({ subscription_tier: 'expired' })
        .eq('id', data.id)
    }

    // Check paid subscription expiry
    if (['basic','pro','enterprise'].includes(tier) && data.subscription_end && new Date(data.subscription_end) < now) {
      tier = 'expired'
      await supabase.from('carrier_subscriptions')
        .update({ subscription_tier: 'expired' })
        .eq('id', data.id)
    }

    // Reset monthly bid count if past reset date (Basic / Trial only)
    if (['basic','trial'].includes(tier) && data.monthly_bid_reset && new Date(data.monthly_bid_reset) < now) {
      const nextReset = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString()
      await supabase.from('carrier_subscriptions')
        .update({ monthly_bid_count: 0, monthly_bid_reset: nextReset })
        .eq('id', data.id)
      data.monthly_bid_count = 0
      data.monthly_bid_reset = nextReset
    }

    setSubscription({ ...data, subscription_tier: tier })
    setLoading(false)
  }, [carrierId])

  useEffect(() => { fetchSubscription() }, [fetchSubscription])

  // ── Create trial for brand-new carrier ────────────────────────
  const createTrialSubscription = useCallback(async (cId) => {
    const now      = new Date()
    const trialEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)

    const { data, error } = await supabase.from('carrier_subscriptions').insert({
      carrier_id:       cId,
      subscription_tier:'trial',
      trial_start_date: now.toISOString(),
      trial_end_date:   trialEnd.toISOString(),
      monthly_bid_count:0,
      monthly_bid_reset:trialEnd.toISOString(),
    }).select().single()

    if (!error && data) setSubscription(data)
    return { data, error }
  }, [])

  // ── Upgrade after successful payment (server-side via edge function) ─
  const upgradeSubscription = useCallback(async (newTier, paymentToken) => {
    if (!carrierId) return { error: 'No carrier ID' }

    const { data, error } = await supabase.functions.invoke('activate-subscription', {
      body: {
        carrier_id:    carrierId,
        plan:          newTier,
        payment_token: paymentToken,
      },
    })

    if (error || !data?.success) {
      return { error: data?.error ?? error?.message ?? 'Activation failed' }
    }

    // Refresh local subscription state after server activation
    await fetchSubscription()
    return { data }
  }, [carrierId, fetchSubscription])

  // ── Increment monthly bid counter (Basic / Trial) ─────────────
  const incrementBidCount = useCallback(async () => {
    if (!subscription?.id) return
    const newCount = (subscription.monthly_bid_count || 0) + 1
    await supabase.from('carrier_subscriptions')
      .update({ monthly_bid_count: newCount })
      .eq('id', subscription.id)
    setSubscription(prev => ({ ...prev, monthly_bid_count: newCount }))
  }, [subscription])

  // ── Derived values ────────────────────────────────────────────
  const tier = subscription?.subscription_tier || 'trial'

  const daysRemaining = (() => {
    if (tier !== 'trial' || !subscription?.trial_end_date) return 0
    const diff = new Date(subscription.trial_end_date) - new Date()
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)))
  })()

  const bidsUsedThisMonth      = subscription?.monthly_bid_count || 0
  const bidsRemainingThisMonth = Math.max(0, (BID_LIMIT[tier] || 0) - bidsUsedThisMonth)

  // ── Gate functions ────────────────────────────────────────────
  const canBid = () => {
    if (tier === 'expired') return false
    if (tier === 'basic' || tier === 'trial') return bidsUsedThisMonth < BID_LIMIT[tier]
    return true
  }

  const canAddTruck = (currentCount) => {
    if (tier === 'expired') return false
    const limit = TRUCK_LIMIT[tier]
    return limit === Infinity ? true : currentCount < limit
  }

  const canPostTrip      = () => tier !== 'expired'
  const canAccessSADC    = () => tier === 'enterprise'
  const canAccessAnalytics = () => ['pro', 'enterprise'].includes(tier)

  return {
    subscription,
    loading,
    currentTier:              tier,
    daysRemaining,
    bidsUsedThisMonth,
    bidsRemainingThisMonth,
    truckLimit:               TRUCK_LIMIT[tier] || 2,
    canBid,
    canAddTruck,
    canPostTrip,
    canAccessSADC,
    canAccessAnalytics,
    createTrialSubscription,
    upgradeSubscription,
    incrementBidCount,
    refetch:                  fetchSubscription,
  }
}
