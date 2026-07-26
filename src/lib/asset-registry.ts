import type { NormalizedTransaction } from "@/lib/schemas";

export const SUPPORTED_ASSET_REGISTRY = {
  ETH: {
    assetId: "eip155:1/slip44:60",
    symbol: "ETH",
    decimals: 18,
    standard: "native",
  },
  WETH: {
    assetId:
      "eip155:1/erc20:0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
    symbol: "WETH",
    decimals: 18,
    standard: "erc20",
  },
  USDC: {
    assetId:
      "eip155:1/erc20:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
    symbol: "USDC",
    decimals: 6,
    standard: "erc20",
  },
  USDT: {
    assetId:
      "eip155:1/erc20:0xdac17f958d2ee523a2206206994597c13d831ec7",
    symbol: "USDT",
    decimals: 6,
    standard: "erc20",
  },
} as const;

export type SupportedAsset =
  (typeof SUPPORTED_ASSET_REGISTRY)[keyof typeof SUPPORTED_ASSET_REGISTRY];

type AssetDelta = NormalizedTransaction["assetDeltas"][number];

const ASSET_BY_ID = new Map<string, SupportedAsset>(
  Object.values(SUPPORTED_ASSET_REGISTRY).map((asset) => [
    asset.assetId,
    asset,
  ]),
);

export function inspectSupportedAsset(delta: AssetDelta):
  | { supported: true; asset: SupportedAsset }
  | { supported: false; reason: string } {
  const asset = ASSET_BY_ID.get(delta.assetId.toLowerCase());

  if (!asset) {
    return {
      supported: false,
      reason: `${delta.symbol} is outside the ETH, WETH, USDC, and USDT registry.`,
    };
  }

  if (
    delta.symbol !== asset.symbol ||
    delta.decimals !== asset.decimals ||
    delta.standard !== asset.standard
  ) {
    return {
      supported: false,
      reason:
        `${delta.assetId} metadata does not match the registry ` +
        `(${asset.symbol}, ${asset.decimals} decimals, ${asset.standard}).`,
    };
  }

  return { supported: true, asset };
}

