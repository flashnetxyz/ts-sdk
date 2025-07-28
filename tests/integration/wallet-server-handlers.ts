import { IssuerSparkWallet } from "@buildonspark/issuer-sdk";

const WALLET_SERVER_URL = "http://localhost:3456";
const GENERATE_FUNDED_MNEMONICS_URL = `${WALLET_SERVER_URL}/setup/generate-funded-mnemonics`;
const CLEAR_CACHE_URL = `${WALLET_SERVER_URL}/cache/clear`;

export interface GetFundedWalletMnemonicsResponse {
  mnemonics: string[];
  tokenIdentifier: string;
}

export async function getFundedWalletInfo(satsAmount: number, tokensAmount: number): Promise<{mnemonic: string, tokenIdentifier: string}> {
  let response = await fetch(GENERATE_FUNDED_MNEMONICS_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      count: 1,
      satsAmount,
      tokensAmount,
    }),
  })

  if (!response.ok) {
    throw new Error(`Failed to generate funded mnemonics: ${response.statusText}`);
  }

  let data = await response.json() as GetFundedWalletMnemonicsResponse;

  return {
    mnemonic: data.mnemonics[0]!,
    tokenIdentifier: data.tokenIdentifier,
  }
}

export async function clearWalletServerCache() {
  let response = await fetch(CLEAR_CACHE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to clear wallet server cache: ${response.statusText}`);
  }

  return response.json();
}

