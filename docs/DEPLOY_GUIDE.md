ELR Protocol – Mainnet Deployment Guide

This document explains how to deploy the ELR Protocol to any EVM chain (Polygon Amoy or Polygon Mainnet).
It is written for:

Developers

Auditors

Exchanges (CEX listing teams)

Community contributors

📌 Deployment Overview

The ELR Protocol consists of three layers:

Layer 1 — Core Infrastructure (deploy first)

ELR Token (EloreToken.sol)

MerchantRegistry (MerchantRegistry.sol)

RewardDistributor (RewardDistributor.sol)

These contracts form the foundation of the ecosystem and must be deployed before any other modules.

Layer 2 — Engagement Modules (deploy after L1 is fully verified)

CashbackEngine

Staking

LoyaltyStreaks

UserLevels

ReferralRewards

RandomBonus

PurchaseQuests

MerchantStaking

ProxyAdmin + Timelock

These modules connect to L1 contracts but do not affect token security or balances.
They can be deployed gradually.

🧱 1. Prerequisites
Install dependencies:
npm install

Required environment variables:

Create .env locally (never commit to GitHub):

PRIVATE_KEY=<your deployer wallet>
RPC_URL=<polygon or amoy RPC>
POLYGONSCAN_API_KEY=<api key>

🔧 2. Deployment Sequence (Mandatory Order)

The order matters because each contract depends on previously deployed ones.

Step 1 — Deploy ELR Token
npx hardhat run scripts/deploy-elr.js --network polygon


After deployment, copy the address into:

deployments/mainnet.json


Verify:

npx hardhat verify --network polygon <ELR_TOKEN_ADDRESS>

Step 2 — Deploy MerchantRegistry

Constructor:

constructor(address kybSigner)


Deploy:

npx hardhat run scripts/deploy-registry.js --network polygon


Verify:

npx hardhat verify --network polygon <REGISTRY_ADDRESS> <KYB_SIGNER>

Step 3 — Deploy RewardDistributor

Constructor:

constructor(address elrToken, address kybSigner, address multisigOwner)


Deploy:

npx hardhat run scripts/deploy-distributor.js --network polygon


Verify:

npx hardhat verify --network polygon <DISTRIBUTOR_ADDRESS> <ELR_TOKEN> <KYB_SIGNER> <MULTISIG>


Once Distributor is deployed:

Fund reward pool (optional for testing)

Whitelist modules later (when L2 modules deploy)

🎯 Layer 1 Deployment Complete

At this stage the foundation is live and ready for exchanges, auditors, and integrators.

🔵 3. Deploy Layer 2 Modules (Optional at Launch)

These modules depend on:

EloreToken

MerchantRegistry

RewardDistributor

Use the scripts provided:

Example for Cashback:

npx hardhat run scripts/deploy-cashback.js --network polygon


Verify:

npx hardhat verify --network polygon <CASHBACK_ADDRESS> <ELR_TOKEN> <REGISTRY> <DISTRIBUTOR>


Repeat same pattern for:

Staking

LoyaltyStreaks

UserLevels

ReferralRewards

RandomBonus

PurchaseQuests

MerchantStaking

🔒 4. Post-Deployment Setup
Whitelist modules in RewardDistributor
approvedModules[moduleAddress] = true;


Only whitelisted modules can allocate rewards.

Set up admin security

Deploy ProxyAdmin + Timelock:

npx hardhat run scripts/deploy-admin-timelock.js --network polygon


Then assign ownership of:

Distributor

Registry

Staking

Cashback

To the timelock.

🟢 5. Deployment Records

After every deployment:

Update:

deployments/mainnet.json


Record:

contract addresses

constructor args

deployment tx hash

verify links

block number

deployer address

This provides full transparency for auditors.

🧪 6. Running Tests Locally
npx hardhat test


Includes:

unit tests

e2e ecosystem tests

fuzzing

attack simulations (reentrancy, impersonation, replay, pool drain)

🧩 7. Contract Verification Notes

If verification fails, check:

constructor args

contract path

solc version in hardhat.config

enabled optimizer (same as deployment)

verify after 5–10 confirmations

📘 8. FAQ
Q: Which contracts must exist before mainnet launching publicly?

Only Layer 1 (Token, Registry, Distributor)

Q: Can we deploy Cashback and others later?

Yes — they are modular and independent.

Q: Can the Distributor hold all rewards?

Yes — it is the only pool contract.