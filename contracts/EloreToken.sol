// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract EloreToken is ERC20 {
    constructor() ERC20("Elore Token", "ELR") {
        // Mint 500 million ELR (500,000,000 * 10^18)
        _mint(msg.sender, 500_000_000 * 10 ** decimals());
    }
}
