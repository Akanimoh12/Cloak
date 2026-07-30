// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {
    Nox,
    eint256,
    euint256,
    externalEint256,
    externalEuint256
} from "@iexec-nox/nox-protocol-contracts/contracts/sdk/Nox.sol";
import {IV3SwapRouter} from "./interfaces/IV3SwapRouter.sol";
import {IUniswapV3PoolMinimal} from "./interfaces/IUniswapV3PoolMinimal.sol";

/// @title CloakVault
/// @notice Vault with public NAV and encrypted strategy. Rebalance intents are
/// aggregated while encrypted; only the net delta is revealed and settled on Uniswap V3.
contract CloakVault is ERC20, Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    IERC20 public immutable baseAsset;
    IERC20 public immutable targetAsset;
    IV3SwapRouter public immutable router;
    IUniswapV3PoolMinimal public immutable pool;
    uint24 public immutable poolFee;
    bool public immutable baseIsToken0;

    address public manager;
    address public keeper;

    uint256 public epoch;
    bool public epochClosed;
    mapping(uint256 => uint256) public epochIntentCount;
    mapping(address => bool) public isAuditor;

    eint256 private _netDelta;
    euint256 private _strategyState;

    uint8 private immutable _shareDecimals;

    event Deposited(address indexed lp, uint256 assets, uint256 shares);
    event Withdrawn(address indexed lp, uint256 shares, uint256 assets);
    event IntentSubmitted(uint256 indexed epoch, uint256 intentCount, bytes32 netDeltaHandle);
    event EpochClosed(uint256 indexed epoch, bytes32 netDeltaHandle);
    event RebalanceExecuted(uint256 indexed epoch, int256 netDelta, uint256 amountOut);
    event StrategyStateUpdated(bytes32 strategyHandle);
    event AuditorGranted(address indexed auditor);
    event AuditorRevoked(address indexed auditor);
    event RolesUpdated(address manager, address keeper);

    error NotManager();
    error NotKeeper();
    error EpochNotClosed();
    error EpochAlreadyClosed();
    error NothingToSettle();
    error InsufficientIdleBase();

    modifier onlyManager() {
        if (msg.sender != manager) revert NotManager();
        _;
    }

    modifier onlyKeeper() {
        if (msg.sender != keeper) revert NotKeeper();
        _;
    }

    constructor(
        IERC20 baseAsset_,
        IERC20 targetAsset_,
        IV3SwapRouter router_,
        IUniswapV3PoolMinimal pool_,
        uint24 poolFee_,
        address manager_,
        address keeper_
    ) ERC20("Cloak Vault Share", "clkSHARE") Ownable(msg.sender) {
        baseAsset = baseAsset_;
        targetAsset = targetAsset_;
        router = router_;
        pool = pool_;
        poolFee = poolFee_;
        manager = manager_;
        keeper = keeper_;
        _shareDecimals = IERC20Metadata(address(baseAsset_)).decimals();
        baseIsToken0 = address(pool_) != address(0)
            ? pool_.token0() == address(baseAsset_)
            : true;

        // encrypted state never defaults to zero, initialize and re-permission it
        _netDelta = Nox.toEint256(0);
        Nox.allowThis(_netDelta);
        Nox.allow(_netDelta, manager_);
    }

    function decimals() public view override returns (uint8) {
        return _shareDecimals;
    }

    function deposit(uint256 assets) external nonReentrant returns (uint256 shares) {
        uint256 supply = totalSupply();
        shares = supply == 0 ? assets : Math.mulDiv(assets, supply, totalAssets());
        baseAsset.safeTransferFrom(msg.sender, address(this), assets);
        _mint(msg.sender, shares);
        emit Deposited(msg.sender, assets, shares);
    }

    function withdraw(uint256 shares) external nonReentrant returns (uint256 assets) {
        assets = Math.mulDiv(shares, totalAssets(), totalSupply());
        _burn(msg.sender, shares);
        if (baseAsset.balanceOf(address(this)) < assets) revert InsufficientIdleBase();
        baseAsset.safeTransfer(msg.sender, assets);
        emit Withdrawn(msg.sender, shares, assets);
    }

    function totalAssets() public view returns (uint256) {
        uint256 baseBal = baseAsset.balanceOf(address(this));
        uint256 targetBal = targetAsset.balanceOf(address(this));
        return baseBal + _valueTargetInBase(targetBal);
    }

    function sharePrice() external view returns (uint256) {
        uint256 supply = totalSupply();
        if (supply == 0) return 10 ** _shareDecimals;
        return Math.mulDiv(totalAssets(), 10 ** _shareDecimals, supply);
    }

    function _valueTargetInBase(uint256 targetBal) internal view returns (uint256) {
        if (targetBal == 0 || address(pool) == address(0)) return 0;
        (uint160 sqrtPriceX96, , , , , , ) = pool.slot0();
        uint256 sqrtP = uint256(sqrtPriceX96);
        if (baseIsToken0) {
            return Math.mulDiv(Math.mulDiv(targetBal, 1 << 96, sqrtP), 1 << 96, sqrtP);
        }
        return Math.mulDiv(Math.mulDiv(targetBal, sqrtP, 1 << 96), sqrtP, 1 << 96);
    }

    function submitIntent(
        externalEint256 handle,
        bytes calldata handleProof
    ) external onlyManager {
        if (epochClosed) revert EpochAlreadyClosed();
        eint256 delta = Nox.fromExternal(handle, handleProof);
        _netDelta = Nox.add(_netDelta, delta);
        Nox.allowThis(_netDelta);
        Nox.allow(_netDelta, manager);
        uint256 count = ++epochIntentCount[epoch];
        emit IntentSubmitted(epoch, count, eint256.unwrap(_netDelta));
    }

    function submitStrategyState(
        externalEuint256 handle,
        bytes calldata handleProof
    ) external onlyManager {
        _strategyState = Nox.fromExternal(handle, handleProof);
        Nox.allowThis(_strategyState);
        Nox.allow(_strategyState, manager);
        emit StrategyStateUpdated(euint256.unwrap(_strategyState));
    }

    function netDeltaHandle() external view returns (bytes32) {
        return eint256.unwrap(_netDelta);
    }

    function strategyStateHandle() external view returns (bytes32) {
        return euint256.unwrap(_strategyState);
    }

    function closeEpoch() external onlyKeeper {
        if (epochClosed) revert EpochAlreadyClosed();
        if (epochIntentCount[epoch] == 0) revert NothingToSettle();
        Nox.allowPublicDecryption(_netDelta);
        epochClosed = true;
        emit EpochClosed(epoch, eint256.unwrap(_netDelta));
    }

    function executeRebalance(
        bytes calldata decryptionProof,
        uint256 amountOutMinimum
    ) external onlyKeeper nonReentrant {
        if (!epochClosed) revert EpochNotClosed();
        // proof is verified on-chain, the keeper cannot fake the plaintext
        int256 delta = Nox.publicDecrypt(_netDelta, decryptionProof);

        uint256 amountOut = 0;
        if (delta > 0) {
            amountOut = _swap(baseAsset, targetAsset, uint256(delta), amountOutMinimum);
        } else if (delta < 0) {
            amountOut = _swap(targetAsset, baseAsset, uint256(-delta), amountOutMinimum);
        }
        emit RebalanceExecuted(epoch, delta, amountOut);

        epoch += 1;
        epochClosed = false;
        _netDelta = Nox.toEint256(0);
        Nox.allowThis(_netDelta);
        Nox.allow(_netDelta, manager);
    }

    function _swap(
        IERC20 tokenIn,
        IERC20 tokenOut,
        uint256 amountIn,
        uint256 amountOutMinimum
    ) internal returns (uint256 amountOut) {
        tokenIn.forceApprove(address(router), amountIn);
        amountOut = router.exactInputSingle(
            IV3SwapRouter.ExactInputSingleParams({
                tokenIn: address(tokenIn),
                tokenOut: address(tokenOut),
                fee: poolFee,
                recipient: address(this),
                amountIn: amountIn,
                amountOutMinimum: amountOutMinimum,
                sqrtPriceLimitX96: 0
            })
        );
    }

    function grantAuditor(address auditor) external onlyOwner {
        isAuditor[auditor] = true;
        if (euint256.unwrap(_strategyState) != bytes32(0)) {
            Nox.allow(_strategyState, auditor);
        }
        Nox.allow(_netDelta, auditor);
        emit AuditorGranted(auditor);
    }

    function revokeAuditor(address auditor) external onlyOwner {
        isAuditor[auditor] = false;
        emit AuditorRevoked(auditor);
    }

    function setRoles(address manager_, address keeper_) external onlyOwner {
        manager = manager_;
        keeper = keeper_;
        Nox.allow(_netDelta, manager_);
        emit RolesUpdated(manager_, keeper_);
    }
}
