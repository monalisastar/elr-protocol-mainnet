// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/proxy/transparent/ProxyAdmin.sol";
import "@openzeppelin/contracts/governance/TimelockController.sol";

/// @notice Deploys ProxyAdmin + TimelockController for ELR ecosystem.
contract ELRAdminTimelock {
    ProxyAdmin public immutable proxyAdmin;
    TimelockController public immutable timelock;

    constructor(
        uint256 timelockDelay,
        address[] memory proposers,
        address[] memory executors,
        address admin
    ) {
        require(admin != address(0), "admin=0");

        // ProxyAdmin has NO constructor args
        proxyAdmin = new ProxyAdmin();

        // TimelockController requires 4 args:
        // delay, proposers, executors, admin
        timelock = new TimelockController(
            timelockDelay,
            proposers,
            executors,
            admin
        );
    }
}
