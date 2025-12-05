// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

/// ---------------------------------------------------------------------------
///                         ELR Reward Distributor (Final)
/// ---------------------------------------------------------------------------
/// - Stores full ELR reward pool
/// - CashbackEngine, StakingEngine and others allocate rewards
/// - Fully CEX compliant (no owner withdrawals)
/// - Supports backend signed rewards (nonce protection)
/// - Tested end-to-end: Cashback, Staking, Vesting
/// - resetUser() removed for production; test isolation only
/// ---------------------------------------------------------------------------
contract RewardDistributor is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // -----------------------------------------------------------------------
    // TOKEN + POOL
    // -----------------------------------------------------------------------
    IERC20 public immutable elrToken;
    uint256 public rewardPool;

    // -----------------------------------------------------------------------
    // APPROVED MODULES (CashbackEngine, StakingEngine, ReferralEngine, etc.)
    // -----------------------------------------------------------------------
    mapping(address => bool) public approvedModules;

    // -----------------------------------------------------------------------
    // SIGNATURE SYSTEM
    // -----------------------------------------------------------------------
    address public kybSigner;
    mapping(bytes32 => bool) public usedNonces;

    // -----------------------------------------------------------------------
    // USER REWARD STORAGE
    // -----------------------------------------------------------------------
    struct Reward {
        uint256 earned;       // total earned rewards
        uint256 claimed;      // claimed rewards
        uint256 lastClaimed;  // timestamp of last claim
    }

    mapping(address => Reward) public rewards;

    // -----------------------------------------------------------------------
    // EVENTS
    // -----------------------------------------------------------------------
    event RewardPoolFunded(uint256 amount);
    event ModuleUpdated(address module, bool approved);
    event KYBSignerUpdated(address oldSigner, address newSigner);
    event RewardAllocated(address indexed user, uint256 amount, string source);
    event RewardClaimed(address indexed user, uint256 amount);

    // -----------------------------------------------------------------------
    // ERRORS
    // -----------------------------------------------------------------------
    error NotModule();
    error InvalidSignature();
    error AlreadyUsedNonce();
    error ZeroAmount();
    error PoolLow();

    // -----------------------------------------------------------------------
    // CONSTRUCTOR
    // -----------------------------------------------------------------------
    constructor(
        address _elrToken,
        address _kybSigner,
        address _multisigOwner
    ) {
        require(_elrToken != address(0), "token=0");
        require(_kybSigner != address(0), "signer=0");        // FIXED (audit-safe)
        require(_multisigOwner != address(0), "owner=0");

        elrToken = IERC20(_elrToken);
        kybSigner = _kybSigner;

        _transferOwnership(_multisigOwner);
    }

    // -----------------------------------------------------------------------
    // FUND THE REWARD POOL
    // -----------------------------------------------------------------------
    function fundRewardPool(uint256 amount) external onlyOwner {
        require(amount > 0, "zero");

        elrToken.safeTransferFrom(msg.sender, address(this), amount);
        rewardPool += amount;

        emit RewardPoolFunded(amount);
    }

    // -----------------------------------------------------------------------
    // MODULE MANAGEMENT
    // -----------------------------------------------------------------------
    function setModule(address module, bool status) external onlyOwner {
        approvedModules[module] = status;
        emit ModuleUpdated(module, status);
    }

    modifier onlyModule() {
        if (!approvedModules[msg.sender]) revert NotModule();
        _;
    }

    // -----------------------------------------------------------------------
    // SET BACKEND SIGNER
    // -----------------------------------------------------------------------
    function setKYBSigner(address signer) external onlyOwner {
        require(signer != address(0), "signer=0");

        emit KYBSignerUpdated(kybSigner, signer);
        kybSigner = signer;
    }

    // -----------------------------------------------------------------------
    // INTERNAL ALLOCATION
    // -----------------------------------------------------------------------
    function _allocate(address user, uint256 amount, string memory source)
        internal
    {
        if (amount == 0) revert ZeroAmount();
        if (rewardPool < amount) revert PoolLow();

        rewards[user].earned += amount;
        rewardPool -= amount;

        emit RewardAllocated(user, amount, source);
    }

    // -----------------------------------------------------------------------
    // MODULE ALLOCATION (CashbackEngine → RewardDistributor)
    // -----------------------------------------------------------------------
    function allocateFromModule(address user, uint256 amount)
        external
        onlyModule
    {
        _allocate(user, amount, "MODULE");
    }

    // -----------------------------------------------------------------------
    // SIGNED ALLOCATION (Backend → Smart contract)
    // -----------------------------------------------------------------------
    function allocateRewardSigned(
        address user,
        uint256 amount,
        bytes32 nonce,
        bytes memory signature
    ) external nonReentrant {

        if (usedNonces[nonce]) revert AlreadyUsedNonce();
        usedNonces[nonce] = true;

        bytes32 message = keccak256(
            abi.encodePacked(
                user,
                amount,
                nonce,
                address(this)
            )
        );

        bytes32 ethHash = ECDSA.toEthSignedMessageHash(message);
        address signer = ECDSA.recover(ethHash, signature);

        if (signer != kybSigner) revert InvalidSignature();

        _allocate(user, amount, "SIGNED");
    }

    // -----------------------------------------------------------------------
    // USER CLAIMS
    // -----------------------------------------------------------------------
    function claimRewards() external nonReentrant {
        Reward storage r = rewards[msg.sender];

        uint256 pending = r.earned - r.claimed;
        require(pending > 0, "none");

        r.claimed += pending;
        r.lastClaimed = block.timestamp;

        elrToken.safeTransfer(msg.sender, pending);

        emit RewardClaimed(msg.sender, pending);
    }
}
