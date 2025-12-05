ELR Protocol – Security Overview

This document outlines the security architecture, threat model, protections, and best practices of the ELR Protocol.
It is intended for:

Security auditors

CEX due-diligence teams

Contributors

White-hat reviewers

Community validators

🧱 1. Architecture Summary

The ELR Protocol consists of three security layers:

Layer 1 — Core, Immutable Infrastructure

EloreToken

MerchantRegistry

RewardDistributor

These contracts form the foundation of the protocol.
They contain no upgradeable logic and no hidden owner withdrawal paths.

Layer 2 — Engagement Modules (Optional Extensions)

CashbackEngine

Staking

LoyaltyStreaks

UserLevels

ReferralRewards

RandomBonus

PurchaseQuests

MerchantStaking

These modules interact with the Distributor but cannot withdraw user funds.

Layer 3 — Administrative Controls

ProxyAdmin & Timelock

KYB signer

Module whitelisting

All privileged access is time-locked or validated via ECDSA signatures.

🛡️ 2. Threat Model

The protocol is designed to defend against:

✔ Reentrancy Attacks

All state-changing functions in the Distributor and Modules are protected by:

nonReentrant modifiers

pull-based reward claims

no external token callbacks

✔ Signature Replay Attacks

RewardDistributor uses:

ECDSA

hashed message structure

per-user nonce tracking

backend signer whitelisting

✔ Unauthorized Module Access

Only pre-approved modules may call:

allocateFromModule()


All modules must be whitelisted manually by the owner.

✔ Impersonation Attacks

MerchantRegistry requires:

valid KYB signatures

merchant address cannot self-approve

strict blacklisting system

✔ Pool Drain Attacks

RewardDistributor:

cannot transfer tokens except as rewards

has no owner withdrawal function

has no arbitrary transfer capability

reward allocations are bounded

✔ Integer Overflow / Underflow

Solidity ^0.8.x includes built-in overflow checks.

✔ Logic Corruption

Contract components are fully modular, so faults in Layer 2 cannot affect:

token supply

reward pool integrity

registry data

🔍 3. Privileged Roles
1. Deployer (temporary control)

Used only during deployment.
Recommended to transfer privileged roles to a multisig or timelock.

2. Multisig Owner (long-term governance)

Controls:

module approvals

KYB signer updates

timelock configuration

emergency pause (if implemented)

3. KYB Signer

Responsible for:

merchant approvals

anti-fraud merchant verification

4. Approved Modules

Whitelist-controlled.
Only these can allocate rewards:

CashbackEngine

StakeEngine

ReferralRewards

etc.

No module has permission to move tokens outside reward allocation logic.

🔄 4. Security Properties of Core Contracts
EloreToken

No minting after initial supply

No hidden tax functions

No blacklist logic

No ownership backdoors

MerchantRegistry

Requires cryptographic KYB approval

Blacklist protection

Tiered merchant score system

No state-altering external calls

RewardDistributor

Token-safe: cannot drain pool

Non-reentrant

Nonce-protected signed claims

Whitelisted modules only

No owner withdrawals

Strict reward accounting: earned vs claimed

🧪 5. Testing Summary

The repository includes:

Unit Tests

Registry

Distributor

Cashback

Staking

Vesting

End-to-End Tests

Purchase → reward allocation → claim

Staking → reward generation

Vesting → release/revoke flow

Attack Simulations

Reentrancy attacks

Module impersonation attempts

Signature replay

Pool drain scenarios

Fuzz Tests

distributor reward allocations

staking reward calculations

These tests run automatically with:

npx hardhat test

📜 6. Best Practices
✔ Move ownership to a multisig

Recommended: 2/3 or 3/5 multi-sign wallet.

✔ Deploy ProxyAdmin & Timelock

Provides:

delayed admin actions

transparent governance

safer upgrades (only for modules)

✔ Freeze core contracts

Token, Registry, and Distributor have no admin-controlled destructive functions.

✔ Verify all deployments

Mainnet deployments must be verified on:

Polygonscan

Sourcify

✔ Maintain deployment transparency

Update deployments/*.json after every deployment.

🧯 7. Emergency Response Policy

If a vulnerability is discovered:

Report privately via security@ (email can be added later)

ELR team will:

coordinate with auditors

notify partners/exchanges if needed

execute timelock-based fixes

Public disclosure will occur after a patch is applied.

Reward for responsible disclosure: Eligible for bounty (program TBD).

💬 8. Contact

For security-related communication:

security@elrprotocol.com (njatabrian648@gmail.com)