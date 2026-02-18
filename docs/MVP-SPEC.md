# Open Claw Bot MVP Spec

Project codename: kilo-mcclain-clawdbot

## Goal
Maximize trade value progression from a single red paper clip while keeping execution policy-compliant through a human-in-the-loop model.

## System Components
- Trade Brain: valuation, lead scoring, recommendation ranking
- Compliance Guard: per-platform policy checks before any outbound action
- Execution Layer: human operators for negotiation, pickups, handoffs
- Evidence Layer: media proof, receipts, chain-of-custody logs
- KPI Layer: value multiple, cycle time, close rate, fraud loss

## Core States
`seeded -> sourcing -> screened -> negotiating -> accepted_pending_verification -> verified -> completed`

Failure states: `failed`, `disputed`

## Scoring Formula (v1)
`trade_score = 0.35*value_gain + 0.20*close_prob + 0.15*liquidity + 0.10*story_value - 0.10*fraud_risk - 0.10*time_cost`

## Initial Success Targets (30 days)
- At least 8 completed trades
- Median cycle time under 4 days
- At least 2.5x value multiple
- Fraud/chargeback loss under 5%
