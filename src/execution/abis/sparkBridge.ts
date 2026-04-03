export const sparkBridgeAbi = [
  {
    type: "function",
    name: "withdrawSats",
    stateMutability: "nonpayable",
    inputs: [{ name: "sparkRecipient", type: "bytes" }],
    outputs: [],
  },
  {
    type: "function",
    name: "withdrawBtkn",
    stateMutability: "nonpayable",
    inputs: [
      { name: "tokenAddress", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "sparkRecipient", type: "bytes" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "tokenBySparkId",
    stateMutability: "view",
    inputs: [{ name: "sparkTokenId", type: "bytes32" }],
    outputs: [{ name: "", type: "address" }],
  },
] as const;
