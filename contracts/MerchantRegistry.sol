// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";


/// ---------------------------------------------------------------------------
///                    ELR Merchant Registry (Final Clean Version)
/// ---------------------------------------------------------------------------
/// ⚡ No owner  
/// ⚡ KYB signature-based merchant approval  
/// ⚡ Auto-tier upgrade system  
/// ⚡ Blacklist / unblacklist via signatures  
/// ⚡ Signer rotation via signature (DAO/multisig-ready)  
/// ⚡ Hardhat 3 compatible  
/// ---------------------------------------------------------------------------
contract MerchantRegistry {
    using ECDSA for bytes32;

    // -----------------------------------------------------------------------
    // TIER SYSTEM
    // -----------------------------------------------------------------------
    enum Tier {
        NONE,
        SILVER,
        GOLD,
        PLATINUM
    }

    uint256 public constant SILVER_THRESHOLD   = 10_000 ether;
    uint256 public constant GOLD_THRESHOLD     = 50_000 ether;
    uint256 public constant PLATINUM_THRESHOLD = 200_000 ether;

    // -----------------------------------------------------------------------
    // DATA STRUCTURE
    // -----------------------------------------------------------------------
    struct Merchant {
        bool exists;
        bool approved;
        bool blacklisted;
        Tier tierLevel;
        uint256 totalVolume;
        string name;
        string website;
    }

    mapping(address => Merchant) public merchants;

    // KYB Signer
    address public kybSigner;

    // -----------------------------------------------------------------------
    // EVENTS
    // -----------------------------------------------------------------------
    event MerchantRegistered(address indexed merchant, string name);
    event MerchantApproved(address indexed merchant, Tier tier);
    event MerchantBlacklisted(address indexed merchant);
    event MerchantUnblacklisted(address indexed merchant);
    event TierUpgraded(address indexed merchant, Tier newTier);
    event MerchantUpdated(address indexed merchant, string newName, string newWebsite);
    event KYBSignerRotated(address newSigner);

    // -----------------------------------------------------------------------
    // ERRORS
    // -----------------------------------------------------------------------
    error NotRegistered();
    error InvalidSigner();
    error BlacklistedMerchant();
    error InvalidTier();
    error ZeroAddress();

    // -----------------------------------------------------------------------
    // CONSTRUCTOR
    // -----------------------------------------------------------------------
    constructor(address _kybSigner) {
        if (_kybSigner == address(0)) revert ZeroAddress();
        kybSigner = _kybSigner;
    }

    // -----------------------------------------------------------------------
    // INTERNAL SIGNATURE VERIFICATION
    // -----------------------------------------------------------------------
    function _verify(bytes32 hash, bytes calldata sig) internal view {
        hash = hash.toEthSignedMessageHash();
        if (hash.recover(sig) != kybSigner) revert InvalidSigner();
    }

    // -----------------------------------------------------------------------
    // MERCHANT SELF-REGISTRATION
    // -----------------------------------------------------------------------
    function registerMerchant(string calldata name, string calldata website) external {
        if (merchants[msg.sender].exists) revert("Already registered");

        merchants[msg.sender] = Merchant({
            exists: true,
            approved: false,
            blacklisted: false,
            tierLevel: Tier.NONE,
            totalVolume: 0,
            name: name,
            website: website
        });

        emit MerchantRegistered(msg.sender, name);
    }

    // -----------------------------------------------------------------------
    // APPROVE MERCHANT (via KYB signature)
    // -----------------------------------------------------------------------
    function approveMerchantBySig(
        address merchant,
        Tier tier,
        bytes calldata sig
    ) external {
        if (!merchants[merchant].exists) revert NotRegistered();
        if (merchants[merchant].blacklisted) revert BlacklistedMerchant();
        if (tier == Tier.NONE) revert InvalidTier();

        bytes32 hash = keccak256(
            abi.encodePacked("APPROVE_MERCHANT", merchant, uint8(tier), address(this))
        );

        _verify(hash, sig);

        merchants[merchant].approved = true;
        merchants[merchant].tierLevel = tier;

        emit MerchantApproved(merchant, tier);
    }

    // -----------------------------------------------------------------------
    // BLACKLIST MERCHANT
    // -----------------------------------------------------------------------
    function blacklistBySig(address merchant, bytes calldata sig) external {
        if (!merchants[merchant].exists) revert NotRegistered();

        bytes32 hash = keccak256(
            abi.encodePacked("BLACKLIST", merchant, address(this))
        );

        _verify(hash, sig);

        merchants[merchant].blacklisted = true;
        merchants[merchant].approved = false;

        emit MerchantBlacklisted(merchant);
    }

    // -----------------------------------------------------------------------
    // UNBLACKLIST MERCHANT
    // -----------------------------------------------------------------------
    function unblacklistBySig(address merchant, bytes calldata sig) external {
        if (!merchants[merchant].exists) revert NotRegistered();

        bytes32 hash = keccak256(
            abi.encodePacked("UNBLACKLIST", merchant, address(this))
        );

        _verify(hash, sig);

        merchants[merchant].blacklisted = false;

        emit MerchantUnblacklisted(merchant);
    }

    // -----------------------------------------------------------------------
    // UPDATE VOLUME + AUTO TIER UPGRADE
    // -----------------------------------------------------------------------
    function updateVolumeAndTier(address merchant, uint256 amount) external {
        Merchant storage m = merchants[merchant];
        if (!m.exists) revert NotRegistered();

        m.totalVolume += amount;

        Tier newTier = m.tierLevel;

        if (m.totalVolume >= PLATINUM_THRESHOLD) newTier = Tier.PLATINUM;
        else if (m.totalVolume >= GOLD_THRESHOLD) newTier = Tier.GOLD;
        else if (m.totalVolume >= SILVER_THRESHOLD) newTier = Tier.SILVER;

        if (newTier != m.tierLevel) {
            m.tierLevel = newTier;
            emit TierUpgraded(merchant, newTier);
        }
    }

    // -----------------------------------------------------------------------
    // ROTATE KYB SIGNER (DAO / MULTISIG)
    // -----------------------------------------------------------------------
    function rotateSignerBySig(address newSigner, bytes calldata sig) external {
        if (newSigner == address(0)) revert ZeroAddress();

        bytes32 hash = keccak256(
            abi.encodePacked("ROTATE_KYB_SIGNER", newSigner, address(this))
        );

        _verify(hash, sig);

        kybSigner = newSigner;
        emit KYBSignerRotated(newSigner);
    }

    // -----------------------------------------------------------------------
    // FULL STRUCT GETTER (REQUIRED FOR CASHBACK ENGINE)
    // -----------------------------------------------------------------------
    function getMerchant(address merchant)
        external
        view
        returns (
            bool exists,
            bool approved,
            bool blacklisted,
            Tier tierLevel,
            uint256 totalVolume,
            string memory name,
            string memory website
        )
    {
        Merchant storage m = merchants[merchant];
        return (
            m.exists,
            m.approved,
            m.blacklisted,
            m.tierLevel,
            m.totalVolume,
            m.name,
            m.website
        );
    }

    // -----------------------------------------------------------------------
    // SIMPLE VIEW: APPROVED?
    // -----------------------------------------------------------------------
    function isMerchantApproved(address merchant) external view returns (bool) {
        Merchant storage m = merchants[merchant];
        return m.exists && m.approved && !m.blacklisted;
    }
}
