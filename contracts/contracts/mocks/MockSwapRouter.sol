// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IV3SwapRouter} from "../interfaces/IV3SwapRouter.sol";

// local tests only, fills 1:1 from its own inventory
contract MockSwapRouter is IV3SwapRouter {
    using SafeERC20 for IERC20;

    function exactInputSingle(
        ExactInputSingleParams calldata params
    ) external payable returns (uint256 amountOut) {
        IERC20(params.tokenIn).safeTransferFrom(msg.sender, address(this), params.amountIn);
        amountOut = params.amountIn;
        require(amountOut >= params.amountOutMinimum, "slippage");
        IERC20(params.tokenOut).safeTransfer(params.recipient, amountOut);
    }
}
