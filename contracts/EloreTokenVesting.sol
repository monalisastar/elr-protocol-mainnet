// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

contract EloreTokenVesting is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    IERC20 public immutable token;

    struct VestingSchedule {
        uint256 totalAmount;
        uint256 released;
        uint256 start;
        uint256 cliff;
        uint256 duration;
        bool revocable;
        bool revoked;
    }

    mapping(address => VestingSchedule) public vestings;

    event VestingCreated(
        address indexed beneficiary,
        uint256 totalAmount,
        uint256 start,
        uint256 cliff,
        uint256 duration,
        bool revocable
    );

    event TokensReleased(address indexed beneficiary, uint256 amount);
    event VestingRevoked(address indexed beneficiary, uint256 refunded);
    event BeneficiaryUpdated(address indexed oldUser, address indexed newUser);

    constructor(address _token) {
        require(_token != address(0), "Token=0");
        token = IERC20(_token);
    }

    function createVesting(
        address beneficiary,
        uint256 totalAmount,
        uint256 start,
        uint256 cliffDuration,
        uint256 duration,
        bool revocable
    ) external onlyOwner {
        require(beneficiary != address(0), "Beneficiary=0");
        require(totalAmount > 0, "Amount=0");
        require(duration > 0, "Duration=0");
        require(cliffDuration <= duration, "Cliff>Duration");
        require(vestings[beneficiary].totalAmount == 0, "Exists");

        vestings[beneficiary] = VestingSchedule({
            totalAmount: totalAmount,
            released: 0,
            start: start,
            cliff: start + cliffDuration,
            duration: duration,
            revocable: revocable,
            revoked: false
        });

        emit VestingCreated(
            beneficiary,
            totalAmount,
            start,
            start + cliffDuration,
            duration,
            revocable
        );
    }

    function release(address beneficiary) external nonReentrant {
        VestingSchedule storage s = vestings[beneficiary];
        require(s.totalAmount > 0, "No vesting");
        require(!s.revoked, "Revoked");

        uint256 vested = _vestedAmount(s);
        require(vested > s.released, "Nothing to release");

        uint256 unreleased = vested - s.released;
        s.released = vested;

        token.safeTransfer(beneficiary, unreleased);

        emit TokensReleased(beneficiary, unreleased);
    }

    function _vestedAmount(VestingSchedule memory s) internal view returns (uint256) {
        if (s.revoked) return s.released;

        uint256 current = block.timestamp;

        if (current < s.cliff) {
            return 0;
        }

        if (current >= s.start + s.duration) {
            return s.totalAmount;
        }

        uint256 timePassed = current - s.start;
        return (s.totalAmount * timePassed) / s.duration;
    }

    function revoke(address beneficiary) external onlyOwner {
        VestingSchedule storage s = vestings[beneficiary];
        require(s.revocable, "Not revocable");
        require(!s.revoked, "Already revoked");

        uint256 vested = _vestedAmount(s);
        uint256 refund = s.totalAmount - vested;

        s.revoked = true;
        s.totalAmount = vested;

        if (refund > 0) {
            token.safeTransfer(owner(), refund);
        }

        emit VestingRevoked(beneficiary, refund);
    }

    function updateBeneficiary(address oldUser, address newUser)
        external
        onlyOwner
    {
        require(newUser != address(0), "New=0");
        require(vestings[oldUser].totalAmount > 0, "No vesting");

        vestings[newUser] = vestings[oldUser];
        delete vestings[oldUser];

        emit BeneficiaryUpdated(oldUser, newUser);
    }

    function releasableAmount(address beneficiary) external view returns (uint256) {
        VestingSchedule memory s = vestings[beneficiary];
        if (s.totalAmount == 0 || s.revoked) return 0;

        uint256 vested = _vestedAmount(s);
        if (vested <= s.released) return 0;

        return vested - s.released;
    }
}
