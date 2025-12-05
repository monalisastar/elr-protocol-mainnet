ELR Protocol – System Architecture

ELR Protocol is a modular rewards ecosystem designed for real-world commerce.
Its architecture is intentionally layered, secure, and upgrade-friendly while keeping core contracts immutable.

This document provides:

High-level system overview

Contract relationships

Reward flow

Security boundaries

Module interactions

🧱 1. System Overview Diagram
graph TD

    %% Core Layer
    A[EloreToken] --> D[RewardDistributor]
    B[MerchantRegistry] --> C[CashbackEngine]
    D --> C

    %% Engagement Modules
    C --> D
    E[Staking] --> D
    F[LoyaltyStreaks] --> D
    G[UserLevels] --> D
    H[ReferralRewards] --> D
    I[RandomBonus] --> D
    J[PurchaseQuests] --> D
    K[MerchantStaking] --> D

    %% Admin
    L[ProxyAdmin + Timelock] --> B
    L --> D
    L --> C
    L --> E


Explanation:

Token → supplies value for rewards

Registry → manages merchant KYB + tiers

Distributor → central reward accounting

Modules → allocate rewards but cannot withdraw tokens

Timelock → controls sensitive admin operations

This separation enforces security boundaries.

🧩 2. Layered Architecture

ELR consists of 3 distinct layers.

🟩 Layer 1 — Core (Never upgraded, foundation)
Contract	Role	Security Properties
EloreToken	Main reward token	No mint, no tax, no blacklist
MerchantRegistry	KYB, merchant tiers, blacklist	Signature-based verification, no external calls
RewardDistributor	Stores the entire reward pool, allocates rewards	nonReentrant, no owner withdrawals, nonce replay protection

This layer is immutable and must be deployed first.

🟦 Layer 2 — Protocol Modules (Optional / Pluggable)
Module	Purpose
CashbackEngine	Purchase → tier → reward
Staking	Token-based reward generation
LoyaltyStreaks	Daily/weekly streak incentives
UserLevels	Progression + level-based bonuses
ReferralRewards	Referrer/referee system
RandomBonus	Random reward multipliers
PurchaseQuests	Gamified missions
MerchantStaking	Merchant loyalty commitments

All modules call RewardDistributor but cannot withdraw tokens.

They operate as extensions, not dependencies.

🟥 Layer 3 — Governance & Security
Component	Description
Timelock	Delays admin actions for transparency
ProxyAdmin	Controls upgradeable modules (not L1 contracts)
KYB Signer	Approves merchants via ECDSA signatures
Module Whitelist	Only approved modules may allocate rewards

This layer ensures governance safety.

🔄 3. Reward Flow Diagram
sequenceDiagram
    participant U as User
    participant M as Merchant
    participant R as MerchantRegistry
    participant C as CashbackEngine
    participant D as RewardDistributor
    participant T as EloreToken

    U->>M: Makes purchase
    M->>R: Merchant tier lookup
    R-->>C: Returns Tier + Cashback %
    C->>D: allocateFromModule(user, amount)
    D->>D: Record earned rewards (earned += x)
    U->>D: claimRewards()
    D->>T: Transfer ELR tokens to user


This illustrates:

Tier checking

Cashback calculation

Reward allocation

User claiming

Secure token transfer

🔐 4. Security Boundaries
flowchart TB

subgraph Core Layer (Secure)
    RT[RewardDistributor]
    MR[MerchantRegistry]
    ET[EloreToken]
end

subgraph Modules (Restricted)
    CB[CashbackEngine]
    ST[Staking]
    RR[ReferralRewards]
    LB[LoyaltyStreaks]
end

subgraph Governance
    TL[Timelock]
    MS[Multisig Owner]
end

CB --> RT
ST --> RT
RR --> RT
LB --> RT

TL --> CB
TL --> ST
TL --> RT
TL --> MR


Key Rules:

Modules cannot withdraw tokens

Distributor only pays via claimRewards()

Registry only updates state via signed KYB operations

Timelock controls sensitive admin functions

📦 5. Contract Dependency Summary
Contract	Depends On	Notes
EloreToken	None	Immutable
MerchantRegistry	KYB signer	ECDSA-secured
RewardDistributor	Token, KYB signer, modules	Nonce, replay, allocation limits
CashbackEngine	Registry, Distributor, Token	Computes cashback flow
Modules	Distributor	All allocations flow through Distributor
🧮 6. Why the Architecture Is Safe
✔ Core contracts are immutable

No upgrades → no rug pull risk.

✔ RewardDistributor has no withdrawal by owner

Tokens can only leave through user claims.

✔ Modules cannot drain funds

They can only allocate, not transfer.

✔ KYB protection

Prevents malicious merchants.

✔ Timelock & multisig

Removes single-point-of-failure risks.

✔ ECDSA + nonces

Stops signature replay attacks.

✔ ReentrancyGuard

Prevents recursive claim exploits.

🧪 7. Testing Architecture

The test suite includes:

Reentrancy attacks

Module impersonation

Signature replay

Pool drain attempts

Full e2e purchase → claim → staking flows

Fuzzing reward calculations

Everything is validated via:

npx hardhat test

🎯 Summary

ELR Protocol’s architecture is:

Modular

Secure

Immutable at core

Upgrade-friendly at edges

CEX-compliant

Auditor-friendly

This document demonstrates the professional engineering standards of the project.