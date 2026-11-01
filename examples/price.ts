export function total(prices: number[]): number {
  let result = 0;
  for (const price of prices) {
    result += price;
  }
  return result;
}
