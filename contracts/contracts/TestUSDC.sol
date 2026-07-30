// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

// mintable base asset for the vault, anyone can faucet a capped amount
contract TestUSDC is ERC20, Ownable {
    uint256 public constant FAUCET_CAP = 10_000e6;

    constructor() ERC20("Test USD Coin", "tUSDC") Ownable(msg.sender) {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function faucet(uint256 amount) external {
        require(amount <= FAUCET_CAP, "faucet: max 10k per call");
        _mint(msg.sender, amount);
    }

    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }
}
